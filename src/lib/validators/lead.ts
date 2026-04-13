import { z } from "zod/v3";

export const webhookLeadSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  countryCode: z.string().min(2).max(3).optional(),
  source: z.enum(["MARKETING", "WEBSITE", "MANUAL", "API", "REFERRAL"]).optional(),
  campaignId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type WebhookLeadInput = z.infer<typeof webhookLeadSchema>;