// src/app/[locale]/(dashboard)/conversations/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { ConversationsContent } from "./conversations-content";

export interface ConversationItem {
  id: string;
  channel: string;
  isActive: boolean;
  isAIEnabled: boolean;
  lastMessageAt: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadStatus: string;
  lastMessageContent: string | null;
  messageCount: number;
  createdAt: string;
}

async function getConversations(
  accountId: string
): Promise<ConversationItem[]> {
  const conversations = await prisma.conversation.findMany({
    where: { accountId },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    take: 50,
    include: {
      lead: { select: { name: true, phone: true, email: true, status: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true },
      },
      _count: { select: { messages: true } },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    channel: c.channel,
    isActive: c.isActive,
    isAIEnabled: c.isAIEnabled,
    lastMessageAt: c.lastMessageAt?.toISOString() || null,
    leadName: c.lead.name,
    leadPhone: c.lead.phone,
    leadEmail: c.lead.email,
    leadStatus: c.lead.status,
    lastMessageContent: c.messages[0]?.content || null,
    messageCount: c._count.messages,
    createdAt: c.createdAt.toISOString(),
  }));
}

export default async function ConversationsPage() {
  const session = await getSession();
  if (!session) return null;

  const conversations = await getConversations(session.accountId);

  return <ConversationsContent conversations={conversations} />;
}