// src/app/api/channels/sms/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "SMS" } },
    });
    const cfg = (channel?.config as any) || {};
    return NextResponse.json({
      accountSid: cfg.accountSid || "",
      authToken: cfg.authToken || "",
      phoneNumber: cfg.phoneNumber || "",
      messagingServiceSid: cfg.messagingServiceSid || "",
      enabled: channel?.isEnabled || false,
    });
  } catch {
    return NextResponse.json({ accountSid: "", authToken: "", phoneNumber: "", messagingServiceSid: "", enabled: false });
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
    const cfg = (channel?.config as any) || {};

    if (action === "save") {
      await prisma.channel.upsert({
        where: { accountId_type: { accountId: session.accountId, type: "SMS" } },
        create: {
          accountId: session.accountId, type: "SMS", isEnabled: true,
          config: { accountSid: body.accountSid, authToken: body.authToken, phoneNumber: body.phoneNumber, messagingServiceSid: body.messagingServiceSid || null },
        },
        update: {
          isEnabled: true,
          config: { accountSid: body.accountSid, authToken: body.authToken, phoneNumber: body.phoneNumber, messagingServiceSid: body.messagingServiceSid || null },
        },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "test") {
      const sid = cfg.accountSid;
      const token = cfg.authToken;
      const from = cfg.phoneNumber;
      if (!sid || !token || !from) return NextResponse.json({ error: "Twilio não configurado" }, { status: 400 });
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const params = new URLSearchParams({ To: body.to, From: from, Body: "Teste do Marketing Digital AI — Se recebeu, o SMS está funcionando!" });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (r.ok) return NextResponse.json({ success: true });
      const err = await r.json();
      return NextResponse.json({ error: err.message || "Erro Twilio" }, { status: 400 });
    }

    if (action === "disable") {
      if (channel) await prisma.channel.update({ where: { id: channel.id }, data: { isEnabled: false } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) { console.error("SMS error:", e.message); return NextResponse.json({ error: e.message }, { status: 500 }); }
}