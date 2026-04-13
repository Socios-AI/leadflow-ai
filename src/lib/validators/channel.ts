import { z } from "zod";

export const whatsappConfigSchema = z.object({
  instanceName: z.string().min(1),
  evolutionApiUrl: z.string().url(),
  evolutionApiKey: z.string().min(1),
});

export const emailConfigSchema = z.object({
  provider: z.enum(["platform", "custom"]),
  resendApiKey: z.string().optional(),
  domain: z.string().min(1),
  fromName: z.string().min(1),
  fromEmail: z.string().min(1),
});

export const smsConfigSchema = z.object({
  twilioAccountSid: z.string().min(1),
  twilioAuthToken: z.string().min(1),
  twilioPhoneNumber: z.string().min(1),
});

export type WhatsAppConfig = z.infer<typeof whatsappConfigSchema>;
export type EmailConfig = z.infer<typeof emailConfigSchema>;
export type SMSConfig = z.infer<typeof smsConfigSchema>;