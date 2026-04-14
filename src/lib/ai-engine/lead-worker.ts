// src/lib/ai-engine/lead-worker.ts

/**
 * ══════════════════════════════════════════════════════════════
 * LEAD PROCESSING WORKER
 * ══════════════════════════════════════════════════════════════
 *
 * This worker handles the complete lifecycle of a lead:
 *
 * 1. NEW LEAD ARRIVES (via webhook)
 *    → Create lead in DB
 *    → Create conversation
 *    → If AI initiates: generate & send first message
 *
 * 2. INBOUND MESSAGE ARRIVES (via Evolution API webhook / email / SMS)
 *    → Apply debounce (wait for lead to finish typing)
 *    → Check if AI is enabled for this conversation
 *    → Process message through AI engine
 *    → Send typing indicator (presence)
 *    → Send AI response via appropriate channel
 *
 * 3. FOLLOW-UP (scheduled)
 *    → Check if lead responded
 *    → If not, generate and send follow-up message
 *
 * In production, this runs as a BullMQ worker processing jobs
 * from the leadProcessing queue.
 *
 * Usage:
 *   import { processNewLead, processInboundMessage } from "./lead-worker";
 */

import {
  processMessage,
  generateFirstMessage,
  debounceMessage,
  type AIConfig,
  type ConversationContext,
} from "./processor";

// ══════════════════════════════════════
// TYPES
// ══════════════════════════════════════

interface NewLeadJob {
  leadId: string;
  accountId: string;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
}

interface InboundMessageJob {
  conversationId: string;
  accountId: string;
  content: string;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
  senderPhone?: string;
  senderEmail?: string;
}

// ══════════════════════════════════════
// PROCESS NEW LEAD
// ══════════════════════════════════════

export async function processNewLead(job: NewLeadJob): Promise<void> {
  const { leadId, accountId, channel } = job;

  console.log(`[Worker] Processing new lead: ${leadId} on ${channel}`);

  try {
    // In production with Prisma:
    //
    // 1. Load lead data
    // const lead = await prisma.lead.findUnique({
    //   where: { id: leadId },
    //   include: { campaign: true },
    // });
    // if (!lead) throw new Error(`Lead ${leadId} not found`);
    //
    // 2. Load AI config
    // const aiConfig = await prisma.aIConfig.findFirst({
    //   where: { accountId },
    // });
    // if (!aiConfig) throw new Error(`AI config not found for account ${accountId}`);
    //
    // 3. Create conversation
    // const conversation = await prisma.conversation.create({
    //   data: {
    //     accountId,
    //     leadId,
    //     channel,
    //     isActive: true,
    //     isAIEnabled: true,
    //   },
    // });
    //
    // 4. Generate first message if AI initiates
    // if (aiConfig.aiInitiatesContact) {
    //   const context: ConversationContext = {
    //     conversationId: conversation.id,
    //     accountId,
    //     leadName: lead.name || "",
    //     leadPhone: lead.phone || "",
    //     leadEmail: lead.email || "",
    //     channel,
    //     campaignName: lead.campaign?.name || null,
    //     isAIEnabled: true,
    //     messageHistory: [],
    //   };
    //
    //   const firstMessage = await generateFirstMessage(
    //     mapAIConfig(aiConfig),
    //     context
    //   );
    //
    //   if (firstMessage) {
    //     // Send typing indicator first
    //     const provider = await getChannelProvider(accountId, channel);
    //     if (provider && channel === "WHATSAPP") {
    //       await provider.sendPresence(lead.phone!, firstMessage.length);
    //     }
    //
    //     // Send the message
    //     const contactId = channel === "EMAIL" ? lead.email! : lead.phone!;
    //     const result = await provider?.send(contactId, firstMessage);
    //
    //     // Save the message
    //     await prisma.message.create({
    //       data: {
    //         accountId,
    //         conversationId: conversation.id,
    //         direction: "OUTBOUND",
    //         content: firstMessage,
    //         contentType: "TEXT",
    //         isAIGenerated: true,
    //         status: result?.success ? "SENT" : "FAILED",
    //         externalId: result?.externalId || null,
    //       },
    //     });
    //
    //     // Update conversation
    //     await prisma.conversation.update({
    //       where: { id: conversation.id },
    //       data: { lastMessageAt: new Date() },
    //     });
    //   }
    // }

    console.log(`[Worker] Lead ${leadId} processed successfully`);
  } catch (error) {
    console.error(`[Worker] Error processing lead ${leadId}:`, error);
    throw error;
  }
}

// ══════════════════════════════════════
// PROCESS INBOUND MESSAGE
// ══════════════════════════════════════

export async function processInboundMessage(job: InboundMessageJob): Promise<void> {
  const { conversationId, accountId, content, channel } = job;

  console.log(`[Worker] Inbound message on conversation: ${conversationId}`);

  try {
    // In production with Prisma:
    //
    // 1. Load conversation + lead + ai config
    // const conversation = await prisma.conversation.findFirst({
    //   where: { id: conversationId, accountId },
    //   include: {
    //     lead: true,
    //     messages: {
    //       orderBy: { createdAt: "asc" },
    //       take: 20, // Last 20 messages for context
    //     },
    //   },
    // });
    // if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
    //
    // // Skip if AI is disabled
    // if (!conversation.isAIEnabled) {
    //   console.log(`[Worker] AI disabled for conversation ${conversationId}, skipping`);
    //   return;
    // }
    //
    // const aiConfig = await prisma.aIConfig.findFirst({
    //   where: { accountId },
    // });
    // if (!aiConfig) throw new Error(`AI config not found`);
    //
    // 2. Save inbound message
    // await prisma.message.create({
    //   data: {
    //     accountId,
    //     conversationId,
    //     direction: "INBOUND",
    //     content,
    //     contentType: "TEXT",
    //     isAIGenerated: false,
    //     status: "DELIVERED",
    //   },
    // });
    //
    // 3. Apply debounce
    // const config = mapAIConfig(aiConfig);
    //
    // debounceMessage(
    //   conversationId,
    //   content,
    //   config.debounceSeconds,
    //   async (accumulatedMessages) => {
    //     // 4. Build context
    //     const context: ConversationContext = {
    //       conversationId,
    //       accountId,
    //       leadName: conversation.lead.name || "",
    //       leadPhone: conversation.lead.phone || "",
    //       leadEmail: conversation.lead.email || "",
    //       channel,
    //       campaignName: null,
    //       isAIEnabled: true,
    //       messageHistory: conversation.messages.map((m) => ({
    //         role: m.direction === "INBOUND" ? "user" as const : "assistant" as const,
    //         content: m.content,
    //         timestamp: m.createdAt.toISOString(),
    //       })),
    //     };
    //
    //     // 5. Process through AI
    //     const result = await processMessage(context, accumulatedMessages, config);
    //
    //     if (result.action === "SKIP") return;
    //
    //     if (result.response) {
    //       // 6. Send typing indicator
    //       const provider = await getChannelProvider(accountId, channel);
    //       if (provider && channel === "WHATSAPP") {
    //         await provider.sendPresence(
    //           conversation.lead.phone!,
    //           result.response.length
    //         );
    //       }
    //
    //       // 7. Send response
    //       const contactId = channel === "EMAIL"
    //         ? conversation.lead.email!
    //         : conversation.lead.phone!;
    //       const sendResult = await provider?.send(contactId, result.response);
    //
    //       // 8. Save AI message
    //       await prisma.message.create({
    //         data: {
    //           accountId,
    //           conversationId,
    //           direction: "OUTBOUND",
    //           content: result.response,
    //           contentType: "TEXT",
    //           isAIGenerated: true,
    //           status: sendResult?.success ? "SENT" : "FAILED",
    //           externalId: sendResult?.externalId || null,
    //         },
    //       });
    //
    //       // 9. Update conversation metadata
    //       await prisma.conversation.update({
    //         where: { id: conversationId },
    //         data: {
    //           lastMessageAt: new Date(),
    //           sentiment: result.sentiment,
    //           ...(result.detectedLanguage && { language: result.detectedLanguage }),
    //           ...(result.action === "ESCALATE" && { isAIEnabled: false }),
    //         },
    //       });
    //
    //       // 10. Handle special actions
    //       if (result.action === "ESCALATE") {
    //         await prisma.eventLog.create({
    //           data: {
    //             accountId,
    //             event: "conversation.escalated",
    //             data: { conversationId, reason: "trigger_match" },
    //           },
    //         });
    //         // TODO: Send notification to human operator
    //       }
    //
    //       if (result.action === "CONVERT") {
    //         await prisma.lead.update({
    //           where: { id: conversation.leadId },
    //           data: { status: "CONVERTED" },
    //         });
    //         await prisma.eventLog.create({
    //           data: {
    //             accountId,
    //             event: "lead.converted",
    //             data: { leadId: conversation.leadId, conversationId },
    //           },
    //         });
    //       }
    //
    //       // 11. Schedule follow-up if needed
    //       if (result.shouldFollowUp && config.followUpDelayMinutes > 0) {
    //         await queues.followUp.add(
    //           "follow-up",
    //           { conversationId, accountId },
    //           { delay: config.followUpDelayMinutes * 60 * 1000 }
    //         );
    //       }
    //     }
    //   }
    // );

    console.log(`[Worker] Message processed for conversation ${conversationId}`);
  } catch (error) {
    console.error(`[Worker] Error processing message:`, error);
    throw error;
  }
}

// ══════════════════════════════════════
// FOLLOW-UP PROCESSOR
// ══════════════════════════════════════

export async function processFollowUp(conversationId: string, accountId: string): Promise<void> {
  console.log(`[Worker] Processing follow-up for conversation: ${conversationId}`);

  // In production:
  // 1. Check if conversation is still active and AI-enabled
  // 2. Check if the lead has responded since the last AI message
  // 3. If not, generate and send a follow-up message
  // 4. Mark follow-up as sent

  // const conversation = await prisma.conversation.findFirst({
  //   where: { id: conversationId, accountId, isAIEnabled: true, isActive: true },
  //   include: {
  //     messages: { orderBy: { createdAt: "desc" }, take: 1 },
  //     lead: true,
  //   },
  // });
  //
  // if (!conversation) return;
  //
  // const lastMessage = conversation.messages[0];
  // if (lastMessage?.direction === "INBOUND") {
  //   // Lead already responded, no follow-up needed
  //   return;
  // }
  //
  // // Generate follow-up via AI
  // const aiConfig = await prisma.aIConfig.findFirst({ where: { accountId } });
  // // ... generate and send follow-up
}

// ══════════════════════════════════════
// CONFIG MAPPER (DB -> Engine types)
// ══════════════════════════════════════

// function mapAIConfig(dbConfig: any): AIConfig {
//   return {
//     provider: dbConfig.provider || "anthropic",
//     model: dbConfig.model || "claude-sonnet-4-20250514",
//     systemPrompt: dbConfig.systemPrompt || "",
//     temperature: dbConfig.temperature ?? 0.7,
//     maxTokens: dbConfig.maxTokens ?? 500,
//     aiName: dbConfig.aiName || "Luna",
//     aiRole: dbConfig.aiRole || "Sales Consultant",
//     tone: dbConfig.tone || "professional_friendly",
//     language: dbConfig.language || "auto",
//     rules: dbConfig.rules || [],
//     escalationTriggers: (dbConfig.escalationTriggers || "").split(",").map((s: string) => s.trim()).filter(Boolean),
//     conversionTriggers: (dbConfig.conversionTriggers || "").split(",").map((s: string) => s.trim()).filter(Boolean),
//     debounceSeconds: dbConfig.debounceSeconds ?? 8,
//     offHoursMessage: dbConfig.offHoursMessage || "",
//     followUpDelayMinutes: parseInt(dbConfig.followUpDelay || "30"),
//     aiInitiatesContact: dbConfig.aiInitiatesContact ?? true,
//     firstMessageInstruction: dbConfig.firstMessageInstruction || "",
//   };
// }