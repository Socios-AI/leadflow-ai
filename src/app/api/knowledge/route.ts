// src/app/api/knowledge/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

// GET - List all knowledge entries
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.knowledgeEntry.findMany({
    where: { accountId: session.accountId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entries);
}

// POST - Create new knowledge entry
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, content, category } = await req.json();

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }

  const entry = await prisma.knowledgeEntry.create({
    data: {
      accountId: session.accountId,
      title: title.trim(),
      content: content.trim(),
      category: category?.trim() || "general",
    },
  });

  return NextResponse.json(entry, { status: 201 });
}

// PUT - Update knowledge entry
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, title, content, category } = await req.json();

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  // Verify ownership
  const existing = await prisma.knowledgeEntry.findFirst({
    where: { id, accountId: session.accountId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.knowledgeEntry.update({
    where: { id },
    data: {
      ...(title && { title: title.trim() }),
      ...(content && { content: content.trim() }),
      ...(category && { category: category.trim() }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE - Delete knowledge entry
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await prisma.knowledgeEntry.deleteMany({
    where: { id, accountId: session.accountId },
  });

  return NextResponse.json({ success: true });
}