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
import { getChannelProvider } from "@/lib/channels/factory";
import { WhatsAppProvider } from "@/lib/channels/whatsapp";
import { AIEngine } from "@/lib/ai-engine/engine";

// Words a payment confirmer can reply with to release the lead.
const CONFIRM_TOKENS_RE =
  /\b(ok|okay|okei|ok\.|sim|confirma(do|r|do!)?|recebido|recebi|recebi!|pago|liberar|liberado|aprovado|👍|✅)\b/i;

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

  // 3. Resolve account via instance, and load the channel config so we can
  //    honor the "only respond to funnel leads" gate without a second query.
  const channelRow = await resolveChannelByInstance(instanceName);
  if (!channelRow) return { status: "ignored", reason: "no_channel" };
  const accountId = channelRow.accountId;
  const channelCfg = (channelRow.config as ChannelConfig | null) || {};
  // Default ON: the AI must only engage with leads that came from a
  // configured funnel/webhook. Operators can opt out per channel.
  const respondToFunnelOnly = channelCfg.respondToFunnelLeadsOnly !== false;

  // 3.5 Payment confirmer? If this phone is configured as a confirmer for
  //     this account AND there's a conversation awaiting confirmation,
  //     AND the message looks like an OK, release the lead and notify
  //     the AI to resume. Done BEFORE the lead/funnel logic because a
  //     confirmer is usually NOT a lead in the funnel.
  const inboundText = extractContent(data).text || "";
  const confirmerHandled = await handlePaymentConfirmerReply({
    accountId,
    senderPhone: phone,
    inboundText,
    instanceName,
  });
  if (confirmerHandled) {
    return {
      status: "saved",
      reason: "payment_confirmed_by_confirmer",
      accountId,
    };
  }

  // 4. Find or create lead (reactive onboarding)
  const { lead, created: leadJustCreated } = await findOrCreateLead(
    accountId,
    phone,
    data.pushName
  );

  // 5. Find or create conversation
  const conversation = await findOrCreateConversation(accountId, lead.id, phone);

  // 6. Funnel-only gate, when ON we still record the inbound so the
  //    operator can see "this stranger messaged us" in the inbox, but we
  //    do NOT engage the AI. Pre-existing leads came in via a configured
  //    source (webhook, manual import, CSV), so the AI engages them. A
  //    brand-new lead from a raw WhatsApp ping is treated as a stranger
  //    and left for human triage.
  if (leadJustCreated && respondToFunnelOnly) {
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
      reason: "lead_not_from_funnel",
      accountId,
      leadId: lead.id,
      conversationId: conversation.id,
    };
  }

  // 7. AI disabled → save inbound raw and stop
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
  let content =
    textContent || (contentType !== "TEXT" ? `[${contentType}]` : "");
  if (!content) return { status: "ignored", reason: "empty" };

  // 8a. If the lead is in the payment-proof window AND just sent an image,
  //     run Vision OCR so the AI sees the actual content (Zelle/Pix receipt)
  //     instead of a blind "[IMAGE]". This is what makes the manual payment
  //     flow actually close the loop end-to-end.
  if (contentType === "IMAGE") {
    const leadMeta = (lead.metadata as Record<string, unknown> | null) || {};
    const paymentFlow = leadMeta.paymentFlow as
      | Record<string, unknown>
      | undefined;
    if (paymentFlow?.awaitingProof === true && externalMsgId) {
      try {
        const cfg = (channelRow.config as Record<string, string> | null) || {};
        const wa = new WhatsAppProvider({
          instanceName: cfg.instanceName || instanceName,
          evolutionApiUrl:
            cfg.evolutionApiUrl || process.env.EVOLUTION_API_URL || "",
          evolutionApiKey:
            cfg.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
        });
        const { buffer, mimetype } = await wa.downloadMedia(externalMsgId);
        const ocrReport = await AIEngine.analyzePaymentProofImage(
          buffer,
          mimetype || "image/jpeg"
        );
        // Caption + OCR (caption first so the AI sees the lead's words too).
        content = textContent
          ? `${textContent}\n\n${ocrReport}`
          : ocrReport;
      } catch (err) {
        console.warn(
          "[whatsapp-inbound] payment-proof OCR failed",
          err instanceof Error ? err.message : err
        );
        // Fall back to "[IMAGE]" — better than dropping the message.
      }
    }
  }

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

interface ChannelConfig {
  instanceName?: string;
  respondToFunnelLeadsOnly?: boolean;
  [key: string]: unknown;
}

type ChannelRow = {
  accountId: string;
  config: unknown;
};

async function resolveChannelByInstance(
  instanceName: string
): Promise<ChannelRow | null> {
  if (instanceName) {
    const ch = await prisma.channel.findFirst({
      where: {
        type: "WHATSAPP",
        isEnabled: true,
        config: { path: ["instanceName"], equals: instanceName },
      },
      select: { accountId: true, config: true },
    });
    if (ch) return ch;
  }
  const fallback = await prisma.channel.findFirst({
    where: { type: "WHATSAPP", isEnabled: true },
    select: { accountId: true, config: true },
  });
  return fallback;
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
  if (existing) return { lead: existing, created: false };

  const lead = await prisma.lead.create({
    data: {
      accountId,
      phone: `+${rawPhone}`,
      name: pushName || null,
      source: "MARKETING",
      status: "NEW",
      score: 0,
    },
  });
  return { lead, created: true };
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

/**
 * If the inbound phone is a configured payment confirmer for this account
 * AND a conversation is currently awaiting confirmation from this phone
 * AND the text reads as a confirmation token (ok, sim, confirmado, etc.),
 * then: send the configured "Pagamento recebido" message to the lead,
 * re-enable the AI on that conversation, and stamp the state.
 *
 * Returns true when the inbound was consumed (caller should stop normal
 * lead processing).
 */
async function handlePaymentConfirmerReply(opts: {
  accountId: string;
  /** Sender phone in digits-only form, no + prefix. */
  senderPhone: string;
  inboundText: string;
  instanceName: string;
}): Promise<boolean> {
  const { accountId, senderPhone, inboundText } = opts;
  if (!inboundText.trim()) return false;
  if (!CONFIRM_TOKENS_RE.test(inboundText)) return false;

  // Compare confirmer phones (canonical "+5511..." in DB) to inbound
  // (digits-only). Match on the last 10 digits to ignore country-code
  // formatting variance.
  const persona = (
    await prisma.aIConfig.findUnique({
      where: { accountId },
      select: { persona: true },
    })
  )?.persona as Record<string, unknown> | null;
  const confirmers = ((persona?.pipelinePaymentConfirmerPhones as string[] | undefined) || [])
    .map((p) => String(p).replace(/\D/g, ""))
    .filter((p) => p.length >= 8);
  if (confirmers.length === 0) return false;

  const senderLast10 = senderPhone.slice(-10);
  const isConfirmer = confirmers.some((c) => c.slice(-10) === senderLast10);
  if (!isConfirmer) return false;

  // Find a lead in this account whose metadata.paymentFlow.awaiting
  // Confirmation is true. paymentFlow is stored on lead.metadata (not
  // conversation.metadata, which doesn't exist in the Prisma schema).
  // Limited scan: early-stage SaaS only has a handful of leads in this
  // state at any moment.
  const leadsAwaiting = await prisma.lead.findMany({
    where: { accountId },
    select: { id: true, phone: true, metadata: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const awaitingLead = leadsAwaiting.find((l) => {
    const meta = (l.metadata as Record<string, unknown> | null) || {};
    const pf = meta.paymentFlow as Record<string, unknown> | undefined;
    return pf?.awaitingConfirmation === true;
  });
  if (!awaitingLead) return false;

  const meta = (awaitingLead.metadata as Record<string, unknown> | null) || {};
  const pf = (meta.paymentFlow as Record<string, unknown>) || {};
  const conversationId = String(pf.conversationId || "");
  if (!conversationId) return false;

  // Load the conversation to get the actual channel + contact identifier.
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, channel: true, channelIdentifier: true, leadId: true },
  });
  if (!conv) return false;

  const confirmedMessage =
    String(pf.confirmedMessage || "") ||
    "Pagamento recebido, muito obrigado pela sua compra e confianca!";

  // Send the success message to the lead on the conversation's channel.
  const leadContact = conv.channelIdentifier || awaitingLead.phone || "";
  if (leadContact) {
    const provider = await getChannelProvider(
      accountId,
      (conv.channel as "WHATSAPP" | "EMAIL" | "SMS") || "WHATSAPP"
    );
    if (provider) {
      try {
        const sendRes = await provider.send(leadContact, confirmedMessage);
        await prisma.message.create({
          data: {
            accountId,
            conversationId: conv.id,
            direction: "OUTBOUND",
            content: confirmedMessage,
            contentType: "TEXT",
            isAIGenerated: true,
            status: sendRes.success ? "SENT" : "FAILED",
            externalId: sendRes.externalId || null,
            metadata: {
              role: "payment_confirmation",
              confirmedBy: senderPhone,
            },
          },
        });
      } catch {
        // best effort
      }
    }
  }

  // Update lead.metadata + re-enable AI on the conversation.
  await prisma.lead.update({
    where: { id: awaitingLead.id },
    data: {
      metadata: {
        ...meta,
        paymentFlow: {
          ...pf,
          awaitingConfirmation: false,
          confirmedBy: senderPhone,
          confirmedAt: new Date().toISOString(),
        },
      },
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { isAIEnabled: true, lastMessageAt: new Date() },
  });

  await prisma.eventLog.create({
    data: {
      accountId,
      event: "lead.payment_confirmed",
      data: {
        conversationId: conv.id,
        leadId: awaitingLead.id,
        confirmedBy: senderPhone,
      },
    },
  });

  // Acknowledge the confirmer so they know we got it. Best effort.
  try {
    const cfg = (
      await prisma.channel.findFirst({
        where: { accountId, type: "WHATSAPP", isEnabled: true },
        select: { config: true },
      })
    )?.config as Record<string, unknown> | null;
    if (cfg) {
      const wa = new WhatsAppProvider({
        instanceName: String(cfg.instanceName || ""),
        evolutionApiUrl: String(cfg.evolutionApiUrl || process.env.EVOLUTION_API_URL || ""),
        evolutionApiKey: String(cfg.evolutionApiKey || process.env.EVOLUTION_API_KEY || ""),
      });
      await wa
        .send(opts.senderPhone, "Confirmado. O cliente ja foi avisado, obrigado!")
        .catch(() => {});
    }
  } catch {
    // ignore
  }

  return true;
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
