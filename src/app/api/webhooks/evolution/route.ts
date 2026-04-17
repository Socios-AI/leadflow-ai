// src/app/api/webhooks/evolution/route.ts
//
// Evolution API v2 webhook — delegates to the shared inbound handler.

import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppInbound } from "@/lib/ai-engine/whatsapp-inbound";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleWhatsAppInbound(body);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[webhook/evolution] error:", message);
    return NextResponse.json({ error: "Internal error", message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "Evolution webhook active" });
}
