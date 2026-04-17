// src/app/api/integrations/google/connect/route.ts
//
// Start the OAuth flow for Google Calendar.
// Signs a short-lived state cookie binding the flow to the current account.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getSession } from "@/lib/auth/session";
import { getAuthUrl } from "@/lib/integrations/google-calendar";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("gcal_oauth_state", `${state}:${session.accountId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const url = getAuthUrl(state, session.email);
  return NextResponse.redirect(url);
}
