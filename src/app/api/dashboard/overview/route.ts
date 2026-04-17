// src/app/api/dashboard/overview/route.ts
//
// Polling endpoint for the dashboard home. Returns the same shape the
// server-rendered page uses, so the client can swap state in-place.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadDashboardOverview } from "@/lib/dashboard/overview";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await loadDashboardOverview(session.accountId);
  return NextResponse.json(data);
}
