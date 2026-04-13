import { Job } from "bullmq";
import prisma from "@/lib/db/prisma";
import { AIEngine } from "@/lib/ai/engine";
import { queues } from "@/lib/queues";

export async function processNewLead(job: Job<any>) {
  const { leadId, accountId, channel } = job.data;

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { campaign: true } });
  if (!lead) return;

  const info = lead.campaign ? `Campaign: ${lead.campaign.name} | Info: ${(lead.campaign as any).transcription || ""}` : undefined;
  const msg = await AIEngine.generateFirstContact({ accountId, leadName: lead.name || undefined, leadSource: lead.source, campaignInfo: info, channel });

  const conversation = await (prisma.conversation as any).create({
    data: { accountId, leadId, channel, channelIdentifier: lead.phone || lead.email || "" },
  });

  await prisma.message.create({
    data: { accountId, conversationId: conversation.id, direction: "OUTBOUND", content: msg, isAIGenerated: true } as any,
  });

  await queues.messageSending.add("send", { conversationId: conversation.id, accountId, channel, to: lead.phone || lead.email, content: msg });

  try { await (prisma as any).eventLog?.create({ data: { accountId, event: "lead.contacted", data: { leadId } } }); } catch(e) {}

  return { success: true };
}