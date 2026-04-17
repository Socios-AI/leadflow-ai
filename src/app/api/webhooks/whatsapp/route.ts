// src/app/api/webhooks/whatsapp/route.ts
//
// Evolution API v2 webhook — shared handler with /api/webhooks/evolution.
// Both endpoints exist so customers can paste either URL in Evolution.

import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppInbound } from "@/lib/ai-engine/whatsapp-inbound";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleWhatsAppInbound(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[webhook/whatsapp] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "WhatsApp webhook endpoint active",
  });
}
