import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all";

  const where: Prisma.LeadWhereInput = {
    accountId: session.accountId,
  };

  if (status !== "all") {
    where.status = status as Prisma.EnumLeadStatusFilter["equals"];
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
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
    leads.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))
  );
}