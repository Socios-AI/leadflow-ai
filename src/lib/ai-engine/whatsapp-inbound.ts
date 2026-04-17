// src/lib/ai-engine/whatsapp-inbound.ts
//
// Shared handler for Evolution API inbound WhatsApp events.
// Consumed by both /api/webhooks/evolution and /api/webhooks/whatsapp
// so we have a single normalization + queueing path.
//
// Flow:
//   1. Guard: ignore outbound / groups / empty / non-supported events
//   2. Resolve account: match Channel by instanceName (fallback: first active)
//   3. Find or create Lead (reactive WhatsApp onboarding)
//   4. Find or create Conversation
//   5. If AI disabled: just save the message
//   6. If audio: enqueue transcription (worker feeds it back into debounce)
//   7. If text/media: save INBOUND message + debounceMessage()

import prisma from "@/lib/db/prisma";
import { queues } from "@/lib/queues";
import { debounceMessage } from "@/lib/debounce";

export interface InboundResult {
  status: string;
  reason?: string;
  accountId?: string;
  leadId?: string;
  conversationId?: string;
  messageId?: string;
}

type EvolutionBody = {
  event?: string;
  instance?: string;
  data?: {
    key?: { id?: string; remoteJid?: string; fromMe?: boolean };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      audioMessage?: unknown;
      pttMessage?: unknown;
      imageMessage?: { caption?: string };
      videoMessage?: { caption?: string };
      documentMessage?: unknown;
    };
    instance?: string;
    pushName?: string;
  };
};

export async function handleWhatsAppInbound(
  body: EvolutionBody
): Promise<InboundResult> {
  // 1. Only process messages.upsert
  if (body.event && body.event !== "messages.upsert") {
    return { status: "ignored", reason: "event_not_supported" };
  }

  const data = body.data;
  if (!data) return { status: "ignored", reason: "no_data" };
  if (data.key?.fromMe) return { status: "ignored", reason: "outbound" };

  // 2. Phone / group guard
  const remoteJid = data.key?.remoteJid || "";
  if (!remoteJid) return { status: "ignored", reason: "no_jid" };
  if (remoteJid.includes("@g.us")) return { status: "ignored", reason: "group" };

  const phone = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
  if (!phone) return { status: "ignored", reason: "no_phone" };

  const externalMsgId = data.key?.id;
  const instanceName = body.instance || data.instance || "";

  // 3. Resolve account via instance
  const accountId = await resolveAccountByInstance(instanceName);
  if (!accountId) return { status: "ignored", reason: "no_channel" };

  // 4. Find or create lead (reactive onboarding)
  const lead = await findOrCreateLead(accountId, phone, data.pushName);

  // 5. Find or create conversation
  const conversation = await findOrCreateConversation(accountId, lead.id, phone);

  // 6. AI disabled → save inbound raw and stop
  if (!conversation.isAIEnabled) {
    const content = extractContent(data);
    await prisma.message.create({
      data: {
        accountId,
        conversationId: conversation.id,
        direction: "INBOUND",
        content: content.text || `[${content.type}]`,
        contentType: content.type,
        externalId: externalMsgId,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    return {
      status: "saved",
      reason: "ai_disabled",
      accountId,
      leadId: lead.id,
      conversationId: conversation.id,
    };
  }

  // 7. Audio → enqueue for transcription (transcription worker will feed it into debounce)
  const isAudio = !!(data.message?.audioMessage || data.message?.pttMessage);
  if (isAudio) {
    await queues.transcription.add("transcribe-audio", {
      accountId,
      leadId: lead.id,
      conversationId: conversation.id,
      externalMessageId: externalMsgId,
      instanceName,
      channel: "WHATSAPP",
    });
    return {
      status: "queued_transcription",
      accountId,
      leadId: lead.id,
      conversationId: conversation.id,
    };
  }

  // 8. Text / media with caption → save INBOUND message + debounce
  const { text: textContent, type: contentType } = extractContent(data);
  const content =
    textContent || (contentType !== "TEXT" ? `[${contentType}]` : "");
  if (!content) return { status: "ignored", reason: "empty" };

  const message = await prisma.message.create({
    data: {
      accountId,
      conversationId: conversation.id,
      direction: "INBOUND",
      content,
      contentType,
      externalId: externalMsgId,
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

  await debounceMessage({
    conversationId: conversation.id,
    messageId: message.id,
    accountId,
    leadId: lead.id,
    channel: "WHATSAPP",
  });

  return {
    status: "debounced",
    accountId,
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
  };
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

async function resolveAccountByInstance(
  instanceName: string
): Promise<string | null> {
  if (instanceName) {
    const ch = await prisma.channel.findFirst({
      where: {
        type: "WHATSAPP",
        isEnabled: true,
        config: { path: ["instanceName"], equals: instanceName },
      },
      select: { accountId: true },
    });
    if (ch) return ch.accountId;
  }
  const fallback = await prisma.channel.findFirst({
    where: { type: "WHATSAPP", isEnabled: true },
    select: { accountId: true },
  });
  return fallback?.accountId || null;
}

async function findOrCreateLead(
  accountId: string,
  rawPhone: string,
  pushName?: string
) {
  // Match by last 10 digits to cover country-code variations
  const lastTen = rawPhone.slice(-10);
  const existing = await prisma.lead.findFirst({
    where: {
      accountId,
      phone: { endsWith: lastTen },
    },
  });
  if (existing) return existing;

  return prisma.lead.create({
    data: {
      accountId,
      phone: `+${rawPhone}`,
      name: pushName || null,
      source: "MARKETING",
      status: "NEW",
      score: 0,
    },
  });
}

async function findOrCreateConversation(
  accountId: string,
  leadId: string,
  phone: string
) {
  return prisma.conversation.upsert({
    where: {
      accountId_leadId_channel: { accountId, leadId, channel: "WHATSAPP" },
    },
    create: {
      accountId,
      leadId,
      channel: "WHATSAPP",
      channelIdentifier: `+${phone}`,
      isActive: true,
      isAIEnabled: true,
    },
    update: { isActive: true },
  });
}

function extractContent(data: NonNullable<EvolutionBody["data"]>): {
  text: string;
  type: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO";
} {
  const msg = data.message || {};
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    "";
  const type: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO" =
    msg.audioMessage || msg.pttMessage
      ? "AUDIO"
      : msg.imageMessage
        ? "IMAGE"
        : msg.videoMessage
          ? "VIDEO"
          : msg.documentMessage
            ? "DOCUMENT"
            : "TEXT";
  return { text, type };
}
