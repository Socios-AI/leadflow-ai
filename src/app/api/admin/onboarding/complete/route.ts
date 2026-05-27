// src/app/api/admin/onboarding/complete/route.ts
//
// Marks the SUPER_ADMIN walkthrough as done for the current user. The flag
// is persisted on the Supabase auth user's app_metadata so it survives
// across browsers and devices without needing a Prisma migration.
//
// Idempotent: safe to call multiple times. Only SUPER_ADMIN and
// HIPER_ADMIN can hit it; USERs get a no-op 200 so the client doesn't
// retry.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-server";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "api/admin/onboarding" });

export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.platformRole !== "SUPER_ADMIN" && session.platformRole !== "HIPER_ADMIN") {
    // No-op for regular users — saves the client from a retry loop.
    return NextResponse.json({ ok: true, ignored: "not_admin" });
  }

  try {
    const admin = getSupabaseAdmin();
    // We must read-then-merge so we don't blow away unrelated app_metadata
    // (e.g. is_super_admin flag set by older code).
    const { data: existing } = await admin.auth.admin.getUserById(session.supabaseUserId);
    const previous = (existing?.user?.app_metadata as Record<string, unknown> | undefined) || {};
    const { error } = await admin.auth.admin.updateUserById(session.supabaseUserId, {
      app_metadata: {
        ...previous,
        super_admin_onboarded: true,
        super_admin_onboarded_at: new Date().toISOString(),
      },
    });
    if (error) {
      log.error("update app_metadata failed", { err: error.message });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("onboarding complete failed", { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
