import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const entries = await (prisma as any).knowledgeEntry.findMany({
      where: { accountId: session.accountId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(entries);
  } catch (error: unknown) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, content, category } = await req.json();

    const entry = await (prisma as any).knowledgeEntry.create({
      data: {
        accountId: session.accountId,
        title,
        content,
        category: category || "general",
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}