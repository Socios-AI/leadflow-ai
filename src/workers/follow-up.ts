import { Job } from "bullmq";
import prisma from "@/lib/db/prisma";
import { queues } from "@/lib/queues";
import { AIEngine } from "@/lib/ai/engine";

export async function processFollowUp(job: Job<any>) {
  const { accountId, conversationId, leadId, channel, attempt } = job.data;
  
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { skipped: true, reason: "Lead not found" };

  const msg = await AIEngine.generateFirstContact({ 
    accountId, 
    leadName: lead.name || undefined, 
    leadSource: lead.source, 
    channel 
  });

  await prisma.message.create({
    data: { 
      accountId, 
      conversationId, 
      direction: "OUTBOUND", 
      content: msg, 
      isAIGenerated: true 
    } as any,
  });

  await queues.messageSending.add("send", { 
    conversationId, 
    accountId, 
    channel, 
    to: lead.phone || lead.email, 
    content: msg 
  });

  try { 
    await (prisma as any).eventLog?.create({ 
      data: { accountId, event: "lead.follow_up", data: { leadId, attempt } } 
    }); 
  } catch(e) {}
  
  return { sent: true };
}