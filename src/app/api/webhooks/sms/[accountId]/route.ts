// src/app/api/webhooks/sms/[accountId]/route.ts
//
// Twilio inbound SMS webhook. The account is identified by the URL path so
// every tenant points its Twilio number to its own URL:
//   https://mktdigital.sociosai.com/api/webhooks/sms/<accountId>
//
// We accept Twilio's standard form-urlencoded payload and we also accept
// JSON so the same endpoint works for custom forwarders.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { handleSmsInbound } from "@/lib/ai-engine/sms-inbound";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "webhook/sms" });

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await ctx.params;
  if (!accountId) {
    return NextResponse.json({ error: "missing_account" }, { status: 400 });
  }

  const rl = await rateLimit({
    key: `sms:${accountId}:${getClientIp(req)}`,
    max: 120,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  const channel = await prisma.channel.findFirst({
    where: { accountId, type: "SMS", isEnabled: true },
    select: { accountId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "channel_disabled" }, { status: 404 });
  }

  let from = "";
  let to = "";
  let body = "";
  let messageSid = "";

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const json = await req.json();
      from = String(json.from || json.From || "");
      to = String(json.to || json.To || "");
      body = String(json.body || json.Body || json.text || "");
      messageSid = String(json.messageSid || json.MessageSid || json.id || "");
    } else {
      const form = await req.formData();
      from = String(form.get("From") || form.get("from") || "");
      to = String(form.get("To") || form.get("to") || "");
      body = String(form.get("Body") || form.get("body") || "");
      messageSid = String(form.get("MessageSid") || form.get("messageSid") || "");
    }
  } catch (err) {
    log.warn("bad payload", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!from || !body) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  try {
    await handleSmsInbound(accountId, {
      from,
      to,
      body,
      externalId: messageSid || undefined,
    });
    // Reply with empty TwiML so Twilio doesn't auto-respond to the lead.
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    log.error("sms inbound failed", { accountId, err: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await ctx.params;
  return NextResponse.json({ status: "ok", channel: "SMS", accountId });
}
