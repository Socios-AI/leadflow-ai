// src/app/api/channels/sms/route.ts
//
// SMS channel configuration (Twilio). Stores credentials + an
// `inboundEnabled` flag so the tenant can receive SMS from unknown leads
// and have the AI engage automatically. The webhook URL is returned so the
// dashboard can show it; the tenant pastes it into Twilio Console >
// Phone Numbers > Messaging > "A message comes in".

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

type SmsConfig = {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  messagingServiceSid?: string | null;
  inboundEnabled?: boolean;
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
      where: { accountId_type: { accountId: session.accountId, type: "SMS" } },
    });
    const cfg = (channel?.config as SmsConfig | null) || {};
    return NextResponse.json({
      accountSid: cfg.accountSid || "",
      authToken: cfg.authToken || "",
      phoneNumber: cfg.phoneNumber || "",
      messagingServiceSid: cfg.messagingServiceSid || "",
      inboundEnabled: cfg.inboundEnabled !== false,
      enabled: channel?.isEnabled || false,
      inboundWebhookUrl: `${appUrl()}/api/webhooks/sms/${session.accountId}`,
    });
  } catch {
    return NextResponse.json({
      accountSid: "",
      authToken: "",
      phoneNumber: "",
      messagingServiceSid: "",
      inboundEnabled: true,
      enabled: false,
      inboundWebhookUrl: `${appUrl()}/api/webhooks/sms/${session.accountId}`,
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
      where: { accountId_type: { accountId: session.accountId, type: "SMS" } },
    });
    const cfg = (channel?.config as SmsConfig | null) || {};

    if (action === "save") {
      const nextCfg: SmsConfig = {
        accountSid: body.accountSid,
        authToken: body.authToken,
        phoneNumber: body.phoneNumber,
        messagingServiceSid: body.messagingServiceSid || null,
        inboundEnabled: body.inboundEnabled !== false,
      };
      await prisma.channel.upsert({
        where: { accountId_type: { accountId: session.accountId, type: "SMS" } },
        create: {
          accountId: session.accountId,
          type: "SMS",
          isEnabled: true,
          config: nextCfg,
        },
        update: { isEnabled: true, config: nextCfg },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "test") {
      const sid = cfg.accountSid;
      const token = cfg.authToken;
      const from = cfg.phoneNumber;
      if (!sid || !token || !from) {
        return NextResponse.json({ error: "missing_twilio_config" }, { status: 400 });
      }
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const params = new URLSearchParams({
        To: body.to,
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
      const err = await r.json();
      return NextResponse.json(
        { error: err.message || "twilio_error" },
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
