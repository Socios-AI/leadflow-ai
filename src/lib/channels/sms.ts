// src/lib/channels/sms.ts
import type { ChannelProvider, SendResult } from "./types";

export class SMSProvider implements ChannelProvider {
  constructor(
    private config: {
      twilioAccountSid: string;
      twilioAuthToken: string;
      twilioPhoneNumber: string;
    }
  ) {}

  async send(to: string, content: string): Promise<SendResult> {
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
          To: to,
          From: this.config.twilioPhoneNumber,
          Body: content.substring(0, 1600), // Twilio max
        }),
      });

      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
      return { success: true, externalId: data?.sid };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}