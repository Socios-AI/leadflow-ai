// src/lib/notifications/team-handoff.ts
//
// Send a "team handoff" notification when the AI decides a lead needs a
// human (link generation, complex objection, etc.). Two delivery
// channels, both best-effort:
//   1. Email — Resend, using PLATFORM_RESEND_API_KEY so the operator
//              doesn't have to configure anything extra.
//   2. Webhook — generic POST of the same payload; works with Slack,
//                Discord, Make, n8n, Zapier, etc.
//
// The notification carries enough context that the team member can
// generate the closing link (or whatever artifact they need) and either
// send it back to the lead manually or paste it into the dashboard.

import { logger } from "@/lib/logger";
import { platformEmailDomain } from "@/lib/channels/email";

const log = logger.child({ module: "notifications/team-handoff" });

export interface TeamHandoffInput {
  /** Tenant the lead belongs to (for trace) */
  accountId: string;
  /** Conversation id so the operator can deep-link into the inbox */
  conversationId: string;
  /** Lead identifiers */
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  /** Why the AI escalated — usually the AI's short summary */
  reason: string;
  /** What the operator should DO (e.g. "generate Stripe checkout for plan X") */
  requestedAction: string;
  /** Captured qualifying answers, key->value */
  capturedInfo: Record<string, string>;
  /** Last N turns of the conversation as a transcript */
  transcript: string;
  /** Destination email (config.pipelineHandoffEmail) */
  toEmail: string;
  /** Optional webhook (config.pipelineHandoffWebhook) */
  toWebhook?: string;
  /** Public app URL so we can deep-link to /conversations */
  appUrl: string;
}

export interface TeamHandoffResult {
  ok: boolean;
  emailSent: boolean;
  webhookSent: boolean;
  errors: string[];
}

export async function sendTeamHandoff(input: TeamHandoffInput): Promise<TeamHandoffResult> {
  const errors: string[] = [];
  let emailSent = false;
  let webhookSent = false;

  const conversationUrl = `${input.appUrl.replace(/\/+$/, "")}/conversations?id=${encodeURIComponent(input.conversationId)}`;

  // ── 1. Email (Resend) ──
  if (input.toEmail) {
    try {
      emailSent = await sendEmail({
        to: input.toEmail,
        subject: `Lead pronto pra fechar: ${input.leadName || input.leadPhone || input.leadEmail || "novo lead"}`,
        html: renderEmailHtml(input, conversationUrl),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`email_failed: ${msg}`);
      log.warn("team handoff email failed", { err: msg });
    }
  } else {
    errors.push("no_handoff_email_configured");
  }

  // ── 2. Webhook (Slack / Discord / Make / n8n / Zapier) ──
  if (input.toWebhook) {
    try {
      const payload = {
        event: "team_handoff",
        accountId: input.accountId,
        conversationId: input.conversationId,
        conversationUrl,
        lead: {
          name: input.leadName,
          phone: input.leadPhone,
          email: input.leadEmail,
        },
        reason: input.reason,
        requestedAction: input.requestedAction,
        capturedInfo: input.capturedInfo,
        transcript: input.transcript,
        // Slack-friendly fallback text so the message renders even with
        // no blocks/attachments. Slack ignores extra fields it doesn't
        // know about, so this same payload works for any webhook tool.
        text: renderSlackText(input, conversationUrl),
      };
      const res = await fetch(input.toWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      webhookSent = res.ok;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        errors.push(`webhook_http_${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`webhook_error: ${msg}`);
      log.warn("team handoff webhook failed", { err: msg });
    }
  }

  return {
    ok: emailSent || webhookSent,
    emailSent,
    webhookSent,
    errors,
  };
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  // ONLY use the platform key here — the from address is hardcoded to
  // handoff@mkt.sociosai.com (the platform's transactional domain), and
  // a tenant Resend key wouldn't have permission to send from it. The
  // previous fallback to RESEND_API_KEY caused 403s in tenants that had
  // only their own key configured. Better to fail loudly so the operator
  // configures the platform key once in Coolify.
  const apiKey = process.env.PLATFORM_RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PLATFORM_RESEND_API_KEY not configured. Set it in Coolify env vars to enable team handoff emails."
    );
  }
  const from = `MKT Digital <handoff@${platformEmailDomain()}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

function renderEmailHtml(input: TeamHandoffInput, conversationUrl: string): string {
  const info = Object.entries(input.capturedInfo || {})
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#475569;font-size:13px">${escapeHtml(k)}</td><td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:500">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Inter,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
  <h1 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#0f172a">Lead pronto pra fechar</h1>
  <p style="margin:0 0 20px;color:#64748b;font-size:13px;line-height:1.5">A IA pediu pra voce gerar a proxima acao com este lead.</p>

  <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin-bottom:16px">
    <p style="margin:0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Lead</p>
    <p style="margin:4px 0 0;font-size:16px;font-weight:600;color:#0f172a">${escapeHtml(input.leadName || "Sem nome")}</p>
    <p style="margin:2px 0;font-size:13px;color:#475569">${escapeHtml(input.leadPhone || "")}</p>
    <p style="margin:2px 0;font-size:13px;color:#475569">${escapeHtml(input.leadEmail || "")}</p>
  </div>

  <div style="margin-bottom:16px">
    <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Motivo do handoff</p>
    <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.5">${escapeHtml(input.reason || "(nao especificado)")}</p>
  </div>

  ${input.requestedAction ? `<div style="margin-bottom:16px">
    <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Acao solicitada</p>
    <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.5;background:#fef3c7;padding:10px 12px;border-radius:8px;border:1px solid #fde68a">${escapeHtml(input.requestedAction)}</p>
  </div>` : ""}

  ${info ? `<div style="margin-bottom:16px">
    <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Informacoes capturadas</p>
    <table style="width:100%;border-collapse:collapse">${info}</table>
  </div>` : ""}

  ${input.transcript ? `<details style="margin-bottom:16px">
    <summary style="cursor:pointer;font-size:12px;color:#3b82f6;font-weight:600">Ver ultimas mensagens</summary>
    <pre style="margin:8px 0 0;font-size:12px;color:#475569;background:#f8fafc;border-radius:8px;padding:12px;white-space:pre-wrap;font-family:ui-monospace,monospace;line-height:1.5">${escapeHtml(input.transcript)}</pre>
  </details>` : ""}

  <a href="${escapeHtml(conversationUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:10px">Abrir conversa no MKT Digital -></a>
</div>
</body></html>`;
}

function renderSlackText(input: TeamHandoffInput, conversationUrl: string): string {
  const info = Object.entries(input.capturedInfo || {})
    .map(([k, v]) => `• ${k}: ${v}`)
    .join("\n");
  return `*Lead pronto pra fechar*
*Nome:* ${input.leadName || "(sem nome)"}
*Contato:* ${input.leadPhone || input.leadEmail || "(sem contato)"}
*Motivo:* ${input.reason || "(nao especificado)"}
${input.requestedAction ? `*Acao solicitada:* ${input.requestedAction}\n` : ""}${info ? `*Informacoes:*\n${info}\n` : ""}
<${conversationUrl}|Abrir conversa>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
