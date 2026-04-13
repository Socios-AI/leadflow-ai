// src/workers/index.ts
//
// Run with: npx tsx src/workers/index.ts
// Or in production: node dist/workers/index.js
//
// All BullMQ workers for the lead engagement pipeline.

import { Worker } from "bullmq";
import { getQueueConnection } from "@/lib/redis";
import prisma from "@/lib/db/prisma";
import { AIEngine } from "@/lib/ai/engine";
import { getChannelProvider } from "@/lib/channels/factory";
import { WhatsAppProvider } from "@/lib/channels/whatsapp";
import { queues } from "@/lib/queues";

const connection = getQueueConnection();

console.log("Starting workers...");

// ═══════════════════════════════════════════════════════
// WORKER 1: LEAD PROCESSING
// When a new lead arrives, generate first contact and send.
// ═══════════════════════════════════════════════════════

const leadWorker = new Worker(
  "lead-processing",
  async (job) => {
    const { leadId, accountId, channel } = job.data;
    console.log(`[lead-processing] New lead ${leadId} on ${channel}`);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        campaign: {
          select: { name: true, transcription: true, description: true },
        },
      },
    });

    if (!lead || lead.status !== "NEW") {
      console.log(`[lead-processing] Lead ${leadId} not NEW, skipping`);
      return;
    }

    const campaignInfo = lead.campaign
      ? `Campaign: ${lead.campaign.name}\n${lead.campaign.description || ""}\n${lead.campaign.transcription || ""}`
      : undefined;

    // Generate first contact message via AI
    const message = await AIEngine.generateFirstContact({
      accountId,
      leadName: lead.name || undefined,
      leadSource: lead.source,
      campaignInfo,
      channel: channel as "WHATSAPP" | "EMAIL" | "SMS",
    });

    // Create or get conversation
    const contactId = channel === "EMAIL" ? lead.email! : lead.phone!;

    const conversation = await prisma.conversation.upsert({
      where: {
        accountId_leadId_channel: { accountId, leadId, channel },
      },
      create: {
        accountId,
        leadId,
        channel,
        channelIdentifier: contactId,
        isActive: true,
        isAIEnabled: true,
        lastMessageAt: new Date(),
      },
      update: {
        isActive: true,
        lastMessageAt: new Date(),
      },
    });

    // Save outbound message
    const dbMessage = await prisma.message.create({
      data: {
        accountId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: message,
        contentType: "TEXT",
        isAIGenerated: true,
        status: "PENDING",
      },
    });

    // Send via channel provider
    const provider = await getChannelProvider(accountId, channel as any);

    if (!provider) {
      console.error(
        `[lead-processing] No ${channel} provider for account ${accountId}`
      );
      await prisma.message.update({
        where: { id: dbMessage.id },
        data: { status: "FAILED" },
      });
      return;
    }

    const sendOpts = channel === "EMAIL" ? { subject: "Hello!" } : {};
    const result = await provider.send(contactId, message, sendOpts);

    // Update message status
    await prisma.message.update({
      where: { id: dbMessage.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        externalId: result.externalId || null,
      },
    });

    // Update lead status
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: "CONTACTED",
        lastContactAt: new Date(),
      },
    });

    // Log event
    await prisma.eventLog.create({
      data: {
        accountId,
        event: "lead.first_contact",
        data: {
          leadId,
          channel,
          success: result.success,
          messageId: dbMessage.id,
        },
      },
    });

    // Schedule follow-up (24h)
    await queues.followUp.add(
      "follow-up",
      { leadId, accountId, channel, conversationId: conversation.id },
      { delay: 24 * 60 * 60 * 1000 }
    );

    console.log(
      `[lead-processing] First contact sent to ${leadId} via ${channel}`
    );
  },
  { connection, concurrency: 5 }
);

// ═══════════════════════════════════════════════════════
// WORKER 2: MESSAGE SENDING
// Sends messages via channel providers.
// ═══════════════════════════════════════════════════════

const messageSendingWorker = new Worker(
  "message-sending",
  async (job) => {
    const { accountId, messageId, channel, to } = job.data;
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

    const result = await provider.send(to, msg.content);

    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: result.success ? "SENT" : "FAILED",
        externalId: result.externalId || null,
      },
    });

    console.log(
      `[message-sending] ${result.success ? "Sent" : "Failed"} message ${messageId}`
    );
  },
  { connection, concurrency: 10 }
);

// ═══════════════════════════════════════════════════════
// WORKER 3: AI RESPONSE
// When a lead sends a message, generate AI response.
// ═══════════════════════════════════════════════════════

const aiWorker = new Worker(
  "ai-response",
  async (job) => {
    const { accountId, leadId, conversationId, channel } = job.data;
    console.log(`[ai-response] Processing response for lead ${leadId}`);

    // Get conversation history (last 20 messages)
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { direction: true, content: true },
    });

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        campaign: { select: { transcription: true, name: true } },
      },
    });

    if (!lead) return;

    // Build conversation history for AI
    const history = messages.slice(0, -1).map((m) => ({
      role: (m.direction === "INBOUND" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.content,
    }));

    const lastMessage = messages[messages.length - 1];

    const campaignInfo = lead.campaign
      ? `Campaign: ${lead.campaign.name}\n${lead.campaign.transcription || ""}`
      : undefined;

    // Generate AI response
    const aiResult = await AIEngine.generateResponse({
      accountId,
      leadName: lead.name || undefined,
      leadPhone: lead.phone || undefined,
      leadEmail: lead.email || undefined,
      leadSource: lead.source,
      campaignInfo,
      conversationHistory: history,
      currentMessage: lastMessage?.content || "",
      channel: (channel || "WHATSAPP") as "WHATSAPP" | "EMAIL" | "SMS",
    });

    // Save AI response
    const dbMessage = await prisma.message.create({
      data: {
        accountId,
        conversationId,
        direction: "OUTBOUND",
        content: aiResult.message,
        contentType: "TEXT",
        isAIGenerated: true,
        status: "PENDING",
        metadata: {
          tags: aiResult.tags,
          sentiment: aiResult.sentiment,
        },
      },
    });

    // Send via channel
    const contactId = channel === "EMAIL" ? lead.email! : lead.phone!;
    const provider = await getChannelProvider(accountId, channel);

    if (provider) {
      const result = await provider.send(contactId, aiResult.message);
      await prisma.message.update({
        where: { id: dbMessage.id },
        data: {
          status: result.success ? "SENT" : "FAILED",
          externalId: result.externalId || null,
        },
      });
    }

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        sentiment: aiResult.sentiment,
      },
    });

    // Handle conversion
    if (aiResult.isConversion) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "CONVERTED" },
      });
      await prisma.eventLog.create({
        data: {
          accountId,
          event: "lead.converted",
          data: { leadId, message: aiResult.notificationMessage },
        },
      });
    }

    // Handle escalation
    if (aiResult.isEscalation) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "QUALIFIED" },
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isAIEnabled: false },
      });
      await prisma.eventLog.create({
        data: {
          accountId,
          event: "lead.escalated",
          data: { leadId, message: aiResult.notificationMessage },
        },
      });
    }

    console.log(`[ai-response] Response sent for lead ${leadId}`);
  },
  { connection, concurrency: 3 }
);

// ═══════════════════════════════════════════════════════
// WORKER 4: TRANSCRIPTION
// Transcribe audio messages from WhatsApp.
// ═══════════════════════════════════════════════════════

const transcriptionWorker = new Worker(
  "transcription",
  async (job) => {
    const {
      accountId,
      leadId,
      conversationId,
      messageId,
      instanceName,
      type,
    } = job.data;
    console.log(`[transcription] Processing ${type} for lead ${leadId}`);

    if (type === "audio") {
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
        evolutionApiUrl: cfg.evolutionApiUrl,
        evolutionApiKey: cfg.evolutionApiKey,
      });

      // Download audio
      const audioBuffer = await wa.downloadMedia(messageId, instanceName);

      // Transcribe
      const text = await AIEngine.transcribeAudio(audioBuffer);

      // Save as inbound message
      const message = await prisma.message.create({
        data: {
          accountId,
          conversationId,
          direction: "INBOUND",
          content: text,
          contentType: "AUDIO",
          externalId: messageId,
          metadata: { originalType: "audio", transcription: text },
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      // Queue AI response
      await queues.aiResponse.add("respond", {
        accountId,
        leadId,
        conversationId,
        messageId: message.id,
        channel: "WHATSAPP",
      });

      console.log(`[transcription] Audio transcribed for lead ${leadId}`);
    }
  },
  { connection, concurrency: 2 }
);

// ═══════════════════════════════════════════════════════
// WORKER 5: FOLLOW-UP
// Send follow-up if lead hasn't responded.
// ═══════════════════════════════════════════════════════

const followUpWorker = new Worker(
  "follow-up",
  async (job) => {
    const { leadId, accountId, channel, conversationId } = job.data;
    console.log(`[follow-up] Checking lead ${leadId}`);

    // Check if lead has responded
    const inboundCount = await prisma.message.count({
      where: { conversationId, direction: "INBOUND" },
    });

    if (inboundCount > 0) {
      console.log(`[follow-up] Lead ${leadId} already responded, skipping`);
      return;
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead || lead.status !== "CONTACTED") return;

    // Generate follow-up message
    const followUpMsg = await AIEngine.generateFirstContact({
      accountId,
      leadName: lead.name || undefined,
      leadSource: lead.source,
      channel: channel as "WHATSAPP" | "EMAIL" | "SMS",
    });

    // Save and send
    const contactId = channel === "EMAIL" ? lead.email! : lead.phone!;
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
        metadata: { type: "follow-up" },
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

    // Mark as unresponsive if still no reply
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "UNRESPONSIVE" },
    });

    console.log(`[follow-up] Follow-up sent to lead ${leadId}`);
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
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("All workers running. Waiting for jobs...");