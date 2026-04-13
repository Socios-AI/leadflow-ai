import { Job } from "bullmq";
import prisma from "@/lib/db/prisma";

interface WebhookDispatchData {
  accountId: string;
  event: string;
  payload: Record<string, unknown>;
}

export async function processWebhookDispatch(job: Job<WebhookDispatchData>) {
  const { accountId, event, payload } = job.data;

  if (!(prisma as any).webhook) {
    return { skipped: true, reason: "Webhook model not found" };
  }

  const webhooks = await (prisma as any).webhook.findMany({
    where: {
      accountId,
      isActive: true,
      events: { has: event },
    },
  });

  const results = await Promise.allSettled(
    webhooks.map(async (webhook: any) => {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": webhook.secret,
          "X-Event": event,
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      return { webhookId: webhook.id, status: response.status };
    })
  );

  try {
    await (prisma as any).eventLog?.create({
      data: {
        accountId,
        event: "webhook.dispatched",
        data: {
          targetEvent: event,
          results: results.map((r: any, i: number) => ({
            webhookId: webhooks[i].id,
            status: r.status,
            reason: r.status === "rejected" ? r.reason?.message : undefined,
          })),
        },
      },
    });
  } catch(e) {}

  return { dispatched: webhooks.length, results };
}