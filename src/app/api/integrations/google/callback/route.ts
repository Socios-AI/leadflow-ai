// src/app/api/integrations/google/callback/route.ts
//
// Google OAuth callback. Exchanges the authorization code for tokens,
// validates state, persists the integration, redirects back to /settings.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, persistIntegration } from "@/lib/integrations/google-calendar";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const failure = (reason: string) =>
    NextResponse.redirect(`${appUrl}/settings/integrations?google=error&reason=${reason}`);

  if (error) return failure(encodeURIComponent(error));
  if (!code || !state) return failure("missing_code");

  const cookieStore = await cookies();
  const raw = cookieStore.get("gcal_oauth_state")?.value;
  cookieStore.delete("gcal_oauth_state");
  if (!raw) return failure("state_missing");

  const [cookieState, accountId] = raw.split(":");
  if (!cookieState || !accountId || cookieState !== state) {
    return failure("state_mismatch");
  }

  try {
    const tokens = await exchangeCode(code);
    await persistIntegration(accountId, tokens);
  } catch (e: unknown) {
    console.error("[google/callback] persist failed:", e);
    return failure("persist_failed");
  }

  return NextResponse.redirect(`${appUrl}/settings/integrations?google=connected`);
}
