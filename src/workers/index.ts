// src/workers/index.ts
//
// Run with: npm run workers:dev (watch) or npm run workers (prod).
//
// All BullMQ workers for the lead engagement pipeline. Each worker is a single
// Worker instance tied to a queue. AIEngine is the only LLM entry point.

import { Worker } from "bullmq";
import { getQueueConnection, getRedis } from "@/lib/redis";
import prisma from "@/lib/db/prisma";
import { AIEngine } from "@/lib/ai-engine/engine";
import { getChannelProvider } from "@/lib/channels/factory";
import { WhatsAppProvider } from "@/lib/channels/whatsapp";
import { queues } from "@/lib/queues";
import { flushDebounceBuffer, debounceMessage } from "@/lib/debounce";
import { sendMessagesInParts } from "@/lib/ai-engine/send-parts";

const connection = getQueueConnection();
type Channel = "WHATSAPP" | "EMAIL" | "SMS";

console.log("Starting workers...");

// ═══════════════════════════════════════════════════════
// WORKER 1: LEAD PROCESSING (first contact for new leads)
// ═══════════════════════════════════════════════════════

interface PipelineCfg {
  channels: Channel[];
  followUps: { channel: Channel; delayHours: number; instruction: string }[];
}

async function loadPipelineCfg(accountId: string, fallbackChannel: Channel): Promise<PipelineCfg> {
  const cfg = await prisma.aIConfig.findUnique({
    where: { accountId },
    select: { persona: true },
  });
  const p = (cfg?.persona as Record<string, unknown> | null) || {};
  const allowed: Channel[] = ["WHATSAPP", "EMAIL", "SMS"];

  let channels: Channel[] = [];
  if (Array.isArray(p.pipelineChannels)) {
    for (const v of p.pipelineChannels) {
      const s = String(v).toUpperCase() as Channel;
      if (allowed.includes(s) && !channels.includes(s)) channels.push(s);
    }
  }
  if (channels.length === 0) {
    const primary = String(p.pipelinePrimaryChannel || fallbackChannel).toUpperCase() as Channel;
    channels = [allowed.includes(primary) ? primary : fallbackChannel];
    const secondary = String(p.pipelineSecondaryChannel || "").toUpperCase() as Channel;
    if (allowed.includes(secondary) && secondary !== channels[0]) channels.push(secondary);
  }

  const followUps: PipelineCfg["followUps"] = Array.isArray(p.pipelineFollowUps)
    ? (p.pipelineFollowUps as Record<string, unknown>[])
        .map((f) => {
          const c = String(f.channel || channels[0]).toUpperCase() as Channel;
          const d = Number(f.delayHours);
          return {
            channel: allowed.includes(c) ? c : channels[0],
            delayHours: Number.isFinite(d) && d > 0 ? Math.min(720, d) : 24,
            instruction: String(f.instruction || "").slice(0, 1000),
          };
        })
        .slice(0, 10)
    : [];

  return { channels, followUps };
}

function contactFor(lead: { email: string | null; phone: string | null }, channel: Channel): string {
  if (channel === "EMAIL") return lead.email || "";
  return lead.phone || "";
}

const leadWorker = new Worker(
  "lead-processing",
  async (job) => {
    const { leadId, accountId, channel: requestedChannel } = job.data as {
      leadId: string;
      accountId: string;
      channel: Channel;
    };
    console.log(`[lead-processing] New lead ${leadId} requested via ${requestedChannel}`);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        campaign: {
          select: {
            name: true,
            transcription: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    if (!lead || lead.status !== "NEW") {
      console.log(`[lead-processing] Lead ${leadId} not NEW, skipping`);
      return;
    }

    const campaignMeta =
      (lead.campaign?.metadata as Record<string, unknown> | null) || {};
    const countries = Array.isArray(campaignMeta.countries)
      ? (campaignMeta.countries as string[])
      : [];
    const campaignCountry = countries[0];
    const campaignLanguage = typeof campaignMeta.aiLanguage === "string"
      ? (campaignMeta.aiLanguage as string)
      : undefined;

    const campaignInfo = lead.campaign
      ? `Campaign: ${lead.campaign.name}\n${lead.campaign.description || ""}\n${lead.campaign.transcription || ""}`
      : undefined;

    // Resolve the channel fan-out from the persisted pipeline config.
    // If the operator chose multiple channels, we send the first contact
    // through each one (subject to having a contactId for that channel).
    const pipeline = await loadPipelineCfg(accountId, requestedChannel);
    const sendChannels = pipeline.channels.filter(
      (c) => contactFor(lead, c).length > 0
    );
    if (sendChannels.length === 0) {
      console.warn(`[lead-processing] Lead ${leadId} has no usable contact for configured channels`);
      return;
    }

    let anySent = false;
    let firstMessageId: string | null = null;
    let primaryConversationId: string | null = null;
    const fanoutSummary: { channel: Channel; parts: number; ok: boolean }[] = [];

    for (const ch of sendChannels) {
      const contactId = contactFor(lead, ch);
      const message = await AIEngine.generateFirstContact({
        accountId,
        leadName: lead.name || undefined,
        leadSource: lead.source,
        campaignInfo,
        channel: ch,
        leadMetadata: (lead.metadata as Record<string, unknown>) || undefined,
        campaignCountry,
        campaignLanguage,
      });

      const conversation = await prisma.conversation.upsert({
        where: { accountId_leadId_channel: { accountId, leadId, channel: ch } },
        create: {
          accountId,
          leadId,
          channel: ch,
          channelIdentifier: contactId,
          isActive: true,
          isAIEnabled: true,
          lastMessageAt: new Date(),
        },
        update: { isActive: true, lastMessageAt: new Date() },
      });

      const provider = await getChannelProvider(accountId, ch);
      if (!provider) {
        console.error(`[lead-processing] No ${ch} provider for account ${accountId}, skipping channel`);
        fanoutSummary.push({ channel: ch, parts: 0, ok: false });
        continue;
      }

      const sendOpts = ch === "EMAIL" ? ({} as Record<string, unknown>) : undefined;
      const { parts, messages } = await sendMessagesInParts({
        accountId,
        conversationId: conversation.id,
        to: contactId,
        fullText: message,
        provider,
        sendOpts,
        extraMetadata: { role: "first_contact" },
      });

      const ok = messages.some((m) => m.status === "SENT");
      if (ok) {
        anySent = true;
        if (!firstMessageId) firstMessageId = messages[0]?.id ?? null;
        if (!primaryConversationId) primaryConversationId = conversation.id;
      }
      fanoutSummary.push({ channel: ch, parts: parts.length, ok });
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: anySent ? "CONTACTED" : "NEW",
        lastContactAt: anySent ? new Date() : undefined,
      },
    });

    await prisma.eventLog.create({
      data: {
        accountId,
        event: "lead.first_contact",
        data: {
          leadId,
          fanout: fanoutSummary,
          success: anySent,
          messageId: firstMessageId,
        },
      },
    });

    // Schedule each configured follow-up at its own delay/channel/instruction.
    if (anySent && pipeline.followUps.length > 0 && primaryConversationId) {
      for (let i = 0; i < pipeline.followUps.length; i++) {
        const fu = pipeline.followUps[i];
        const fuChannel = sendChannels.includes(fu.channel) ? fu.channel : sendChannels[0];
        const contactId = contactFor(lead, fuChannel);
        if (!contactId) continue;
        await queues.followUp.add(
          "follow-up",
          {
            leadId,
            accountId,
            channel: fuChannel,
            conversationId: primaryConversationId,
            attemptIndex: i,
            instruction: fu.instruction,
          },
          { delay: fu.delayHours * 60 * 60 * 1000 }
        );
      }
    }

    console.log(
      `[lead-processing] Lead ${leadId} fan-out: ${fanoutSummary
        .map((s) => `${s.channel}=${s.ok ? `ok(${s.parts})` : "fail"}`)
        .join(", ")} | follow-ups scheduled: ${pipeline.followUps.length}`
    );
  },
  { connection, concurrency: 5 }
);

// ═══════════════════════════════════════════════════════
// WORKER 2: MESSAGE SENDING (queued outbound messages)
// ═══════════════════════════════════════════════════════

const messageSendingWorker = new Worker(
  "message-sending",
  async (job) => {
    const { accountId, messageId, channel, to } = job.data as {
      accountId: string;
      messageId: string;
      channel: Channel;
      to: string;
    };
    console.log(`[message-sending] Sending message ${messageId}`);

    const msg = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!msg || msg.status === "SENT") return;

    const provider = await getChannelProvider(accountId, channel);
    if (!provider) {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: "FAILED" },
      });
      return;
    }

    // Retry transient send failures (timeout, 5xx, network blip).
    // Permanent errors like invalid_phone_format short-circuit immediately
    // so we don't burn the queue on something that won't recover.
    const PERMANENT = new Set([
      "invalid_phone_format",
      "invalid_email_format",
      "empty_body",
      "missing_api_key",
    ]);
    let result = await provider.send(to, msg.content);
    for (let attempt = 1; attempt <= 2 && !result.success; attempt++) {
      const errCode = String(result.error || "");
      if (PERMANENT.has(errCode)) break;
      const delay = 400 * Math.pow(3, attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
      result = await provider.send(to, msg.content);
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: result.success ? "SENT" : "FAILED",
        externalId: result.externalId || null,
        metadata: result.success
          ? msg.metadata ?? undefined
          : {
              ...((msg.metadata as Record<string, unknown>) || {}),
              lastSendError: result.error || "unknown",
            },
      },
    });

    console.log(
      `[message-sending] ${result.success ? "Sent" : `Failed (${result.error})`} message ${messageId}`
    );
  },
  { connection, concurrency: 10 }
);

// ═══════════════════════════════════════════════════════
// WORKER 3: AI RESPONSE (debounced — reads Redis buffer)
//
// Two entry points:
//  - "debounced-respond" (from debounce.ts) → flush buffer, combine, respond
//  - "respond"           (legacy direct)    → use provided messageId only
// ═══════════════════════════════════════════════════════

const aiWorker = new Worker(
  "ai-response",
  async (job) => {
    const { accountId, leadId, conversationId, channel, messageId } =
      job.data as {
        accountId: string;
        leadId: string;
        conversationId: string;
        channel: Channel;
        messageId?: string;
      };

    console.log(
      `[ai-response] ${job.name} for lead ${leadId} (conv ${conversationId})`
    );

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { include: { campaign: true } } },
    });
    if (!conversation) return;
    if (!conversation.isAIEnabled) {
      console.log(`[ai-response] AI disabled for ${conversationId}, skipping`);
      return;
    }

    // ── Resolve which inbound messages to collapse ──
    let pendingIds: string[] = [];
    if (job.name === "debounced-respond") {
      pendingIds = await flushDebounceBuffer(conversationId);
      if (pendingIds.length === 0) {
        console.log(
          `[ai-response] Debounce buffer empty for ${conversationId}, skipping`
        );
        return;
      }
    } else if (messageId) {
      pendingIds = [messageId];
    }

    // ── Load the combined inbound text ──
    let combinedInbound = "";
    if (pendingIds.length > 0) {
      const pendingMsgs = await prisma.message.findMany({
        where: { id: { in: pendingIds }, direction: "INBOUND" },
        orderBy: { createdAt: "asc" },
        select: { content: true },
      });
      combinedInbound = pendingMsgs.map((m) => m.content).join("\n");
    }

    // ── Build history (excluding the pending inbound messages) ──
    const historyRows = await prisma.message.findMany({
      where: {
        conversationId,
        ...(pendingIds.length > 0 ? { id: { notIn: pendingIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { direction: true, content: true },
    });

    const history = historyRows.map((m) => ({
      role: (m.direction === "INBOUND" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.content,
    }));

    const lead = conversation.lead;
    const campaignMeta =
      (lead.campaign?.metadata as Record<string, unknown> | null) || {};
    const countries = Array.isArray(campaignMeta.countries)
      ? (campaignMeta.countries as string[])
      : [];
    const campaignCountry = countries[0];
    const campaignLanguage = typeof campaignMeta.aiLanguage === "string"
      ? (campaignMeta.aiLanguage as string)
      : undefined;

    const campaignInfo = lead.campaign
      ? `Campaign: ${lead.campaign.name}\n${lead.campaign.transcription || ""}`
      : undefined;

    // ── Show typing indicator immediately ──
    // The AI generation takes 5-15s. Without this the lead stares at a
    // silent screen between sending their message and seeing the reply
    // bubbles appear. Fire-and-forget so generation isn't blocked.
    if (channel === "WHATSAPP") {
      const earlyProvider = await getChannelProvider(accountId, channel);
      const earlyContact =
        conversation.channelIdentifier || lead.phone || "";
      if (earlyProvider && earlyContact && earlyProvider instanceof WhatsAppProvider) {
        // Don't await: presence + 1.2s built-in delay would slow us down.
        earlyProvider
          .sendPresence(earlyContact, 200)
          .catch(() => {/* presence is best-effort */});
      }
    }

    const aiResult = await AIEngine.generateResponse({
      accountId,
      leadName: lead.name || undefined,
      leadPhone: lead.phone || undefined,
      leadEmail: lead.email || undefined,
      leadSource: lead.source,
      campaignInfo,
      conversationHistory: history,
      currentMessage: combinedInbound || "(sem conteúdo)",
      channel: channel || "WHATSAPP",
      leadMetadata: (lead.metadata as Record<string, unknown>) || undefined,
      campaignCountry,
      campaignLanguage,
    });

    // ── Send via channel: split in parts + presence between each ──
    const contactId =
      channel === "EMAIL"
        ? lead.email || ""
        : conversation.channelIdentifier || lead.phone || "";

    const provider = await getChannelProvider(accountId, channel);
    let firstMessageId: string | null = null;
    let followUpHours: number | null = null;

    if (provider && contactId) {
      // Compose the outbound text. Order of appended bubbles matters:
      //   1. AI's main reply
      //   2. Curated social/important links (one bubble per URL so each
      //      gets a link preview in WhatsApp)
      //   3. Closing link (accompanyingMessage + URL bubbles)
      let fullText = aiResult.message;
      if (aiResult.linksToSend && aiResult.linksToSend.length > 0) {
        for (const link of aiResult.linksToSend) {
          fullText = `${fullText}|||${link.url}`;
        }
      }
      if (aiResult.closeWithLink) {
        const { url, accompanyingMessage } = aiResult.closeWithLink;
        fullText = accompanyingMessage
          ? `${fullText}|||${accompanyingMessage}|||${url}`
          : `${fullText}|||${url}`;
      }

      const sent = await sendMessagesInParts({
        accountId,
        conversationId,
        to: contactId,
        fullText,
        provider,
        attachments: aiResult.attachments,
        extraMetadata: {
          tags: aiResult.tags,
          sentiment: aiResult.sentiment,
          ...(aiResult.closeWithLink ? { closingLinkSent: aiResult.closeWithLink.url } : {}),
          ...(aiResult.handoff ? { handoffSummary: aiResult.handoff.summary } : {}),
        },
      });
      firstMessageId = sent.messages[0]?.id ?? null;
      followUpHours = sent.followUpHours;
    }

    // ── Payment-flow side effects (runs AFTER bubbles, never blocks) ──
    // Two distinct moments to handle, both signaled by AI tags:
    //   1) [PAYMENT_INSTRUCTIONS]   — just mark the conversation as
    //      "awaitingProof" so the inbound handler knows that the next
    //      IMAGE / "ja paguei" / etc. should trigger the confirm flow.
    //   2) [PAYMENT_PROOF_RECEIVED] — notify the configured confirmer
    //      phones via the tenant's WhatsApp channel and pause the AI
    //      until a human responds "ok".
    if (aiResult.paymentInstructionsSent || aiResult.paymentProofReceived) {
      try {
        const persona = (await prisma.aIConfig.findUnique({
          where: { accountId },
          select: { persona: true },
        }))?.persona as Record<string, unknown> | null;
        const confirmers = (
          (persona?.pipelinePaymentConfirmerPhones as string[] | undefined) || []
        ).filter((p) => typeof p === "string" && p.trim().length > 0);
        const confirmedMsg = String(
          persona?.pipelinePaymentConfirmedMessage || ""
        );

        // We store paymentFlow state on lead.metadata (already a Json
        // column in the Prisma schema) instead of conversation.metadata
        // (which doesn't exist). The flow includes the conversationId so
        // a future expansion of multi-channel-per-lead can still route
        // back correctly.
        const refreshLeadMeta = async (): Promise<Record<string, unknown>> => {
          const fresh = await prisma.lead.findUnique({
            where: { id: leadId },
            select: { metadata: true },
          });
          return ((fresh?.metadata as Record<string, unknown> | null) || {}) as Record<string, unknown>;
        };

        if (aiResult.paymentInstructionsSent) {
          const prevMeta = await refreshLeadMeta();
          const prevPaymentFlow =
            (prevMeta.paymentFlow as Record<string, unknown> | undefined) || {};
          await prisma.lead.update({
            where: { id: leadId },
            data: {
              metadata: {
                ...prevMeta,
                paymentFlow: {
                  ...prevPaymentFlow,
                  conversationId,
                  awaitingProof: true,
                  instructionsSentAt: new Date().toISOString(),
                },
              },
            },
          });
        }

        if (aiResult.paymentProofReceived) {
          // 1. Pause the AI so it doesn't reply while we wait for the human.
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isAIEnabled: false },
          });

          // 2. Persist state on lead.metadata so the WhatsApp inbound
          //    handler can route a later "ok" from any of these confirmer
          //    phones back to THIS conversation.
          const prevMeta = await refreshLeadMeta();
          const prevPaymentFlow =
            (prevMeta.paymentFlow as Record<string, unknown> | undefined) || {};
          await prisma.lead.update({
            where: { id: leadId },
            data: {
              metadata: {
                ...prevMeta,
                paymentFlow: {
                  ...prevPaymentFlow,
                  conversationId,
                  awaitingProof: false,
                  proofReceivedAt: new Date().toISOString(),
                  awaitingConfirmation: true,
                  confirmerPhones: confirmers,
                  confirmedMessage: confirmedMsg,
                },
              },
            },
          });

          // 3. Notify each confirmer via the tenant's own WhatsApp channel.
          //    The text includes a unique LEADREF token the confirmer just
          //    has to keep when replying "ok" — but in practice "ok" alone
          //    is fine because we track conversation state.
          if (confirmers.length > 0 && channel === "WHATSAPP" && provider instanceof WhatsAppProvider) {
            const text =
              `Comprovante recebido do lead ${lead.name || lead.phone || "(sem nome)"}.\n` +
              `Conversa: ${process.env.NEXT_PUBLIC_APP_URL || "https://mktdigital.sociosai.com"}/conversations?id=${conversationId}\n\n` +
              `Confirma o recebimento? Responde aqui com OK pra liberar o cliente.`;
            for (const phone of confirmers) {
              await provider.send(phone, text).catch(() => {
                // best effort, individual confirmer may be offline
              });
            }
          }

          await prisma.eventLog.create({
            data: {
              accountId,
              event: "lead.payment_proof_received",
              data: {
                leadId,
                conversationId,
                confirmers,
                notified: confirmers.length,
              },
            },
          });
        }
      } catch (err) {
        console.error("[ai-response] payment flow failed:", err);
      }
    }

    // ── Fire team handoff (email + webhook) ──
    // Runs AFTER the outbound bubbles so the lead sees the wait-message
    // before the team email goes out. Best-effort: never blocks the
    // conversation flow.
    if (aiResult.handoff) {
      try {
        const persona = (await prisma.aIConfig.findUnique({
          where: { accountId },
          select: { persona: true },
        }))?.persona as Record<string, unknown> | null;
        const handoffEmail = String(persona?.pipelineHandoffEmail || "");
        const handoffWebhook = String(persona?.pipelineHandoffWebhook || "");
        if (handoffEmail || handoffWebhook) {
          const { sendTeamHandoff } = await import("@/lib/notifications/team-handoff");
          const transcriptLines = history
            .slice(-10)
            .map((h) => `${h.role === "user" ? "Lead" : "IA"}: ${h.content}`)
            .join("\n");
          const result = await sendTeamHandoff({
            accountId,
            conversationId,
            leadName: lead.name || "",
            leadPhone: lead.phone || "",
            leadEmail: lead.email || "",
            reason: aiResult.handoff.summary,
            requestedAction: aiResult.handoff.requestedAction,
            capturedInfo: aiResult.handoff.capturedInfo,
            transcript: transcriptLines,
            toEmail: handoffEmail,
            toWebhook: handoffWebhook || undefined,
            appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://mktdigital.sociosai.com",
          });
          await prisma.eventLog.create({
            data: {
              accountId,
              event: "lead.handoff_requested",
              data: {
                leadId,
                conversationId,
                summary: aiResult.handoff.summary,
                emailSent: result.emailSent,
                webhookSent: result.webhookSent,
                errors: result.errors,
              },
            },
          });
        }
      } catch (err) {
        console.error("[ai-response] handoff failed:", err);
      }
    }

    // ── Update conversation sentiment / AI enabled flag ──
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        sentiment: aiResult.sentiment,
        ...(aiResult.isEscalation ? { isAIEnabled: false } : {}),
      },
    });

    // ── Schedule custom follow-up if the AI asked for one ──
    if (followUpHours && followUpHours > 0) {
      await queues.followUp.add(
        "follow-up",
        { leadId, accountId, channel, conversationId },
        { delay: followUpHours * 60 * 60 * 1000 }
      );
    }

    // ── Handle conversion/escalation side effects ──
    if (aiResult.isConversion) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "CONVERTED" },
      });
      await prisma.eventLog.create({
        data: {
          accountId,
          event: "lead.converted",
          data: { leadId, conversationId, notify: aiResult.notificationMessage },
        },
      });
    }
    if (aiResult.isEscalation) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "QUALIFIED" },
      });
      await prisma.eventLog.create({
        data: {
          accountId,
          event: "lead.escalated",
          data: { leadId, conversationId, notify: aiResult.notificationMessage },
        },
      });
    }

    if (aiResult.scheduled) {
      await prisma.eventLog.create({
        data: {
          accountId,
          event: "lead.meeting_scheduled",
          data: {
            leadId,
            conversationId,
            eventId: aiResult.scheduled.eventId,
            startISO: aiResult.scheduled.startISO,
            endISO: aiResult.scheduled.endISO,
            htmlLink: aiResult.scheduled.htmlLink,
          },
        },
      });
    }

    console.log(`[ai-response] Response sent for lead ${leadId}`);
  },
  { connection, concurrency: 3 }
);

// ═══════════════════════════════════════════════════════
// WORKER 4: TRANSCRIPTION (WhatsApp audio → text)
// After transcription we feed the result into the SAME debounce buffer
// so the AI worker picks it up together with any concurrent text messages.
// ═══════════════════════════════════════════════════════

const transcriptionWorker = new Worker(
  "transcription",
  async (job) => {
    const {
      accountId,
      leadId,
      conversationId,
      externalMessageId,
      instanceName,
    } = job.data as {
      accountId: string;
      leadId: string;
      conversationId: string;
      externalMessageId: string;
      instanceName: string;
    };

    console.log(`[transcription] Processing audio for lead ${leadId}`);

    const channelConfig = await prisma.channel.findFirst({
      where: { accountId, type: "WHATSAPP", isEnabled: true },
    });
    if (!channelConfig) {
      console.error("[transcription] No WhatsApp config found");
      return;
    }

    const cfg = channelConfig.config as Record<string, string>;
    const wa = new WhatsAppProvider({
      instanceName: cfg.instanceName || instanceName,
      evolutionApiUrl: cfg.evolutionApiUrl || process.env.EVOLUTION_API_URL || "",
      evolutionApiKey: cfg.evolutionApiKey || process.env.EVOLUTION_API_KEY || "",
    });

    const { buffer, mimetype } = await wa.downloadMedia(externalMessageId);
    const text = await AIEngine.transcribeAudio({ buffer, mimetype });

    if (!text) {
      console.warn(`[transcription] Empty transcription for ${leadId}`);
      return;
    }

    const message = await prisma.message.create({
      data: {
        accountId,
        conversationId,
        direction: "INBOUND",
        content: text,
        contentType: "AUDIO",
        externalId: externalMessageId,
        metadata: { originalType: "audio", transcription: text },
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Feed into the debounce buffer so it's combined with any pending text
    await debounceMessage({
      conversationId,
      messageId: message.id,
      accountId,
      leadId,
      channel: "WHATSAPP",
    });

    console.log(`[transcription] Audio transcribed for lead ${leadId}`);
  },
  { connection, concurrency: 2 }
);

// ═══════════════════════════════════════════════════════
// WORKER 5: FOLLOW-UP (24h nudge if lead never replied)
// ═══════════════════════════════════════════════════════

const followUpWorker = new Worker(
  "follow-up",
  async (job) => {
    const {
      leadId,
      accountId,
      channel,
      conversationId,
      attemptIndex,
      instruction,
    } = job.data as {
      leadId: string;
      accountId: string;
      channel: Channel;
      conversationId: string;
      attemptIndex?: number;
      instruction?: string;
    };
    console.log(
      `[follow-up] lead=${leadId} channel=${channel} attempt=${attemptIndex ?? 0}`
    );

    // Stop the cadence as soon as the lead engages.
    const inboundCount = await prisma.message.count({
      where: { conversationId, direction: "INBOUND" },
    });
    if (inboundCount > 0) {
      console.log(`[follow-up] Lead ${leadId} already replied, skipping`);
      return;
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;
    // Allow follow-ups while the lead is CONTACTED or UNRESPONSIVE so the
    // full cadence runs even after we marked them unresponsive at attempt 1.
    if (lead.status !== "CONTACTED" && lead.status !== "UNRESPONSIVE") return;

    const followUpMsg = await AIEngine.generateFollowUp({
      accountId,
      leadName: lead.name || undefined,
      leadSource: lead.source,
      channel,
      instruction,
      attemptIndex: attemptIndex ?? 0,
    });

    const contactId =
      channel === "EMAIL" ? lead.email || "" : lead.phone || "";
    if (!contactId) return;

    const provider = await getChannelProvider(accountId, channel);
    if (!provider) return;

    const dbMessage = await prisma.message.create({
      data: {
        accountId,
        conversationId,
        direction: "OUTBOUND",
        content: followUpMsg,
        contentType: "TEXT",
        isAIGenerated: true,
        status: "PENDING",
        metadata: {
          type: "follow-up",
          attemptIndex: attemptIndex ?? 0,
          instruction: instruction || "",
        },
      },
    });

    const result = await provider.send(contactId, followUpMsg);
    await prisma.message.update({
      where: { id: dbMessage.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        externalId: result.externalId || null,
      },
    });

    // Only flip to UNRESPONSIVE on the LAST configured attempt. Otherwise
    // leave the lead as CONTACTED so subsequent follow-ups still fire.
    // We don't know the total count from here, but the lead-processing
    // worker scheduled them with their full ladder so the last delayed job
    // will simply finalize.
    if (!result.success) {
      console.warn(`[follow-up] send failed for lead ${leadId}: ${result.error}`);
    }

    console.log(`[follow-up] sent to ${leadId} via ${channel}`);
  },
  { connection, concurrency: 5 }
);

// ═══════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════

async function shutdown() {
  console.log("\nShutting down workers...");
  await Promise.all([
    leadWorker.close(),
    messageSendingWorker.close(),
    aiWorker.close(),
    transcriptionWorker.close(),
    followUpWorker.close(),
  ]);
  try {
    await getRedis().quit();
  } catch {
    // ignore
  }
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("All workers running. Waiting for jobs...");
