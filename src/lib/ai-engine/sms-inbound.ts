// src/lib/ai-engine/sms-inbound.ts
//
// Twilio inbound SMS handler. Used by /api/webhooks/sms/[accountId] so the
// account is resolved from the URL (Twilio supports per-number webhook
// URLs). Flow mirrors WhatsApp: dedupe lead by phone, find or create
// conversation, push into debounce so the AI replies in a single turn even
// if the lead sends two SMS in a row.

import prisma from "@/lib/db/prisma";
import { debounceMessage } from "@/lib/debounce";

export interface InboundSmsPayload {
  /** E.164 phone of the sender */
  from: string;
  /** Phone the lead messaged (our Twilio number, used for sanity checks). */
  to?: string;
  body: string;
  /** Twilio MessageSid for idempotency. */
  externalId?: string;
}

export interface InboundResult {
  status: string;
  reason?: string;
  leadId?: string;
  conversationId?: string;
  messageId?: string;
}

export async function handleSmsInbound(
  accountId: string,
  payload: InboundSmsPayload
): Promise<InboundResult> {
  if (!payload.from || !payload.body?.trim()) {
    return { status: "ignored", reason: "empty" };
  }

  // Idempotency on Twilio's MessageSid.
  if (payload.externalId) {
    const already = await prisma.message.findFirst({
      where: { accountId, externalId: payload.externalId, direction: "INBOUND" },
      select: { id: true },
    });
    if (already) {
      return { status: "ignored", reason: "duplicate", messageId: already.id };
    }
  }

  const lead = await findOrCreateLeadByPhone(accountId, payload.from);
  const conversation = await prisma.conversation.upsert({
    where: { accountId_leadId_channel: { accountId, leadId: lead.id, channel: "SMS" } },
    create: {
      accountId,
      leadId: lead.id,
      channel: "SMS",
      channelIdentifier: payload.from,
      isActive: true,
      isAIEnabled: true,
    },
    update: { isActive: true },
  });

  const message = await prisma.message.create({
    data: {
      accountId,
      conversationId: conversation.id,
      direction: "INBOUND",
      content: payload.body.trim(),
      contentType: "TEXT",
      externalId: payload.externalId || null,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  if (lead.status === "NEW" || lead.status === "CONTACTED") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "IN_CONVERSATION" },
    });
  }

  if (!conversation.isAIEnabled) {
    return {
      status: "saved",
      reason: "ai_disabled",
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: message.id,
    };
  }

  await debounceMessage({
    accountId,
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    channel: "SMS",
  });

  return {
    status: "debounced",
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
  };
}

async function findOrCreateLeadByPhone(accountId: string, e164: string) {
  const normalized = e164.startsWith("+") ? e164 : `+${e164.replace(/\D/g, "")}`;
  const lastTen = normalized.replace(/\D/g, "").slice(-10);
  const existing = await prisma.lead.findFirst({
    where: { accountId, phone: { endsWith: lastTen } },
  });
  if (existing) return existing;
  return prisma.lead.create({
    data: {
      accountId,
      phone: normalized,
      source: "API",
      status: "NEW",
      score: 0,
    },
  });
}
