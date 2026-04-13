// src/lib/channels/email.ts
import type { ChannelProvider, SendResult } from "./types";

export class EmailProvider implements ChannelProvider {
  constructor(
    private config: {
      provider: "platform" | "custom";
      resendApiKey?: string;
      domain?: string;
      fromName?: string;
      fromEmail?: string;
    }
  ) {}

  async send(
    to: string,
    content: string,
    opts?: { subject?: string }
  ): Promise<SendResult> {
    const apiKey =
      this.config.provider === "platform"
        ? process.env.RESEND_API_KEY
        : this.config.resendApiKey;

    if (!apiKey) return { success: false, error: "No API key" };

    const from = `${this.config.fromName || "Team"} <${this.config.fromEmail || "noreply"}@${this.config.domain || "example.com"}>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: opts?.subject || "Hello",
          html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6">${content.replace(/\n/g, "<br>")}</div>`,
        }),
      });

      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
      return { success: true, externalId: data?.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}