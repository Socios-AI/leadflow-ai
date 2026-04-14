// src/app/[locale]/(dashboard)/conversations/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { ConversationsContent } from "./conversations-content";

export interface ConversationItem {
  id: string;
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  channel: string;
  isAIEnabled: boolean;
  isActive: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  sentiment: string | null;
}

async function getConversations(accountId: string): Promise<ConversationItem[]> {
  const conversations = await prisma.conversation.findMany({
    where: { accountId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      lead: {
        select: { name: true, phone: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true },
      },
    },
  });

  return conversations.map((conv) => ({
    id: conv.id,
    leadName: conv.lead.name || conv.lead.phone || conv.lead.email || "Sem nome",
    leadPhone: conv.lead.phone,
    leadEmail: conv.lead.email,
    channel: conv.channel,
    isAIEnabled: conv.isAIEnabled,
    isActive: conv.isActive,
    lastMessage: conv.messages[0]?.content || null,
    lastMessageAt: conv.messages[0]?.createdAt?.toISOString() || conv.lastMessageAt?.toISOString() || null,
    unreadCount: 0,
    sentiment: conv.sentiment,
  }));
}

export default async function ConversationsPage() {
  const session = await getSession();
  if (!session) return null;

  const conversations = await getConversations(session.accountId);

  return <ConversationsContent conversations={conversations} />;
}