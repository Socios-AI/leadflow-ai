// src/app/api/admin/accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Super admin check — checks if current user's member role is OWNER in any account
// OR if user email is in SUPER_ADMIN_EMAILS env var
async function isSuperAdmin(userId: string): Promise<boolean> {
  const emails = (process.env.SUPER_ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && emails.includes(user.email)) return true;
  // Fallback: check Supabase is_super_admin flag
  if (user?.supabaseId) {
    const { data } = await supabase.auth.admin.getUserById(user.supabaseId);
    if (data?.user?.app_metadata?.is_super_admin) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const accounts = await prisma.account.findMany({
      include: {
        _count: { select: { members: true, leads: true } },
        members: { where: { role: "OWNER" }, include: { user: { select: { email: true } } }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(accounts.map(a => {
      const limit = a.plan === "ENTERPRISE" ? 50 : a.plan === "PRO" ? 15 : a.plan === "STARTER" ? 5 : 3;
      return {
        id: a.id, name: a.name, slug: a.slug, plan: a.plan,
        memberCount: a._count.members, memberLimit: limit, leadsCount: a._count.leads,
        createdAt: a.createdAt.toISOString(),
        ownerEmail: a.members[0]?.user?.email || null,
      };
    }));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { name, ownerEmail, plan, memberLimit } = await req.json();
    if (!name || !ownerEmail) return NextResponse.json({ error: "Name and email required" }, { status: 400 });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const accountId = `acc_${Date.now()}`;

    // Create or find user
    let user = await prisma.user.findFirst({ where: { email: ownerEmail } });
    if (!user) {
      const tempPw = `Welcome${Date.now()}!`;
      const { data: authUser, error } = await supabase.auth.admin.createUser({
        email: ownerEmail, password: tempPw, email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      user = await prisma.user.create({
        data: { id: `usr_${Date.now()}`, email: ownerEmail, supabaseId: authUser.user.id },
      });
    }

    // Create account
    const account = await prisma.account.create({
      data: {
        id: accountId, name, slug, plan: plan || "FREE",
        locale: "pt", timezone: "America/Sao_Paulo", updatedAt: new Date(),
      },
    });

    // Add owner
    await prisma.accountMember.create({
      data: { id: `mem_${Date.now()}`, accountId, userId: user.id, role: "OWNER" },
    });

    const limit = plan === "ENTERPRISE" ? 50 : plan === "PRO" ? 15 : plan === "STARTER" ? 5 : 3;
    return NextResponse.json({
      id: account.id, name: account.name, slug: account.slug, plan: account.plan,
      memberCount: 1, memberLimit: Math.max(limit, memberLimit || 3), leadsCount: 0,
      createdAt: account.createdAt.toISOString(), ownerEmail,
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    // Cascade delete: members, leads, conversations, messages, campaigns, etc.
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { accountId: id } }),
      prisma.conversation.deleteMany({ where: { accountId: id } }),
      prisma.lead.deleteMany({ where: { accountId: id } }),
      prisma.campaign.deleteMany({ where: { accountId: id } }),
      prisma.channel.deleteMany({ where: { accountId: id } }),
      prisma.aIConfig.deleteMany({ where: { accountId: id } }),
      prisma.eventLog.deleteMany({ where: { accountId: id } }),
      prisma.webhook.deleteMany({ where: { accountId: id } }),
      prisma.knowledgeEntry.deleteMany({ where: { accountId: id } }),
      prisma.accountMember.deleteMany({ where: { accountId: id } }),
      prisma.account.delete({ where: { id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}