// src/lib/ai-engine/email-inbound.ts
//
// Inbound email handler. Designed to consume a normalized payload coming
// from any inbound mail provider (Resend Inbound, Postmark, Mailgun routes,
// or even a Zapier/Make webhook that forwards the parsed mail).
//
// The account is resolved from the route path, not from the headers, so
// tenants can't accidentally receive each other's mail.

import prisma from "@/lib/db/prisma";
import { debounceMessage } from "@/lib/debounce";
import { claimInbound } from "@/lib/inbound-idempotency";

export interface InboundEmailPayload {
  from: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  /** Optional display name extracted from the From header. */
  fromName?: string;
}

export interface InboundResult {
  status: string;
  reason?: string;
  leadId?: string;
  conversationId?: string;
  messageId?: string;
}

export async function handleEmailInbound(
  accountId: string,
  payload: InboundEmailPayload
): Promise<InboundResult> {
  const email = (payload.from || "").trim().toLowerCase();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return { status: "ignored", reason: "invalid_from" };
  }

  const body =
    (payload.text && payload.text.trim()) ||
    (payload.html && stripHtml(payload.html)) ||
    "";
  if (!body) return { status: "ignored", reason: "empty" };

  if (payload.messageId) {
    const claim = await claimInbound(`email:${accountId}:${payload.messageId}`);
    if (!claim.fresh) {
      return { status: "ignored", reason: "duplicate_in_flight" };
    }
    const already = await prisma.message.findFirst({
      where: { accountId, externalId: payload.messageId, direction: "INBOUND" },
      select: { id: true },
    });
    if (already) {
      return { status: "ignored", reason: "duplicate", messageId: already.id };
    }
  }

  const lead = await findOrCreateLeadByEmail(accountId, email, payload.fromName);
  const conversation = await prisma.conversation.upsert({
    where: { accountId_leadId_channel: { accountId, leadId: lead.id, channel: "EMAIL" } },
    create: {
      accountId,
      leadId: lead.id,
      channel: "EMAIL",
      channelIdentifier: email,
      isActive: true,
      isAIEnabled: true,
    },
    update: { isActive: true },
  });

  const subject = (payload.subject || "").trim();
  const content = subject ? `Assunto: ${subject}\n\n${body}` : body;

  const message = await prisma.message.create({
    data: {
      accountId,
      conversationId: conversation.id,
      direction: "INBOUND",
      content,
      contentType: "TEXT",
      externalId: payload.messageId || null,
      metadata: subject ? { subject } : undefined,
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
    channel: "EMAIL",
  });

  return {
    status: "debounced",
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
  };
}

async function findOrCreateLeadByEmail(
  accountId: string,
  email: string,
  name?: string
) {
  const existing = await prisma.lead.findFirst({
    where: { accountId, email },
  });
  if (existing) return existing;
  return prisma.lead.create({
    data: {
      accountId,
      email,
      name: name || null,
      source: "API",
      status: "NEW",
      score: 0,
    },
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
