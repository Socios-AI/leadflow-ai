import { Job } from "bullmq";
import prisma from "@/lib/db/prisma";
import { getChannelProvider } from "@/lib/channels/factory";

export async function processMessageSending(job: Job<any>) {
  const { conversationId, accountId, channel, to, content, subject } = job.data;

  const provider = await getChannelProvider(accountId, channel);
  if (!provider) return { success: false, error: "Provider null" };

  const result = await provider.send({ to, message: content, subject });

  if (result.success) {
    try { await (prisma.conversation as any).update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }); } catch(e) {}
    try { await (prisma as any).eventLog?.create({ data: { accountId, event: "msg.sent", data: { conversationId } } }); } catch(e) {}
  }

  return result;
}