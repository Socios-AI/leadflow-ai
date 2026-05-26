// src/app/api/leads/[id]/retry-first-contact/route.ts
//
// Retries the AI's first-contact send for a lead whose first attempt failed
// (e.g. WhatsApp instance was disconnected at the time, Evolution returned
// 4xx, etc.). The endpoint is idempotent and safe:
//
//   1. If any OUTBOUND first_contact message is already SENT, refuse — the
//      lead already received the AI's opening and a retry would look like
//      spam ("hi, congratulations on opting in" twice).
//   2. Otherwise, delete every FAILED first_contact OUTBOUND message in the
//      lead's conversations (so the inbox stops showing dead rows), reset
//      the lead.status to NEW (the worker only fires on NEW), and push a
//      fresh job onto the lead-processing queue using the channel from the
//      most recent conversation (falling back to WHATSAPP).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { queues } from "@/lib/queues";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await ctx.params;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, accountId: session.accountId },
    include: {
      conversations: {
        select: { id: true, channel: true, lastMessageAt: true },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  const conversationIds = lead.conversations.map((c) => c.id);

  // Refuse if the AI already delivered a first_contact successfully — don't
  // double-message the lead.
  if (conversationIds.length > 0) {
    const alreadySent = await prisma.message.findFirst({
      where: {
        conversationId: { in: conversationIds },
        direction: "OUTBOUND",
        status: "SENT",
        metadata: { path: ["role"], equals: "first_contact" },
      },
      select: { id: true },
    });
    if (alreadySent) {
      return NextResponse.json(
        { error: "first_contact_already_sent", messageId: alreadySent.id },
        { status: 409 }
      );
    }
  }

  // Wipe FAILED first_contact rows from the inbox.
  let deletedCount = 0;
  if (conversationIds.length > 0) {
    const del = await prisma.message.deleteMany({
      where: {
        conversationId: { in: conversationIds },
        direction: "OUTBOUND",
        status: "FAILED",
        metadata: { path: ["role"], equals: "first_contact" },
      },
    });
    deletedCount = del.count;
  }

  // Reset to NEW so the worker picks it up.
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "NEW", lastContactAt: null },
  });

  // Pick the channel from the most recent existing conversation, else fall
  // back to WHATSAPP (which is the default for ad-driven funnels).
  const channel: Channel =
    (lead.conversations[0]?.channel as Channel | undefined) || "WHATSAPP";

  await queues.leadProcessing.add(
    "first-contact",
    { leadId, accountId: session.accountId, channel },
    { jobId: `retry-${leadId}-${Date.now()}` }
  );

  return NextResponse.json({
    ok: true,
    leadId,
    deletedFailedMessages: deletedCount,
    channel,
  });
}
