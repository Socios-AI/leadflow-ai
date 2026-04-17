// src/app/api/integrations/meta/connect/route.ts
//
// Kicks off the Meta OAuth flow for the current account.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getSession } from "@/lib/auth/session";
import { getAuthUrl } from "@/lib/integrations/meta";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", `${state}:${session.accountId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(getAuthUrl(state));
}
