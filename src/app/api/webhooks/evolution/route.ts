// src/app/api/webhooks/evolution/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { queues } from "@/lib/queues";
import { debounceMessage } from "@/lib/debounce";

/**
 * POST /api/webhooks/evolution
 *
 * Receives ALL inbound WhatsApp messages from Evolution API.
 *
 * TEXT flow:
 *   Save to DB → push to debounce buffer → reset 8s timer
 *   → timer fires → AI processes ALL accumulated messages at once
 *
 * AUDIO flow:
 *   Queue transcription job → worker downloads audio → Whisper transcribes
 *   → save transcribed text as message → push to SAME debounce buffer
 *   → if user also sent text, both get combined when timer fires
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Only process message events
    if (body.event !== "messages.upsert") {
      return NextResponse.json({ status: "ignored", event: body.event });
    }

    const data = body.data;

    // Ignore our own outbound messages
    if (!data || data.key?.fromMe) {
      return NextResponse.json({ status: "ignored", reason: "outbound" });
    }

    // Extract phone — ignore groups
    const remoteJid = data.key?.remoteJid || "";
    if (remoteJid.includes("@g.us")) {
      return NextResponse.json({ status: "ignored", reason: "group" });
    }

    const remotePhone = remoteJid.replace("@s.whatsapp.net", "");
    if (!remotePhone) {
      return NextResponse.json({ status: "ignored", reason: "no_phone" });
    }

    const externalMsgId = data.key?.id;

    // ── FIND LEAD ──
    // Match by last 10 digits to handle country code variations
    const lead = await prisma.lead.findFirst({
      where: {
        phone: { endsWith: remotePhone.slice(-10) },
      },
      include: {
        conversations: {
          where: { channel: "WHATSAPP", isActive: true },
          take: 1,
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ status: "ignored", reason: "unknown_lead" });
    }

    const accountId = lead.accountId;
    const conversation = lead.conversations[0];

    if (!conversation) {
      return NextResponse.json({ status: "ignored", reason: "no_conversation" });
    }

    // ── AI DISABLED → just save, no AI processing ──
    if (!conversation.isAIEnabled) {
      await saveRawMessage(accountId, conversation.id, data, externalMsgId);
      return NextResponse.json({ status: "saved", reason: "ai_disabled" });
    }

    // ── DETECT MESSAGE TYPE ──
    const isAudio = !!(data.message?.audioMessage || data.message?.pttMessage);

    if (isAudio) {
      // ════════════════════════════════════════════
      // AUDIO → Queue for transcription
      // After Whisper transcribes, the transcription worker
      // will save the result and feed it into the debounce system
      // ════════════════════════════════════════════
      await queues.transcription.add("transcribe-audio", {
        accountId,
        leadId: lead.id,
        conversationId: conversation.id,
        externalMessageId: externalMsgId,
        instanceName: body.instance,
        channel: "WHATSAPP",
      });

      return NextResponse.json({ status: "queued_transcription" });
    }

    // ════════════════════════════════════════════
    // TEXT / IMAGE / VIDEO / DOC → Save + Debounce
    // ════════════════════════════════════════════
    const textContent =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption ||
      data.message?.videoMessage?.caption ||
      "";

    const isImage = !!data.message?.imageMessage;
    const isVideo = !!data.message?.videoMessage;
    const isDocument = !!data.message?.documentMessage;

    const contentType = isImage
      ? "IMAGE"
      : isVideo
        ? "VIDEO"
        : isDocument
          ? "DOCUMENT"
          : "TEXT";

    const content =
      textContent || (contentType !== "TEXT" ? `[${contentType}]` : "");

    if (!content) {
      return NextResponse.json({ status: "ignored", reason: "empty" });
    }

    // Save inbound message
    const message = await prisma.message.create({
      data: {
        accountId,
        conversationId: conversation.id,
        direction: "INBOUND",
        content,
        contentType,
        externalId: externalMsgId,
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Update lead status
    if (lead.status === "NEW" || lead.status === "CONTACTED") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "IN_CONVERSATION" },
      });
    }

    // ── DEBOUNCE: Add to buffer + reset 8s timer ──
    await debounceMessage({
      conversationId: conversation.id,
      messageId: message.id,
      accountId,
      leadId: lead.id,
      channel: "WHATSAPP",
    });

    return NextResponse.json({ status: "debounced" });
  } catch (error: any) {
    console.error("[webhook/evolution] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Save a raw message without AI processing (for when AI is disabled).
 */
async function saveRawMessage(
  accountId: string,
  conversationId: string,
  data: any,
  externalId?: string
) {
  const text =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    "";
  const isAudio = !!(data.message?.audioMessage || data.message?.pttMessage);

  await prisma.message.create({
    data: {
      accountId,
      conversationId,
      direction: "INBOUND",
      content: text || (isAudio ? "[AUDIO]" : "[MEDIA]"),
      contentType: isAudio ? "AUDIO" : "TEXT",
      externalId,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
}