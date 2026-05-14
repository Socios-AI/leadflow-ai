// src/app/api/admin/tenants/route.ts
//
// Tenant management for Super Admins (and Hiper Admin).
//
// GET    → list tenants. SUPER_ADMIN sees only tenants they created.
//          HIPER_ADMIN sees everything, with the creator embedded.
// POST   → create a new tenant atomically. Any failure between auth user
//          creation and ai_config triggers a full rollback so we never
//          leave orphan rows. If the email exists but the previous
//          attempt left an orphan (auth user / users row with no
//          membership), we wipe it and retry — operator gets a fresh
//          password back. If the email belongs to a real, complete tenant,
//          we return 409 "email_already_exists".

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase-server";
import {
  requireSuperAdminOrHigher,
  AdminAuthError,
  generatePassword,
  buildInviteMessage,
  isHiperAdmin,
} from "@/lib/admin/platform";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "admin/tenants" });

interface CreateTenantBody {
  companyName?: string;
  ownerName?: string;
  ownerEmail?: string;
  password?: string;
  maxUsers?: number;
  plan?: "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
  locale?: "pt" | "en" | "es";
}

export async function GET() {
  try {
    const me = await requireSuperAdminOrHigher();
    const sb = getSupabaseAdmin();

    let query = sb
      .from("accounts")
      .select(
        "id, name, slug, plan, max_users, onboarding_completed_at, created_at, created_by_id"
      )
      .order("created_at", { ascending: false });

    if (!isHiperAdmin(me)) {
      query = query.eq("created_by_id", me.userId);
    }

    const { data: accounts, error } = await query;
    if (error) throw error;

    const accountIds = (accounts || []).map((a) => a.id);

    const memberCounts: Record<string, number> = {};
    if (accountIds.length > 0) {
      const { data: members } = await sb
        .from("account_members")
        .select("account_id")
        .in("account_id", accountIds);
      for (const m of members || []) {
        memberCounts[m.account_id] = (memberCounts[m.account_id] || 0) + 1;
      }
    }

    let creators: Record<string, { name: string | null; email: string }> = {};
    if (isHiperAdmin(me)) {
      const creatorIds = Array.from(
        new Set((accounts || []).map((a) => a.created_by_id).filter(Boolean) as string[])
      );
      if (creatorIds.length > 0) {
        const { data: users } = await sb
          .from("users")
          .select("id, name, email")
          .in("id", creatorIds);
        creators = Object.fromEntries(
          (users || []).map((u) => [u.id, { name: u.name, email: u.email }])
        );
      }
    }

    return NextResponse.json({
      tenants: (accounts || []).map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        plan: a.plan,
        maxUsers: a.max_users,
        memberCount: memberCounts[a.id] || 0,
        onboardingCompleted: !!a.onboarding_completed_at,
        createdAt: a.created_at,
        createdById: a.created_by_id,
        creator: a.created_by_id ? creators[a.created_by_id] || null : null,
      })),
      isHiperAdmin: isHiperAdmin(me),
    });
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(req: NextRequest) {
  // Track everything we created so we can roll back atomically on failure
  const created = {
    authUserId: null as string | null,
    userRowId: null as string | null,
    accountId: null as string | null,
    accountMemberId: null as string | null,
    aiConfigId: null as string | null,
  };
  // Used to attribute the failure in the response so the operator knows
  // where to look — they see this in the UI when something blows up.
  let step: string = "init";
  const sb = getSupabaseAdmin();

  try {
    step = "require_super_admin";
    const me = await requireSuperAdminOrHigher();
    step = "parse_body";
    const body = (await req.json().catch(() => ({}))) as CreateTenantBody;

    const companyName = (body.companyName || "").trim();
    const ownerName = (body.ownerName || "").trim();
    const ownerEmail = (body.ownerEmail || "").trim().toLowerCase();
    const maxUsers = clampInt(body.maxUsers ?? 5, 1, 200);
    const plan: CreateTenantBody["plan"] = body.plan || "STARTER";
    const locale = body.locale || "pt";

    if (companyName.length < 2)
      return NextResponse.json({ error: "invalid_company_name" }, { status: 400 });
    if (ownerName.length < 2)
      return NextResponse.json({ error: "invalid_owner_name" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
      return NextResponse.json({ error: "invalid_owner_email" }, { status: 400 });

    const password = body.password?.trim() || generatePassword();
    if (password.length < 8)
      return NextResponse.json({ error: "weak_password" }, { status: 400 });

    // ── Detect existing email and tell apart real conflict vs orphan ──
    step = "find_existing";
    const existing = await findExistingByEmail(ownerEmail);
    if (existing.complete) {
      return NextResponse.json(
        { error: "email_already_exists" },
        { status: 409 }
      );
    }
    if (existing.partial) {
      // Previous create attempt left dangling rows. Nuke them and retry.
      log.warn("cleaning orphan user before retry", {
        email: ownerEmail,
        orphan: existing.partial,
      });
      step = "cleanup_orphan";
      await cleanupOrphan(existing.partial);
    }

    // ── 1. Auth user ──
    step = "create_auth_user";
    const { data: authData, error: authError } =
      await sb.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
        user_metadata: { name: ownerName, company: companyName },
      });
    if (authError || !authData.user) {
      // If Supabase says "User already registered" it means a previous
      // orphan slipped past our cleanup. Try once more after a forced wipe.
      const msg = authError?.message?.toLowerCase() || "";
      if (msg.includes("already registered") || msg.includes("already exists")) {
        log.warn("auth user already exists — forcing cleanup and retrying", {
          email: ownerEmail,
        });
        await cleanupByEmail(ownerEmail);
        const retry = await sb.auth.admin.createUser({
          email: ownerEmail,
          password,
          email_confirm: true,
          user_metadata: { name: ownerName, company: companyName },
        });
        if (retry.error || !retry.data.user) {
          throw retry.error || new Error("auth_creation_failed_after_cleanup");
        }
        created.authUserId = retry.data.user.id;
      } else {
        throw authError || new Error("auth_creation_failed");
      }
    } else {
      created.authUserId = authData.user.id;
    }

    // Prisma fills updated_at on Prisma writes via @updatedAt, but raw
    // Supabase REST inserts do NOT — pass it explicitly here.
    const now = new Date().toISOString();

    // ── 2. Local user row ──
    step = "insert_users";
    const userId = cuid();
    const { error: uErr } = await sb.from("users").insert({
      id: userId,
      supabase_id: created.authUserId,
      email: ownerEmail,
      name: ownerName,
      platform_role: "USER",
    });
    if (uErr) throw new Error(`users insert: ${uErr.message} (code: ${uErr.code || "?"})`);
    created.userRowId = userId;

    // ── 3. Account ──
    step = "insert_accounts";
    const accountId = cuid();
    const slug = makeSlug(companyName);
    const { error: aErr } = await sb.from("accounts").insert({
      id: accountId,
      name: companyName,
      slug,
      plan,
      locale,
      timezone: "America/Sao_Paulo",
      max_users: maxUsers,
      created_by_id: me.userId,
      updated_at: now,
    });
    if (aErr) throw new Error(`accounts insert: ${aErr.message} (code: ${aErr.code || "?"})`);
    created.accountId = accountId;

    // ── 4. Membership ──
    step = "insert_account_members";
    const memberId = cuid();
    const { error: mErr } = await sb.from("account_members").insert({
      id: memberId,
      account_id: accountId,
      user_id: userId,
      role: "OWNER",
    });
    if (mErr) throw new Error(`account_members insert: ${mErr.message} (code: ${mErr.code || "?"})`);
    created.accountMemberId = memberId;

    // ── 5. AI config (non-fatal but we track it for rollback parity) ──
    step = "insert_ai_configs";
    const aiConfigId = cuid();
    const { error: cfgErr } = await sb.from("ai_configs").insert({
      id: aiConfigId,
      account_id: accountId,
      provider: "openai",
      model: "gpt-4o",
      system_prompt:
        "Você é um assistente de vendas profissional. Atenda os leads com naturalidade, entenda a necessidade e conduza ao próximo passo.",
      temperature: 0.7,
      max_tokens: 1000,
      updated_at: now,
    });
    if (cfgErr) {
      log.warn("ai_config insert failed (non-fatal)", { err: cfgErr.message });
    } else {
      created.aiConfigId = aiConfigId;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app";
    const message = buildInviteMessage({
      appUrl,
      companyName,
      ownerName,
      email: ownerEmail,
      password,
      locale,
    });

    return NextResponse.json(
      {
        ok: true,
        tenant: {
          id: accountId,
          name: companyName,
          slug,
          plan,
          maxUsers,
        },
        owner: {
          id: userId,
          email: ownerEmail,
          name: ownerName,
        },
        credentials: {
          email: ownerEmail,
          password,
          loginUrl: `${appUrl}/login`,
        },
        message,
      },
      { status: 201 }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("tenant create failed — rolling back", {
      step,
      err: errMsg,
      created,
    });
    await rollback(created);
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.code, step }, { status: err.status });
    }
    return NextResponse.json(
      { error: "internal_error", step, message: errMsg },
      { status: 500 }
    );
  }
}

// ── orphan detection & cleanup ────────────────────────────────────

interface OrphanRefs {
  userId?: string;
  authUserId?: string;
}

async function findExistingByEmail(email: string): Promise<{
  complete: boolean;
  partial: OrphanRefs | null;
}> {
  const sb = getSupabaseAdmin();

  // Look up local user
  const { data: localUser } = await sb
    .from("users")
    .select("id, supabase_id")
    .eq("email", email)
    .maybeSingle();

  // Look up auth user (Supabase Auth admin list — paginated; we filter by email)
  let authUserId: string | undefined;
  try {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (match) authUserId = match.id;
  } catch {
    /* listUsers may fail on very large tenants — non-fatal */
  }

  if (!localUser && !authUserId) {
    return { complete: false, partial: null };
  }

  // If we have a local user, check if it has any account membership
  if (localUser) {
    const { data: membership } = await sb
      .from("account_members")
      .select("id")
      .eq("user_id", localUser.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      return { complete: true, partial: null };
    }
    return {
      complete: false,
      partial: { userId: localUser.id, authUserId: localUser.supabase_id || authUserId },
    };
  }

  // Only auth user exists — pure orphan
  return { complete: false, partial: { authUserId } };
}

async function cleanupOrphan(refs: OrphanRefs): Promise<void> {
  const sb = getSupabaseAdmin();
  if (refs.userId) {
    await sb.from("account_members").delete().eq("user_id", refs.userId);
    await sb.from("users").delete().eq("id", refs.userId);
  }
  if (refs.authUserId) {
    try {
      await sb.auth.admin.deleteUser(refs.authUserId);
    } catch (err) {
      log.warn("orphan auth delete failed", {
        authUserId: refs.authUserId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function cleanupByEmail(email: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: u } = await sb
    .from("users")
    .select("id, supabase_id")
    .eq("email", email)
    .maybeSingle();
  if (u) {
    await cleanupOrphan({ userId: u.id, authUserId: u.supabase_id || undefined });
    return;
  }
  // No local user — but maybe an auth user is dangling
  try {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = list?.users?.find((x) => x.email?.toLowerCase() === email);
    if (match) await sb.auth.admin.deleteUser(match.id);
  } catch {
    /* best-effort */
  }
}

interface CreatedRefs {
  authUserId: string | null;
  userRowId: string | null;
  accountId: string | null;
  accountMemberId: string | null;
  aiConfigId: string | null;
}

async function rollback(refs: CreatedRefs): Promise<void> {
  const sb = getSupabaseAdmin();
  try {
    if (refs.aiConfigId) {
      await sb.from("ai_configs").delete().eq("id", refs.aiConfigId);
    }
    if (refs.accountMemberId) {
      await sb.from("account_members").delete().eq("id", refs.accountMemberId);
    }
    if (refs.accountId) {
      // Account cascade-deletes anything that snuck in (members, ai_config, etc.)
      await sb.from("accounts").delete().eq("id", refs.accountId);
    }
    if (refs.userRowId) {
      await sb.from("users").delete().eq("id", refs.userRowId);
    }
    if (refs.authUserId) {
      try {
        await sb.auth.admin.deleteUser(refs.authUserId);
      } catch (err) {
        log.warn("rollback auth delete failed", {
          authUserId: refs.authUserId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log.error("rollback step failed", {
      err: err instanceof Error ? err.message : String(err),
      refs,
    });
  }
}

// ── helpers ───────────────────────────────────────────────────

function clampInt(v: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function makeSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) +
    "-" +
    Date.now().toString(36)
  );
}

function cuid(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function mapError(err: unknown): NextResponse {
  if (err instanceof AdminAuthError) {
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
  const errorObj = err instanceof Error ? err : new Error(String(err));
  // Log stack trace so we can pinpoint where it blew up
  log.error("tenants handler crashed", {
    message: errorObj.message,
    name: errorObj.name,
    stack: errorObj.stack?.split("\n").slice(0, 6).join(" | "),
  });
  return NextResponse.json(
    { error: "internal_error", message: errorObj.message },
    { status: 500 }
  );
}
