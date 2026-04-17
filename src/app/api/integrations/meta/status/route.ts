import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/integrations/meta";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getIntegrationStatus(session.accountId));
}
