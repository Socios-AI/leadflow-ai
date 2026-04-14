// src/app/[locale]/(dashboard)/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import type { DashboardData } from "@/components/dashboard/dashboard-content";

// Re-export for any other file that needs the type
export type { DashboardData };

async function getDashboardData(accountId: string): Promise<DashboardData> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalLeads,
    leadsThisMonth,
    leadsLastMonth,
    activeConversations,
    convertedLeads,
    messagesThisMonth,
    messagesLastMonth,
    totalMessages,
    aiMessages,
    messagesToday,
    recentLeads,
    campaignsRaw,
    channelsRaw,
  ] = await Promise.all([
    prisma.lead.count({ where: { accountId } }),
    prisma.lead.count({ where: { accountId, createdAt: { gte: startOfMonth } } }),
    prisma.lead.count({
      where: { accountId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
    }),
    prisma.conversation.count({ where: { accountId, isActive: true } }),
    prisma.lead.count({ where: { accountId, status: "CONVERTED" } }),
    prisma.message.count({
      where: { accountId, createdAt: { gte: startOfMonth } },
    }),
    prisma.message.count({
      where: { accountId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
    }),
    prisma.message.count({ where: { accountId } }),
    prisma.message.count({
      where: { accountId, isAIGenerated: true },
    }),
    prisma.message.count({
      where: { accountId, createdAt: { gte: startOfToday } },
    }),
    prisma.lead.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.campaign.findMany({
      where: { accountId },
      orderBy: { totalLeads: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        totalLeads: true,
        convertedLeads: true,
      },
    }),
    prisma.conversation.groupBy({
      by: ["channel"],
      where: { accountId },
      _count: { id: true },
    }),
  ]);

  const leadsChange =
    leadsLastMonth > 0
      ? ((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100
      : leadsThisMonth > 0
        ? 100
        : 0;

  const messagesChange =
    messagesLastMonth > 0
      ? ((messagesThisMonth - messagesLastMonth) / messagesLastMonth) * 100
      : messagesThisMonth > 0
        ? 100
        : 0;

  const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
  const aiResponseRate = totalMessages > 0 ? (aiMessages / totalMessages) * 100 : 0;

  const totalConversations = channelsRaw.reduce(
    (sum: number, ch: { _count: { id: number } }) => sum + ch._count.id,
    0
  );

  return {
    totalLeads,
    leadsThisMonth,
    leadsChange: Math.round(leadsChange * 10) / 10,
    activeConversations,
    conversionRate: Math.round(conversionRate * 10) / 10,
    messagesThisMonth,
    messagesChange: Math.round(messagesChange * 10) / 10,
    aiResponseRate: Math.round(aiResponseRate * 10) / 10,
    avgResponseTime: 1.2, // TODO: calculate from message timestamps
    conversionAssist: convertedLeads,
    messagesToday,
    activeChats: activeConversations,
    recentLeads: recentLeads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      status: l.status,
      source: l.source,
      createdAt: l.createdAt.toISOString(),
    })),
    campaigns: campaignsRaw.map((c) => ({
      id: c.id,
      name: c.name,
      totalLeads: c.totalLeads,
      convertedLeads: c.convertedLeads,
      conversionRate:
        c.totalLeads > 0
          ? Math.round((c.convertedLeads / c.totalLeads) * 1000) / 10
          : 0,
    })),
    channelDistribution: channelsRaw.map(
      (ch: { channel: string; _count: { id: number } }) => ({
        channel: ch.channel,
        count: ch._count.id,
        percentage:
          totalConversations > 0
            ? Math.round((ch._count.id / totalConversations) * 1000) / 10
            : 0,
      })
    ),
  };
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const data = await getDashboardData(session.accountId);

  return <DashboardContent data={data} />;
}