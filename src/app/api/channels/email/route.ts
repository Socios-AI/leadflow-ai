// src/app/api/channels/email/route.ts
//
// Email channel configuration (Resend). Stores credentials, an optional
// inbound webhook secret and the inbound URL for the tenant to wire up in
// their mail provider (Resend Inbound, Postmark, Mailgun, or a forwarder).

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

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "https://mktdigital.sociosai.com"
  );
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
      resendApiKey: cfg.resendApiKey || "",
      fromName: cfg.fromName || "",
      fromEmail: cfg.fromEmail || "",
      domain: cfg.domain || "",
      enabled: channel?.isEnabled || false,
      verified: cfg.verified || false,
      inboundEnabled: cfg.inboundEnabled !== false,
      inboundSecret: cfg.inboundSecret || "",
      inboundWebhookUrl: `${appUrl()}/api/webhooks/email/${session.accountId}`,
    });
  } catch {
    return NextResponse.json({
      resendApiKey: "",
      fromName: "",
      fromEmail: "",
      domain: "",
      enabled: false,
      verified: false,
      inboundEnabled: true,
      inboundSecret: "",
      inboundWebhookUrl: `${appUrl()}/api/webhooks/email/${session.accountId}`,
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
      const nextCfg: EmailConfig = {
        resendApiKey: body.resendApiKey,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
        domain: body.domain,
        verified: cfg.verified || false,
        inboundEnabled: body.inboundEnabled !== false,
        inboundSecret: cfg.inboundSecret || "",
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
        return NextResponse.json(
          { error: "missing_api_key" },
          { status: 400 }
        );
      }
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${cfg.fromName || "MKT Digital"} <${cfg.fromEmail || "onboarding@resend.dev"}>`,
          to: [body.to],
          subject: "Teste de envio",
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#0f172a"><h2 style="margin:0 0 12px;font-weight:600">Conexao confirmada</h2><p style="color:#475569;line-height:1.6;font-size:14px">Este e um email de teste do canal de email do sistema. Se voce recebeu, a configuracao esta correta.</p></div>`,
        }),
      });
      if (r.ok) return NextResponse.json({ success: true });
      const err = await r.text();
      return NextResponse.json({ error: err }, { status: 400 });
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
