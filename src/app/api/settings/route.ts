// src/app/api/settings/route.ts
//
// Workspace + profile settings. Pure Supabase REST — no Prisma.
//
//   GET    → returns account info + counts + current user profile
//   PUT    → updates account-level fields (name, timezone, locale)
//   PATCH  /api/settings/password   → handled here too with ?action=password
//                                     or via PATCH body { action: "password" }

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-server";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "settings" });

const PLAN_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 5,
  PRO: 15,
  ENTERPRISE: 50,
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabaseAdmin();
    const [accountRes, userRes, memberCountRes] = await Promise.all([
      sb
        .from("accounts")
        .select("id, name, slug, plan, timezone, locale, max_users, created_at")
        .eq("id", session.accountId)
        .maybeSingle(),
      sb
        .from("users")
        .select("id, name, email, avatar_url, supabase_id, platform_role, created_at")
        .eq("id", session.userId)
        .maybeSingle(),
      sb
        .from("account_members")
        .select("id", { count: "exact", head: true })
        .eq("account_id", session.accountId),
    ]);

    if (!accountRes.data) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const account = accountRes.data;
    const memberCount = memberCountRes.count || 0;
    const planLimit = PLAN_LIMITS[account.plan] ?? PLAN_LIMITS.FREE;
    const memberLimit = Math.max(account.max_users || 0, planLimit);

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        plan: account.plan,
        timezone: account.timezone,
        locale: account.locale,
        memberCount,
        memberLimit,
        createdAt: account.created_at,
      },
      profile: userRes.data
        ? {
            id: userRes.data.id,
            email: userRes.data.email,
            name: userRes.data.name,
            avatarUrl: userRes.data.avatar_url,
            platformRole: userRes.data.platform_role,
            createdAt: userRes.data.created_at,
          }
        : null,
    });
  } catch (err: unknown) {
    log.error("GET /api/settings failed", { err });
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as {
      target?: "account" | "profile";
      // Account fields
      name?: string;
      timezone?: string;
      locale?: string;
      // Profile fields
      profileName?: string;
    };

    const sb = getSupabaseAdmin();
    const target = body.target || "account";

    if (target === "profile") {
      const profileName = (body.profileName || "").trim();
      if (profileName.length < 1) {
        return NextResponse.json({ error: "invalid_name" }, { status: 400 });
      }
      const { error } = await sb
        .from("users")
        .update({ name: profileName })
        .eq("id", session.userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // target === "account"
    const update: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim().length > 0)
      update.name = body.name.trim();
    if (typeof body.timezone === "string") update.timezone = body.timezone;
    if (typeof body.locale === "string") update.locale = body.locale;
    update.updated_at = new Date().toISOString();

    const { error } = await sb
      .from("accounts")
      .update(update)
      .eq("id", session.accountId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    log.error("PUT /api/settings failed", { err });
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { newPassword } = (await req.json()) as { newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }
    const sb = getSupabaseAdmin();

    // Look up the Supabase user id for this session (NOT the local cuid)
    const { data: userRow } = await sb
      .from("users")
      .select("supabase_id")
      .eq("id", session.userId)
      .maybeSingle();
    if (!userRow?.supabase_id) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const { error } = await sb.auth.admin.updateUserById(userRow.supabase_id, {
      password: newPassword,
    });
    if (error) {
      log.warn("password change failed", { err: error.message });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    log.error("PATCH /api/settings failed", { err });
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}
