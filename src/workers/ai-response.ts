import { Job } from "bullmq";
import prisma from "@/lib/db/prisma";
import { AIEngine } from "@/lib/ai/engine";
import { queues } from "@/lib/queues";

export async function processAIResponse(job: Job<any>) {
  const { conversationId, accountId, messageContent, channel } = job.data;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { include: { campaign: true } }, messages: { orderBy: { createdAt: "desc" }, take: 20 } },
  });

  if (!conversation) return;

  const lead = conversation.lead;
  const campaignInfo = lead.campaign ? `Campaign: ${lead.campaign.name} | Info: ${(lead.campaign as any).transcription || ""}` : undefined;

  const history = conversation.messages.reverse().map((m) => ({ role: m.direction === "INBOUND" ? "user" : "assistant", content: m.content })) as any;

  const res = await AIEngine.generateResponse({ accountId, leadName: lead.name || undefined, leadSource: lead.source, campaignInfo, conversationHistory: history, currentMessage: messageContent, channel });

  await prisma.message.create({
    data: { accountId, conversationId, direction: "OUTBOUND", content: res.message, isAIGenerated: true } as any,
  });

  await queues.messageSending.add("send", { conversationId, accountId, channel, to: (conversation as any).channelIdentifier || lead.phone, content: res.message });

  try { await (prisma as any).eventLog?.create({ data: { accountId, event: "ai.responded", data: { conversationId } } }); } catch(e) {}

  return res;
}