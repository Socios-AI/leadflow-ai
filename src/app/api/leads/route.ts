// src/app/api/leads/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leads = await prisma.lead.findMany({
      where: { accountId: session.accountId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        campaign: { select: { name: true } },
        conversations: {
          select: { id: true, isActive: true, isAIEnabled: true, channel: true, lastMessageAt: true },
          take: 1,
          orderBy: { lastMessageAt: "desc" },
        },
      },
    });

    // Build a set of conversationIds whose first_contact send FAILED and
    // never had a SENT sibling. Used by the UI to show the retry button.
    const allConvIds = leads.flatMap((l) => l.conversations.map((c) => c.id));
    const failedConvSet = new Set<string>();
    if (allConvIds.length > 0) {
      const [failedRows, sentRows] = await Promise.all([
        prisma.message.findMany({
          where: {
            accountId: session.accountId,
            conversationId: { in: allConvIds },
            direction: "OUTBOUND",
            status: "FAILED",
            metadata: { path: ["role"], equals: "first_contact" },
          },
          select: { conversationId: true },
          distinct: ["conversationId"],
        }),
        prisma.message.findMany({
          where: {
            accountId: session.accountId,
            conversationId: { in: allConvIds },
            direction: "OUTBOUND",
            status: "SENT",
            metadata: { path: ["role"], equals: "first_contact" },
          },
          select: { conversationId: true },
          distinct: ["conversationId"],
        }),
      ]);
      const sentSet = new Set(sentRows.map((r) => r.conversationId));
      for (const r of failedRows) {
        if (!sentSet.has(r.conversationId)) failedConvSet.add(r.conversationId);
      }
    }

    return NextResponse.json(leads.map((l) => {
      const conv = l.conversations[0];
      const firstContactFailed = conv ? failedConvSet.has(conv.id) : false;
      return {
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        status: l.status,
        source: l.source,
        countryCode: l.countryCode || "BR",
        score: l.score || 0,
        tags: l.tags || [],
        campaignName: l.campaign?.name || null,
        createdAt: l.createdAt.toISOString(),
        lastContactAt: conv?.lastMessageAt?.toISOString() || null,
        conversationId: conv?.id || null,
        channel: conv?.channel || null,
        hasActiveConversation: conv?.isActive || false,
        isAIActive: conv?.isAIEnabled || false,
        firstContactFailed,
      };
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/leads error:", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}