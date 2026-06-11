// src/lib/channels/factory.ts
import prisma from "@/lib/db/prisma";
import type { ChannelProvider } from "./types";
import { WhatsAppProvider } from "./whatsapp";
import { EmailProvider } from "./email";
import { SMSProvider } from "./sms";

type ChannelType = "WHATSAPP" | "EMAIL" | "SMS";

interface ChannelRow {
  id: string;
  type: ChannelType | string;
  isEnabled: boolean;
  config: unknown;
}

/**
 * Build a provider instance from a channel row. Centralized so the by-type,
 * by-id and by-conversation resolvers all share one code path.
 */
function buildProvider(channel: ChannelRow): ChannelProvider | null {
  if (!channel.isEnabled) return null;
  const cfg = (channel.config as Record<string, any>) || {};

  switch (channel.type) {
    case "WHATSAPP":
      return new WhatsAppProvider({
        instanceName: cfg.instanceName,
        evolutionApiUrl: cfg.evolutionApiUrl || process.env.EVOLUTION_API_URL!,
        evolutionApiKey: cfg.evolutionApiKey || process.env.EVOLUTION_API_KEY!,
      });

    case "EMAIL": {
      // Legacy configs may use `provider` instead of `mode`; default to platform.
      const rawMode = cfg.mode || cfg.provider;
      const mode: "platform" | "custom" = rawMode === "custom" ? "custom" : "platform";
      return new EmailProvider({
        mode,
        alias: cfg.alias,
        resendApiKey: cfg.resendApiKey,
        domain: cfg.domain,
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
      });
    }

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

/**
 * Get a channel provider for an account by TYPE.
 *
 * PHASE 1: was findUnique(accountId_type); now findFirst by
 * (accountId, type, isEnabled). For an account with a single channel of that
 * type this is identical. It also stops depending on the accountId_type
 * composite unique, so it keeps working once Phase 3 allows several channels
 * of the same type (returns the first enabled one — callers that need a
 * SPECIFIC instance use getProviderForConversation / getChannelProviderById).
 */
export async function getChannelProvider(
  accountId: string,
  channel: ChannelType
): Promise<ChannelProvider | null> {
  const row = await prisma.channel.findFirst({
    where: { accountId, type: channel, isEnabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (!row) return null;
  return buildProvider(row as ChannelRow);
}

/** Get a provider for a SPECIFIC channel row (reply on the exact instance a
 *  conversation belongs to). */
export async function getChannelProviderById(
  accountId: string,
  channelId: string
): Promise<ChannelProvider | null> {
  const row = await prisma.channel.findFirst({ where: { id: channelId, accountId } });
  if (!row) return null;
  return buildProvider(row as ChannelRow);
}

/**
 * Resolve the provider a conversation should send through. When the
 * conversation is pinned to a specific channel instance (channelConfigId),
 * use it; otherwise fall back to the account's channel of that type. The
 * fallback keeps every current single-channel tenant working unchanged
 * (channelConfigId is NULL for them).
 */
export async function getProviderForConversation(
  accountId: string,
  type: ChannelType,
  channelConfigId?: string | null
): Promise<ChannelProvider | null> {
  if (channelConfigId) {
    const byId = await getChannelProviderById(accountId, channelConfigId);
    if (byId) return byId;
  }
  return getChannelProvider(accountId, type);
}
