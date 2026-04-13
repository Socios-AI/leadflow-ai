// src/app/api/dashboard/stats/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = session.accountId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevThirtyDays = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalLeads,
    leadsThisMonth,
    leadsPrevMonth,
    activeConversations,
    totalConversations,
    convertedLeads,
    convertedPrevMonth,
    messagesSent,
    messagesByChannel,
    leadsByStatus,
    leadsByDay,
    topCampaigns,
    recentEvents,
  ] = await Promise.all([
    // Total leads
    prisma.lead.count({ where: { accountId } }),

    // Leads this month
    prisma.lead.count({
      where: { accountId, createdAt: { gte: thirtyDaysAgo } },
    }),

    // Leads prev month (for comparison)
    prisma.lead.count({
      where: { accountId, createdAt: { gte: prevThirtyDays, lt: thirtyDaysAgo } },
    }),

    // Active conversations
    prisma.conversation.count({
      where: { accountId, isActive: true },
    }),

    // Total conversations
    prisma.conversation.count({ where: { accountId } }),

    // Converted leads this month
    prisma.lead.count({
      where: { accountId, status: "CONVERTED", updatedAt: { gte: thirtyDaysAgo } },
    }),

    // Converted prev month
    prisma.lead.count({
      where: { accountId, status: "CONVERTED", updatedAt: { gte: prevThirtyDays, lt: thirtyDaysAgo } },
    }),

    // Messages sent this month
    prisma.message.count({
      where: { accountId, direction: "OUTBOUND", createdAt: { gte: thirtyDaysAgo } },
    }),

    // Messages by channel
    prisma.conversation.groupBy({
      by: ["channel"],
      where: { accountId },
      _count: { id: true },
    }),

    // Leads by status
    prisma.lead.groupBy({
      by: ["status"],
      where: { accountId },
      _count: { id: true },
    }),

    // Leads per day (last 14 days)
    prisma.$queryRaw`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM leads
      WHERE account_id = ${accountId}
        AND created_at >= ${sevenDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    ` as Promise<Array<{ date: string; count: number }>>,

    // Top campaigns by lead count
    prisma.campaign.findMany({
      where: { accountId },
      orderBy: { totalLeads: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        totalLeads: true,
        convertedLeads: true,
        status: true,
      },
    }),

    // Recent events
    prisma.eventLog.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { event: true, data: true, createdAt: true },
    }),
  ]);

  // Calculate growth percentages
  const leadGrowth = leadsPrevMonth > 0
    ? Math.round(((leadsThisMonth - leadsPrevMonth) / leadsPrevMonth) * 100)
    : leadsThisMonth > 0 ? 100 : 0;

  const conversionRate = leadsThisMonth > 0
    ? Math.round((convertedLeads / leadsThisMonth) * 100)
    : 0;

  const prevConversionRate = leadsPrevMonth > 0
    ? Math.round((convertedPrevMonth / leadsPrevMonth) * 100)
    : 0;

  return NextResponse.json({
    kpis: {
      totalLeads,
      leadsThisMonth,
      leadGrowth,
      activeConversations,
      totalConversations,
      convertedLeads,
      conversionRate,
      conversionRateChange: conversionRate - prevConversionRate,
      messagesSent,
    },
    charts: {
      leadsByDay,
      leadsByStatus: leadsByStatus.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      messagesByChannel: messagesByChannel.map((c) => ({
        channel: c.channel,
        count: c._count.id,
      })),
    },
    topCampaigns,
    recentEvents: recentEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}