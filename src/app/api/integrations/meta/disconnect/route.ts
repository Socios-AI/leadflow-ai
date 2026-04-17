import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { disconnect } from "@/lib/integrations/meta";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await disconnect(session.accountId);
  return NextResponse.json({ ok: true });
}
