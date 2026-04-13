// src/lib/channels/types.ts

export interface SendResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export interface ChannelProvider {
  send(to: string, content: string, opts?: Record<string, any>): Promise<SendResult>;
  sendMedia?(
    to: string,
    mediaUrl: string,
    opts?: { caption?: string; mediatype?: string }
  ): Promise<SendResult>;
}