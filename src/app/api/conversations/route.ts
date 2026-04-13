import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversations = await prisma.conversation.findMany({
      where: { accountId: session.accountId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        lead: {
          select: { id: true, name: true, phone: true, email: true, status: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true, direction: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    const formatted = conversations.map((c) => ({
      id: c.id,
      channel: c.channel,
      isActive: c.isActive,
      lastMessageAt: c.updatedAt,
      lead: {
        name: c.lead.name,
        phone: c.lead.phone,
        email: c.lead.email,
      },
      lastMessage: c.messages[0]?.content || null,
      lastMessageDirection: c.messages[0]?.direction || null,
      lastMessageTime: c.messages[0]?.createdAt || null,
      messageCount: c._count.messages,
    }));

    return NextResponse.json(formatted);
  } catch (error: unknown) {
    console.error("Get conversations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}