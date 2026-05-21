// src/lib/channels/email.ts
import type { ChannelProvider, SendResult } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deriveSubject(content: string): string {
  const firstLine = (content || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0] || "";
  // Trim to a clean sentence-style preview, max 78 chars (RFC-friendly).
  const clean = firstLine.replace(/[#*_>`]+/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "Mensagem";
  return clean.length > 78 ? `${clean.slice(0, 75)}...` : clean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    const dest = (to || "").trim().toLowerCase();
    if (!EMAIL_RE.test(dest)) {
      return { success: false, error: "invalid_email_format" };
    }
    if (!content || !content.trim()) {
      return { success: false, error: "empty_body" };
    }

    const apiKey =
      this.config.provider === "platform"
        ? process.env.RESEND_API_KEY
        : this.config.resendApiKey;
    if (!apiKey) return { success: false, error: "missing_api_key" };

    // Use the configured from-email when available; fall back only as a
    // last resort. The channel save route already enforces a valid from.
    const fromEmail =
      this.config.fromEmail ||
      `noreply@${this.config.domain || "resend.dev"}`;
    const from = `${this.config.fromName || "MKT Digital"} <${fromEmail}>`;

    const subject = (opts?.subject || deriveSubject(content)).slice(0, 200);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: [dest],
          subject,
          text: content.slice(0, 50_000),
          html: `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">${escapeHtml(
            content.slice(0, 50_000)
          ).replace(/\n/g, "<br>")}</div>`,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!res.ok) {
        return {
          success: false,
          error: data?.message || `resend_http_${res.status}`,
        };
      }
      return { success: true, externalId: data?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
