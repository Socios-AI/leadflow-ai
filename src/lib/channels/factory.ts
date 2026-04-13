// src/lib/channels/factory.ts
import prisma from "@/lib/db/prisma";
import type { ChannelProvider } from "./types";
import { WhatsAppProvider } from "./whatsapp";
import { EmailProvider } from "./email";
import { SMSProvider } from "./sms";

/**
 * Get a channel provider for a specific account and channel type.
 * Reads config from the channels table.
 */
export async function getChannelProvider(
  accountId: string,
  channel: "WHATSAPP" | "EMAIL" | "SMS"
): Promise<ChannelProvider | null> {
  const channelConfig = await prisma.channel.findUnique({
    where: { accountId_type: { accountId, type: channel } },
  });

  if (!channelConfig || !channelConfig.isEnabled) return null;

  const cfg = channelConfig.config as Record<string, any>;

  switch (channel) {
    case "WHATSAPP":
      return new WhatsAppProvider({
        instanceName: cfg.instanceName,
        evolutionApiUrl: cfg.evolutionApiUrl || process.env.EVOLUTION_API_URL!,
        evolutionApiKey: cfg.evolutionApiKey || process.env.EVOLUTION_API_KEY!,
      });

    case "EMAIL":
      return new EmailProvider({
        provider: cfg.provider || "platform",
        resendApiKey: cfg.resendApiKey,
        domain: cfg.domain,
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
      });

    case "SMS":
      return new SMSProvider({
        twilioAccountSid: cfg.twilioAccountSid,
        twilioAuthToken: cfg.twilioAuthToken,
        twilioPhoneNumber: cfg.twilioPhoneNumber,
      });

    default:
      return null;
  }
}