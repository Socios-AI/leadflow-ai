// src/app/api/settings/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const members = await prisma.accountMember.findMany({
      where: { accountId: session.accountId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(members.map(m => ({
      id: m.id, userId: m.userId, email: m.user.email, name: m.user.name,
      role: m.role, createdAt: m.createdAt.toISOString(),
    })));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { email, role } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // Check member limit
    const account = await prisma.account.findUnique({ where: { id: session.accountId }, include: { _count: { select: { members: true } } } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const limit = account.plan === "ENTERPRISE" ? 50 : account.plan === "PRO" ? 15 : account.plan === "STARTER" ? 5 : 3;
    if (account._count.members >= limit) return NextResponse.json({ error: "Member limit reached" }, { status: 400 });

    // Check if user already exists
    let user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      // Create Supabase auth user with temp password
      const tempPassword = `Temp${Date.now()}!`;
      const { data: authUser, error } = await supabase.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      // Create app user
      user = await prisma.user.create({
        data: { id: `usr_${Date.now()}`, email, supabaseId: authUser.user.id },
      });
    }

    // Check if already a member
    const existing = await prisma.accountMember.findFirst({ where: { accountId: session.accountId, userId: user.id } });
    if (existing) return NextResponse.json({ error: "User already a member" }, { status: 400 });

    // Add as member
    const member = await prisma.accountMember.create({
      data: { id: `mem_${Date.now()}`, accountId: session.accountId, userId: user.id, role: role || "MEMBER" },
    });

    return NextResponse.json({ id: member.id, userId: user.id, email: user.email, name: user.name, role: member.role, createdAt: member.createdAt.toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const member = await prisma.accountMember.findFirst({ where: { id, accountId: session.accountId } });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.role === "OWNER") return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });

    await prisma.accountMember.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}