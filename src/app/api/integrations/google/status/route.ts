// src/app/api/integrations/google/status/route.ts
//
// Returns whether the current account is connected to Google Calendar.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/integrations/google-calendar";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getIntegrationStatus(session.accountId);
  return NextResponse.json(status);
}
