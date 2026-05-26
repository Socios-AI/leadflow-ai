// src/app/api/leads/retry-failed-first-contacts/route.ts
//
// Bulk retry: find every lead in the account whose first-contact send
// failed (has a FAILED OUTBOUND row with metadata.role="first_contact" AND
// no SENT first_contact), clean up the failed rows, reset to NEW and
// enqueue. Used by the "Reenviar para todos com falha" button on /leads.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { queues } from "@/lib/queues";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

export async function GET() {
  // Return just the count, used by the UI to render the bulk button label
  // ("Reenviar para N leads com falha").
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ids = await listFailedLeadIds(session.accountId);
  return NextResponse.json({ count: ids.length });
}

export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadIds = await listFailedLeadIds(session.accountId);
  if (leadIds.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, deleted: 0 });
  }

  // Pull each lead's conversations in one go so we know which channel to
  // use and which conversation IDs to delete from.
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, accountId: session.accountId },
    include: {
      conversations: {
        select: { id: true, channel: true, lastMessageAt: true },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  const allConvIds = leads.flatMap((l) => l.conversations.map((c) => c.id));
  let deleted = 0;
  if (allConvIds.length > 0) {
    const del = await prisma.message.deleteMany({
      where: {
        conversationId: { in: allConvIds },
        direction: "OUTBOUND",
        status: "FAILED",
        metadata: { path: ["role"], equals: "first_contact" },
      },
    });
    deleted = del.count;
  }

  await prisma.lead.updateMany({
    where: { id: { in: leadIds }, accountId: session.accountId },
    data: { status: "NEW", lastContactAt: null },
  });

  const now = Date.now();
  for (const lead of leads) {
    const channel: Channel =
      (lead.conversations[0]?.channel as Channel | undefined) || "WHATSAPP";
    await queues.leadProcessing.add(
      "first-contact",
      { leadId: lead.id, accountId: session.accountId, channel },
      { jobId: `retry-${lead.id}-${now}` }
    );
  }

  return NextResponse.json({ ok: true, retried: leads.length, deleted });
}

/**
 * Leads whose only OUTBOUND first_contact message is FAILED (no SENT
 * follow-up sibling). Done in two queries instead of a raw SQL JOIN so we
 * stay portable across Supavisor and direct Postgres.
 */
async function listFailedLeadIds(accountId: string): Promise<string[]> {
  const failedRows = await prisma.message.findMany({
    where: {
      accountId,
      direction: "OUTBOUND",
      status: "FAILED",
      metadata: { path: ["role"], equals: "first_contact" },
    },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });
  if (failedRows.length === 0) return [];

  const sentRows = await prisma.message.findMany({
    where: {
      accountId,
      conversationId: { in: failedRows.map((r) => r.conversationId) },
      direction: "OUTBOUND",
      status: "SENT",
      metadata: { path: ["role"], equals: "first_contact" },
    },
    select: { conversationId: true },
  });
  const sentSet = new Set(sentRows.map((r) => r.conversationId));

  const candidateConvIds = failedRows
    .map((r) => r.conversationId)
    .filter((id) => !sentSet.has(id));
  if (candidateConvIds.length === 0) return [];

  const convs = await prisma.conversation.findMany({
    where: { id: { in: candidateConvIds }, accountId },
    select: { leadId: true },
  });
  return Array.from(new Set(convs.map((c) => c.leadId)));
}
