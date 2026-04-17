// src/app/api/integrations/meta/callback/route.ts
//
// Handles Meta OAuth callback: exchange short-lived code → long-lived token,
// discover user + pages + ad accounts, persist, subscribe leadgen.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCode,
  upgradeToLongLivedToken,
  fetchMetaUser,
  listPages,
  listAdAccounts,
  persistIntegration,
} from "@/lib/integrations/meta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorReason = searchParams.get("error_reason") || searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${appUrl}/settings/integrations?meta=error&reason=${reason}`);

  if (errorReason) return fail(encodeURIComponent(errorReason));
  if (!code || !state) return fail("missing_code");

  const cookieStore = await cookies();
  const raw = cookieStore.get("meta_oauth_state")?.value;
  cookieStore.delete("meta_oauth_state");
  if (!raw) return fail("state_missing");

  const [cookieState, accountId] = raw.split(":");
  if (!cookieState || !accountId || cookieState !== state) {
    return fail("state_mismatch");
  }

  try {
    const shortToken = await exchangeCode(code);
    const longLived = await upgradeToLongLivedToken(shortToken.access_token);
    const [user, pages, adAccounts] = await Promise.all([
      fetchMetaUser(longLived.access_token),
      listPages(longLived.access_token).catch(() => []),
      listAdAccounts(longLived.access_token).catch(() => []),
    ]);
    await persistIntegration(accountId, { longLivedToken: longLived, user, pages, adAccounts });
  } catch (e: unknown) {
    console.error("[meta/callback] error:", e);
    return fail("persist_failed");
  }

  return NextResponse.redirect(`${appUrl}/settings/integrations?meta=connected`);
}
