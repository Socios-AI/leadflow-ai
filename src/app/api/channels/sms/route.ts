// src/app/api/channels/sms/route.ts
//
// SMS channel configuration (Twilio). Stores credentials + an
// `inboundEnabled` flag so the tenant can receive SMS from unknown leads
// and have the AI engage automatically. The webhook URL is returned so the
// dashboard can show it; the tenant pastes it into Twilio Console >
// Phone Numbers > Messaging > "A message comes in".
//
// Credential leak rules:
//   - GET never returns the raw authToken. It returns a masked preview so
//     the UI can show "configured / not configured" without ever exposing
//     the secret to a browser tab, network inspector or XSS payload.
//   - On save, if the body's authToken matches the mask placeholder, we
//     keep the stored value untouched (lets the user edit other fields
//     without re-typing the secret).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";

type SmsConfig = {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  messagingServiceSid?: string | null;
  inboundEnabled?: boolean;
};

const MASK = "••••••••";

function maskSecret(s?: string): string {
  if (!s) return "";
  if (s.length < 6) return MASK;
  return `${MASK}${s.slice(-4)}`;
}

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
    const channel = await prisma.channel.findFirst({
      where: { accountId: session.accountId, type: "SMS" },
      orderBy: { createdAt: "asc" },
    });
    const cfg = (channel?.config as SmsConfig | null) || {};
    return NextResponse.json({
      // Public fields, safe to round-trip
      phoneNumber: cfg.phoneNumber || "",
      messagingServiceSid: cfg.messagingServiceSid || "",
      inboundEnabled: cfg.inboundEnabled !== false,
      enabled: channel?.isEnabled || false,
      inboundWebhookUrl: `${appUrl()}/api/webhooks/sms/${session.accountId}`,
      // Masked previews so the UI can show "configured" without leaking
      accountSid: cfg.accountSid ? maskSecret(cfg.accountSid) : "",
      authToken: cfg.authToken ? MASK : "",
      hasAuthToken: !!cfg.authToken,
      hasAccountSid: !!cfg.accountSid,
    });
  } catch {
    return NextResponse.json({
      phoneNumber: "",
      messagingServiceSid: "",
      inboundEnabled: true,
      enabled: false,
      inboundWebhookUrl: `${appUrl()}/api/webhooks/sms/${session.accountId}`,
      accountSid: "",
      authToken: "",
      hasAuthToken: false,
      hasAccountSid: false,
    });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { action } = body;

  try {
    const channel = await prisma.channel.findFirst({
      where: { accountId: session.accountId, type: "SMS" },
      orderBy: { createdAt: "asc" },
    });
    const cfg = (channel?.config as SmsConfig | null) || {};

    if (action === "save") {
      // Keep stored secret if the form submitted a masked placeholder.
      const submittedToken = String(body.authToken || "");
      const keepStoredToken =
        submittedToken === "" || submittedToken.startsWith(MASK);
      const submittedSid = String(body.accountSid || "");
      const keepStoredSid =
        submittedSid === "" || submittedSid.startsWith(MASK);

      const nextCfg: SmsConfig = {
        accountSid: keepStoredSid ? cfg.accountSid : submittedSid,
        authToken: keepStoredToken ? cfg.authToken : submittedToken,
        phoneNumber: body.phoneNumber,
        messagingServiceSid: body.messagingServiceSid || null,
        inboundEnabled: body.inboundEnabled !== false,
      };
      if (channel) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { isEnabled: true, config: nextCfg as Prisma.InputJsonValue },
        });
      } else {
        await prisma.channel.create({
          data: { accountId: session.accountId, type: "SMS", isEnabled: true, config: nextCfg as Prisma.InputJsonValue },
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "test") {
      const sid = cfg.accountSid;
      const token = cfg.authToken;
      const from = cfg.phoneNumber;
      if (!sid || !token || !from) {
        return NextResponse.json({ error: "missing_twilio_config" }, { status: 400 });
      }
      const to = String(body.to || "").trim();
      if (!/^\+[1-9]\d{6,14}$/.test(to)) {
        return NextResponse.json(
          { error: "invalid_phone_format" },
          { status: 400 }
        );
      }
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const params = new URLSearchParams({
        To: to,
        From: from,
        Body: "Teste do sistema. Se voce recebeu, o SMS esta funcionando.",
      });
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );
      if (r.ok) return NextResponse.json({ success: true });
      const err = await r.json().catch(() => ({}));
      return NextResponse.json(
        { error: friendlyTwilioError(err) },
        { status: 400 }
      );
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
    console.error("SMS channel error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function friendlyTwilioError(err: { code?: number | string; message?: string }): string {
  const code = String(err.code || "");
  const msg = err.message || "";
  if (code === "21211") return "Numero de destino invalido";
  if (code === "21608") return "Numero nao verificado na trial do Twilio";
  if (code === "21610") return "Numero bloqueou STOP no Twilio";
  if (code === "20003") return "Credenciais Twilio invalidas";
  if (code === "21659") return "Numero remetente nao pertence a esta conta";
  return msg || "Falha ao enviar via Twilio";
}
