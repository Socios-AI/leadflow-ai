// src/lib/channels/sms.ts
import type { ChannelProvider, SendResult } from "./types";

const E164_RE = /^\+[1-9]\d{6,14}$/;

export class SMSProvider implements ChannelProvider {
  constructor(
    private config: {
      twilioAccountSid: string;
      twilioAuthToken: string;
      twilioPhoneNumber: string;
    }
  ) {}

  async send(to: string, content: string): Promise<SendResult> {
    const dest = (to || "").trim();
    if (!E164_RE.test(dest)) {
      return { success: false, error: "invalid_phone_format" };
    }
    if (!content || !content.trim()) {
      return { success: false, error: "empty_body" };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Messages.json`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
            ).toString("base64"),
        },
        body: new URLSearchParams({
          To: dest,
          From: this.config.twilioPhoneNumber,
          Body: content.substring(0, 1600), // Twilio segment cap
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
        code?: number | string;
      };
      if (!res.ok) {
        return {
          success: false,
          error: data?.message || `twilio_http_${res.status}`,
        };
      }
      return { success: true, externalId: data?.sid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
