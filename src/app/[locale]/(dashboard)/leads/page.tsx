// src/app/[locale]/(dashboard)/leads/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { LeadsContent } from "./leads-content";

export interface LeadItem {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string;
  countryCode: string;
  score: number;
  campaignName: string | null;
  createdAt: string;
  lastContactAt: string | null;
  hasActiveConversation: boolean;
  isAIActive: boolean;
}

async function getLeads(accountId: string): Promise<LeadItem[]> {
  const leads = await prisma.lead.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      campaign: { select: { name: true } },
      conversations: {
        select: { isActive: true, isAIEnabled: true, lastMessageAt: true },
        take: 1,
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  return leads.map((l) => {
    const conv = l.conversations[0];
    return {
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      status: l.status,
      source: l.source,
      countryCode: l.countryCode || "BR",
      score: l.score || 0,
      campaignName: l.campaign?.name || null,
      createdAt: l.createdAt.toISOString(),
      lastContactAt: conv?.lastMessageAt?.toISOString() || null,
      hasActiveConversation: conv?.isActive || false,
      isAIActive: conv?.isAIEnabled || false,
    };
  });
}

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) return null;

  const leads = await getLeads(session.accountId);
  return <LeadsContent leads={leads} />;
}