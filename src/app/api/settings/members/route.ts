// src/app/api/settings/members/route.ts
//
// Team members for the current workspace. Pure Supabase REST.
//
// GET    → list members (with their email/name and role)
// POST   → invite a new member: provisions auth user with generated
//          password (if not yet existing) and adds AccountMember.
//          Returns ready-to-copy invite message.
// DELETE → remove a member (cannot remove OWNER).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-server";
import {
  generatePassword,
  buildTeamInviteMessage,
} from "@/lib/admin/platform";
import { appUrlFromRequest } from "@/lib/app-url";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "settings/members" });

const PLAN_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 5,
  PRO: 15,
  ENTERPRISE: 50,
};
const VALID_ROLES = ["MEMBER", "ADMIN"] as const;
type RoleInput = (typeof VALID_ROLES)[number];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabaseAdmin();
    const { data: rows, error } = await sb
      .from("account_members")
      .select("id, user_id, role, created_at, user:users ( email, name )")
      .eq("account_id", session.accountId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return NextResponse.json({
      members: (rows || []).map((m) => {
        // Supabase's join shape can come either as a single object or an
        // array depending on relationship cardinality — normalize.
        const userField = m.user as unknown;
        const u = Array.isArray(userField)
          ? ((userField[0] as { email?: string; name?: string | null } | undefined) || null)
          : ((userField as { email?: string; name?: string | null } | null) || null);
        return {
          id: m.id,
          userId: m.user_id,
          email: u?.email || "",
          name: u?.name || null,
          role: m.role,
          createdAt: m.created_at,
          isYou: m.user_id === session.userId,
        };
      }),
    });
  } catch (err: unknown) {
    log.error("GET members failed", { err });
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      role?: RoleInput;
      locale?: "pt" | "en" | "es" | "it";
    };
    const email = (body.email || "").trim().toLowerCase();
    const memberName = (body.name || "").trim() || email.split("@")[0] || "";
    const role: RoleInput = (VALID_ROLES as readonly string[]).includes(
      body.role || ""
    )
      ? (body.role as RoleInput)
      : "MEMBER";
    const locale = body.locale || "pt";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 1. Enforce plan-based member limit
    const [accountRes, countRes] = await Promise.all([
      sb
        .from("accounts")
        .select("name, plan, max_users")
        .eq("id", session.accountId)
        .maybeSingle(),
      sb
        .from("account_members")
        .select("id", { count: "exact", head: true })
        .eq("account_id", session.accountId),
    ]);

    if (!accountRes.data) {
      return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }
    const plan = accountRes.data.plan;
    const baseLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
    const limit = Math.max(accountRes.data.max_users || 0, baseLimit);
    if ((countRes.count || 0) >= limit) {
      return NextResponse.json({ error: "member_limit_reached" }, { status: 400 });
    }

    // 2. Find or create local user
    const { data: existingUser } = await sb
      .from("users")
      .select("id, email, name, supabase_id")
      .eq("email", email)
      .maybeSingle();

    let userId: string;
    let password: string | null = null;

    if (existingUser) {
      userId = existingUser.id;
      // Already a member?
      const { data: dup } = await sb
        .from("account_members")
        .select("id")
        .eq("account_id", session.accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (dup) {
        return NextResponse.json({ error: "already_member" }, { status: 400 });
      }
    } else {
      password = generatePassword();
      const { data: authData, error: authErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: memberName },
      });
      if (authErr || !authData.user) {
        return NextResponse.json(
          { error: authErr?.message || "auth_create_failed" },
          { status: 400 }
        );
      }
      userId = cuid();
      const { error: insErr } = await sb.from("users").insert({
        id: userId,
        supabase_id: authData.user.id,
        email,
        name: memberName,
        platform_role: "USER",
      });
      if (insErr) throw insErr;
    }

    // 3. Add membership
    const memberId = cuid();
    const { error: memErr } = await sb.from("account_members").insert({
      id: memberId,
      account_id: session.accountId,
      user_id: userId,
      role,
    });
    if (memErr) throw memErr;

    // 4. Build invite message (only for brand-new users).
    // Pull the URL from the request so the invite link always matches the
    // hostname the admin is actually using.
    const appUrl = appUrlFromRequest(req);
    const message =
      password &&
      buildTeamInviteMessage({
        appUrl,
        workspaceName: accountRes.data.name,
        inviterName: session.email.split("@")[0],
        memberName,
        email,
        password,
        role,
        locale,
      });

    return NextResponse.json(
      {
        ok: true,
        member: {
          id: memberId,
          userId,
          email,
          name: memberName,
          role,
          createdAt: new Date().toISOString(),
          isYou: false,
        },
        existed: !!existingUser,
        credentials: password
          ? {
              email,
              password,
              loginUrl: `${appUrl}/login`,
            }
          : null,
        message: message || null,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    log.error("POST member failed", { err });
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data: member } = await sb
      .from("account_members")
      .select("id, role, user_id")
      .eq("id", id)
      .eq("account_id", session.accountId)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (member.role === "OWNER") {
      return NextResponse.json({ error: "cannot_remove_owner" }, { status: 400 });
    }
    if (member.user_id === session.userId) {
      return NextResponse.json({ error: "cannot_remove_self" }, { status: 400 });
    }
    const { error } = await sb.from("account_members").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    log.error("DELETE member failed", { err });
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

function cuid(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
