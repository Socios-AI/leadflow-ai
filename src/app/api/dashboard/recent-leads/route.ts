import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({
    where: { accountId: session.accountId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      source: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    leads.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    }))
  );
}