// src/app/api/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { getChannelProvider } from "@/lib/channels/factory";

// GET - List messages for a conversation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  // Verify conversation belongs to account
  const conversation = await prisma.conversation.findFirst({
    where: { id, accountId: session.accountId },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true, status: true } },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: {
      id: true,
      direction: true,
      content: true,
      contentType: true,
      isAIGenerated: true,
      status: true,
      externalId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      channel: conversation.channel,
      isActive: conversation.isActive,
      isAIEnabled: conversation.isAIEnabled,
      sentiment: conversation.sentiment,
      lead: conversation.lead,
    },
    messages: items.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

// POST - Send a manual message (human takeover)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content, disableAI } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  // Verify conversation + get lead info
  const conversation = await prisma.conversation.findFirst({
    where: { id, accountId: session.accountId },
    include: { lead: { select: { phone: true, email: true } } },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Disable AI if requested (human takeover)
  if (disableAI) {
    await prisma.conversation.update({
      where: { id },
      data: { isAIEnabled: false },
    });
  }

  // Save message
  const message = await prisma.message.create({
    data: {
      accountId: session.accountId,
      conversationId: id,
      direction: "OUTBOUND",
      content: content.trim(),
      contentType: "TEXT",
      isAIGenerated: false,
      status: "PENDING",
    },
  });

  // Send via channel
  const contactId = conversation.channel === "EMAIL"
    ? conversation.lead.email!
    : conversation.lead.phone!;

  const provider = await getChannelProvider(
    session.accountId,
    conversation.channel as "WHATSAPP" | "EMAIL" | "SMS"
  );

  if (provider) {
    const result = await provider.send(contactId, content.trim());
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        externalId: result.externalId || null,
      },
    });
  }

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json({
    ...message,
    createdAt: message.createdAt.toISOString(),
  }, { status: 201 });
}