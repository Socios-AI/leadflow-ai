// src/app/[locale]/(dashboard)/analytics/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { AnalyticsContent } from "./analytics-content";

export interface AnalyticsData {
  totalLeads: number;
  totalConversations: number;
  totalMessages: number;
  aiMessages: number;
  conversionRate: number;
  avgResponseTime: number;
  channelBreakdown: Array<{ channel: string; count: number; percentage: number }>;
  dailyLeads: Array<{ date: string; count: number }>;
  campaignPerformance: Array<{
    name: string;
    leads: number;
    converted: number;
    rate: number;
  }>;
}

async function getAnalytics(accountId: string): Promise<AnalyticsData> {
  const [totalLeads, totalConversations, totalMessages, aiMessages, convertedLeads, channels, campaigns] =
    await Promise.all([
      prisma.lead.count({ where: { accountId } }),
      prisma.conversation.count({ where: { accountId } }),
      prisma.message.count({ where: { accountId } }),
      prisma.message.count({ where: { accountId, isAIGenerated: true } }),
      prisma.lead.count({ where: { accountId, status: "CONVERTED" } }),
      prisma.conversation.groupBy({ by: ["channel"], where: { accountId }, _count: { id: true } }),
      prisma.campaign.findMany({
        where: { accountId },
        orderBy: { totalLeads: "desc" },
        take: 10,
        select: { name: true, totalLeads: true, convertedLeads: true },
      }),
    ]);

  const totalCh = channels.reduce((s: number, c: { _count: { id: number } }) => s + c._count.id, 0);

  return {
    totalLeads,
    totalConversations,
    totalMessages,
    aiMessages,
    conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0,
    avgResponseTime: 1.2,
    channelBreakdown: channels.map((c: { channel: string; _count: { id: number } }) => ({
      channel: c.channel,
      count: c._count.id,
      percentage: totalCh > 0 ? Math.round((c._count.id / totalCh) * 1000) / 10 : 0,
    })),
    dailyLeads: [],
    campaignPerformance: campaigns.map((c) => ({
      name: c.name,
      leads: c.totalLeads,
      converted: c.convertedLeads,
      rate: c.totalLeads > 0 ? Math.round((c.convertedLeads / c.totalLeads) * 1000) / 10 : 0,
    })),
  };
}

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) return null;

  const data = await getAnalytics(session.accountId);
  return <AnalyticsContent data={data} />;
}