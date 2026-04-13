// src/app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

// GET - Lead detail with conversations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, accountId: session.accountId },
    include: {
      campaign: { select: { id: true, name: true, status: true } },
      conversations: {
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        select: {
          id: true,
          channel: true,
          isActive: true,
          isAIEnabled: true,
          sentiment: true,
          lastMessageAt: true,
          _count: { select: { messages: true } },
        },
      },
    },
  });

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Get recent events for this lead
  const events = await prisma.eventLog.findMany({
    where: {
      accountId: session.accountId,
      data: { path: ["leadId"], equals: id },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { event: true, data: true, createdAt: true },
  });

  return NextResponse.json({
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    lastContactAt: lead.lastContactAt?.toISOString() || null,
    conversations: lead.conversations.map((c) => ({
      ...c,
      messageCount: c._count.messages,
      lastMessageAt: c.lastMessageAt?.toISOString() || null,
    })),
    events: events.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

// PATCH - Update lead (status, tags, notes, score)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Verify ownership
  const existing = await prisma.lead.findFirst({
    where: { id, accountId: session.accountId },
  });
  if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Build update data (only allow specific fields)
  const data: Record<string, any> = {};
  if (body.status) data.status = body.status;
  if (body.tags) data.tags = body.tags;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.score !== undefined) data.score = body.score;
  if (body.name !== undefined) data.name = body.name;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.lead.update({
    where: { id },
    data,
  });

  // Log the update
  await prisma.eventLog.create({
    data: {
      accountId: session.accountId,
      event: "lead.updated",
      data: { leadId: id, changes: data, updatedBy: session.userId },
    },
  });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

// DELETE - Delete a lead
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.lead.deleteMany({
    where: { id, accountId: session.accountId },
  });

  return NextResponse.json({ success: true });
}