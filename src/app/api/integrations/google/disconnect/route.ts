// src/app/api/integrations/google/disconnect/route.ts
//
// Revokes the stored refresh token and deletes the local integration.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { disconnect } from "@/lib/integrations/google-calendar";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await disconnect(session.accountId);
  return NextResponse.json({ ok: true });
}
