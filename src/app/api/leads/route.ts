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

    return NextResponse.json(leads.map((l) => {
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
        tags: l.tags || [],
        campaignName: l.campaign?.name || null,
        createdAt: l.createdAt.toISOString(),
        lastContactAt: conv?.lastMessageAt?.toISOString() || null,
        conversationId: conv?.id || null,
        channel: conv?.channel || null,
        hasActiveConversation: conv?.isActive || false,
        isAIActive: conv?.isAIEnabled || false,
      };
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/leads error:", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}