// src/app/api/webhooks/email/[accountId]/route.ts
//
// Inbound email webhook. Tenant is identified by the URL path:
//   https://mktdigital.sociosai.com/api/webhooks/email/<accountId>
//
// Accepts a normalized JSON envelope so the user can wire it up to any
// inbound mail provider (Resend Inbound, Postmark, Mailgun routes, custom
// IMAP forwarder, Make/Zapier, etc.):
//   { from, to?, subject?, text?, html?, messageId?, fromName? }
//
// Optionally a `x-webhook-secret` header can match the account's stored
// secret. If no secret is configured, anyone with the URL can post; users
// are warned about this in the channel UI.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { handleEmailInbound } from "@/lib/ai-engine/email-inbound";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "webhook/email" });

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
    key: `email:${accountId}:${getClientIp(req)}`,
    max: 240,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  const channel = await prisma.channel.findFirst({
    where: { accountId, type: "EMAIL", isEnabled: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "channel_disabled" }, { status: 404 });
  }

  const cfg = (channel.config as Record<string, unknown> | null) || {};
  const expectedSecret =
    typeof cfg.inboundSecret === "string" ? cfg.inboundSecret : "";
  if (expectedSecret) {
    const incoming = req.headers.get("x-webhook-secret") || "";
    if (incoming !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (err) {
    log.warn("invalid json", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const from = String(payload.from || payload.From || "");
  const fromMatch = from.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
  const cleanFrom = fromMatch ? fromMatch[2] : from;
  const fromName = fromMatch ? fromMatch[1].trim() : undefined;

  try {
    const result = await handleEmailInbound(accountId, {
      from: cleanFrom,
      fromName,
      to: typeof payload.to === "string" ? payload.to : undefined,
      subject: typeof payload.subject === "string" ? payload.subject : undefined,
      text: typeof payload.text === "string" ? payload.text : undefined,
      html: typeof payload.html === "string" ? payload.html : undefined,
      messageId:
        typeof payload.messageId === "string"
          ? payload.messageId
          : typeof payload["Message-ID"] === "string"
            ? (payload["Message-ID"] as string)
            : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    log.error("email inbound failed", { accountId, err: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await ctx.params;
  return NextResponse.json({ status: "ok", channel: "EMAIL", accountId });
}
