// src/app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const account = await prisma.account.findUnique({ where: { id: session.accountId }, include: { _count: { select: { members: true } } } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const memberLimit = account.plan === "ENTERPRISE" ? 50 : account.plan === "PRO" ? 15 : account.plan === "STARTER" ? 5 : 3;
    return NextResponse.json({ id: account.id, name: account.name, slug: account.slug, plan: account.plan, timezone: account.timezone, locale: account.locale, memberCount: account._count.members, memberLimit });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    await prisma.account.update({ where: { id: session.accountId }, data: { name: body.name, timezone: body.timezone, locale: body.locale, updatedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { newPassword } = await req.json();
    if (!newPassword || newPassword.length < 6) return NextResponse.json({ error: "Password too short" }, { status: 400 });
    const { error } = await supabase.auth.admin.updateUserById(session.userId, { password: newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}