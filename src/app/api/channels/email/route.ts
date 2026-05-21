// src/app/api/channels/email/route.ts
//
// Email channel configuration (Resend). Stores credentials, an inbound
// webhook secret and the inbound URL for the tenant to wire up in their
// mail provider (Resend Inbound, Postmark, Mailgun, or a forwarder).
//
// Credential leak rules: GET never returns the raw Resend API key. The UI
// gets a masked preview only. On save, if the form sends a masked value
// back, we keep the stored secret untouched so the user can edit other
// fields without re-typing the key.
//
// On the first save we ALWAYS generate an `inboundSecret`. The inbound
// webhook refuses requests that don't carry it as `x-webhook-secret`,
// so the URL alone is not enough to pretend to be a lead.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

type EmailConfig = {
  resendApiKey?: string;
  fromName?: string;
  fromEmail?: string;
  domain?: string;
  verified?: boolean;
  inboundEnabled?: boolean;
  inboundSecret?: string;
};

const MASK = "••••••••";

function maskApiKey(s?: string): string {
  if (!s) return "";
  if (s.length < 8) return MASK;
  return `${MASK}${s.slice(-4)}`;
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "https://mktdigital.sociosai.com"
  );
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidDomain(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(s);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
    });
    const cfg = (channel?.config as EmailConfig | null) || {};
    return NextResponse.json({
      // Public, non-sensitive fields
      fromName: cfg.fromName || "",
      fromEmail: cfg.fromEmail || "",
      domain: cfg.domain || "",
      enabled: channel?.isEnabled || false,
      verified: cfg.verified || false,
      inboundEnabled: cfg.inboundEnabled !== false,
      inboundSecret: cfg.inboundSecret || "",
      inboundWebhookUrl: `${appUrl()}/api/webhooks/email/${session.accountId}`,
      // Masked preview, never the raw value
      resendApiKey: cfg.resendApiKey ? maskApiKey(cfg.resendApiKey) : "",
      hasResendApiKey: !!cfg.resendApiKey,
    });
  } catch {
    return NextResponse.json({
      fromName: "",
      fromEmail: "",
      domain: "",
      enabled: false,
      verified: false,
      inboundEnabled: true,
      inboundSecret: "",
      inboundWebhookUrl: `${appUrl()}/api/webhooks/email/${session.accountId}`,
      resendApiKey: "",
      hasResendApiKey: false,
    });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { action } = body;

  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
    });
    const cfg = (channel?.config as EmailConfig | null) || {};

    if (action === "save") {
      // Don't let the masked value overwrite the real secret.
      const submittedKey = String(body.resendApiKey || "");
      const keepStoredKey =
        submittedKey === "" || submittedKey.startsWith(MASK);

      const fromEmail = String(body.fromEmail || "").trim().toLowerCase();
      const domain = String(body.domain || "").trim().toLowerCase();
      const fromName = String(body.fromName || "").trim();

      // Validation, return early with a friendly error so the UI can show it.
      if (!fromName) {
        return NextResponse.json({ error: "missing_from_name" }, { status: 400 });
      }
      if (!isValidEmail(fromEmail)) {
        return NextResponse.json({ error: "invalid_from_email" }, { status: 400 });
      }
      if (domain && !isValidDomain(domain)) {
        return NextResponse.json({ error: "invalid_domain" }, { status: 400 });
      }
      if (domain && !fromEmail.endsWith(`@${domain}`)) {
        return NextResponse.json(
          { error: "sender_domain_mismatch" },
          { status: 400 }
        );
      }
      const finalKey = keepStoredKey ? cfg.resendApiKey : submittedKey;
      if (!finalKey) {
        return NextResponse.json(
          { error: "missing_api_key" },
          { status: 400 }
        );
      }

      const nextCfg: EmailConfig = {
        resendApiKey: finalKey,
        fromName,
        fromEmail,
        domain,
        verified: cfg.verified || false,
        inboundEnabled: body.inboundEnabled !== false,
        // Generate inbound secret on first save so the webhook is never open.
        inboundSecret: cfg.inboundSecret || randomBytes(24).toString("hex"),
      };
      await prisma.channel.upsert({
        where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
        create: {
          accountId: session.accountId,
          type: "EMAIL",
          isEnabled: true,
          config: nextCfg,
        },
        update: { isEnabled: true, config: nextCfg },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "rotate_inbound_secret") {
      const newSecret = randomBytes(24).toString("hex");
      const nextCfg: EmailConfig = { ...cfg, inboundSecret: newSecret };
      await prisma.channel.upsert({
        where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
        create: {
          accountId: session.accountId,
          type: "EMAIL",
          isEnabled: channel?.isEnabled || false,
          config: nextCfg,
        },
        update: { config: nextCfg },
      });
      return NextResponse.json({ success: true, inboundSecret: newSecret });
    }

    if (action === "test") {
      const apiKey = cfg.resendApiKey;
      if (!apiKey) {
        return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
      }
      const to = String(body.to || "").trim().toLowerCase();
      if (!isValidEmail(to)) {
        return NextResponse.json({ error: "invalid_to_email" }, { status: 400 });
      }
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${cfg.fromName || "MKT Digital"} <${cfg.fromEmail || "onboarding@resend.dev"}>`,
          to: [to],
          subject: "Teste de envio",
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#0f172a"><h2 style="margin:0 0 12px;font-weight:600">Conexao confirmada</h2><p style="color:#475569;line-height:1.6;font-size:14px">Este e um email de teste do canal de email do sistema. Se voce recebeu, a configuracao esta correta.</p></div>`,
        }),
      });
      if (r.ok) return NextResponse.json({ success: true });
      const err = await r.text();
      return NextResponse.json({ error: friendlyResendError(err) }, { status: 400 });
    }

    if (action === "disable") {
      if (channel) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { isEnabled: false },
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Email channel error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function friendlyResendError(raw: string): string {
  const text = raw || "";
  if (/domain.*not.*verified|verify.*domain/i.test(text))
    return "Dominio nao verificado em Resend";
  if (/invalid.*api.*key|unauthorized/i.test(text))
    return "API key do Resend invalida";
  if (/rate.*limit/i.test(text)) return "Limite de envio do Resend excedido";
  if (/recipient/i.test(text)) return "Destinatario rejeitado";
  return text.slice(0, 200);
}
