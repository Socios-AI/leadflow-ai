// src/app/api/pipeline/route.ts
//
// Stores the per-tenant sales-funnel configuration. Everything lives in
// `AIConfig.persona` as JSON so we don't need a schema migration to add
// new fields (channels[], followUps[], firstMessageInstruction, ...).
//
// Backward compatibility: when reading, we accept either the new shape
// (channels array, followUps array, firstMessageInstruction) or the
// legacy shape (primary/secondary channel, attempts+interval). When
// writing, we persist both shapes so any worker still on the old code
// path keeps working until everything is redeployed.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import crypto from "crypto";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

interface FollowUp {
  id: string;
  channel: Channel;
  delayHours: number;
  instruction: string;
}

type PersonaShape = Record<string, unknown>;

function asChannelArray(value: unknown): Channel[] {
  if (!Array.isArray(value)) return [];
  const allowed: Channel[] = ["WHATSAPP", "EMAIL", "SMS"];
  const out: Channel[] = [];
  for (const v of value) {
    const s = String(v).toUpperCase();
    if (allowed.includes(s as Channel) && !out.includes(s as Channel)) {
      out.push(s as Channel);
    }
  }
  return out;
}

/**
 * Normalize a string-array field. Caps length to maxItems and trims each
 * entry to 240 chars (long enough for a real question, short enough to
 * keep the prompt readable).
 */
function asStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim().slice(0, 240))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

/**
 * Normalize phones to a canonical E.164-ish form: keep the leading `+`,
 * strip everything that isn't a digit. Drops entries shorter than 8
 * digits (clearly invalid) so the matcher in handleWhatsAppInbound has
 * something reliable to compare against.
 */
function asPhoneArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    const raw = String(v ?? "").trim();
    if (!raw) continue;
    const hasPlus = raw.startsWith("+");
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8) continue;
    const canonical = (hasPlus ? "+" : "") + digits;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
    if (out.length >= 10) break;
  }
  return out;
}

const LINK_KINDS = new Set([
  "instagram", "facebook", "twitter", "tiktok", "youtube",
  "linkedin", "whatsapp", "website", "other",
]);

interface ImportantLink {
  id: string;
  name: string;
  url: string;
  kind: string;
  whenToSend: string;
}

function asImportantLinks(value: unknown): ImportantLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, i) => {
      const e = (entry as Record<string, unknown>) || {};
      const url = String(e.url || "").trim().slice(0, 500);
      const name = String(e.name || "").trim().slice(0, 60);
      if (!url || !name) return null;
      const rawKind = String(e.kind || "other").toLowerCase();
      const kind = LINK_KINDS.has(rawKind) ? rawKind : "other";
      const whenToSend = String(e.whenToSend || "").trim().slice(0, 280);
      const id = typeof e.id === "string" && e.id ? e.id : `lk-${i}-${Date.now()}`;
      return { id, name, url, kind, whenToSend };
    })
    .filter((x): x is ImportantLink => x !== null)
    .slice(0, 20);
}

function asClosingStrategy(value: unknown): "direct_link" | "qualify_first" | "team_handoff" | "auto" {
  const s = String(value || "");
  if (s === "direct_link" || s === "qualify_first" || s === "team_handoff" || s === "auto") {
    return s;
  }
  return "auto";
}

function asFollowUps(value: unknown): FollowUp[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, i) => {
      const e = (entry as Record<string, unknown>) || {};
      const allowed: Channel[] = ["WHATSAPP", "EMAIL", "SMS"];
      const rawChannel = String(e.channel || "WHATSAPP").toUpperCase() as Channel;
      const channel: Channel = allowed.includes(rawChannel) ? rawChannel : "WHATSAPP";
      const delayHoursRaw = Number(e.delayHours);
      const delayHours =
        Number.isFinite(delayHoursRaw) && delayHoursRaw > 0
          ? Math.min(24 * 30, delayHoursRaw)
          : 24;
      const instruction = String(e.instruction || "").slice(0, 1000);
      const id = typeof e.id === "string" && e.id ? e.id : `fu-${i}-${Date.now()}`;
      return { id, channel, delayHours, instruction };
    })
    .slice(0, 10);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = await prisma.aIConfig.findUnique({
      where: { accountId: session.accountId },
    });
    if (!config) return NextResponse.json({});
    const p = (config.persona as PersonaShape) || {};

    // Resolve channels: prefer the new array, fall back to legacy fields.
    let channels = asChannelArray(p.pipelineChannels);
    if (channels.length === 0) {
      const primary = String(p.pipelinePrimaryChannel || "WHATSAPP").toUpperCase() as Channel;
      channels = [primary];
      const secondary = String(p.pipelineSecondaryChannel || "").toUpperCase();
      if (secondary && secondary !== primary) channels.push(secondary as Channel);
    }

    // Resolve followUps: prefer new array, materialize from legacy on first read.
    let followUps = asFollowUps(p.pipelineFollowUps);
    if (
      followUps.length === 0 &&
      (p.pipelineFollowUpEnabled === true || p.pipelineFollowUpEnabled === undefined)
    ) {
      const attempts = Number(p.pipelineFollowUpAttempts) || 0;
      const interval = Number(p.pipelineFollowUpInterval) || 24;
      const baseChannel = channels[0] || "WHATSAPP";
      followUps = Array.from({ length: Math.min(attempts, 5) }, (_, i) => ({
        id: `legacy-fu-${i}`,
        channel: baseChannel,
        delayHours: interval * (i + 1),
        instruction: "",
      }));
    }

    return NextResponse.json({
      template: p.pipelineTemplate || "",
      goal: p.pipelineGoal || "",
      firstContact: p.pipelineFirstContact || "immediate",
      channels,
      primaryChannel: channels[0] || "WHATSAPP",
      secondaryChannel: channels[1] || "",
      firstMessageInstruction: String(p.pipelineFirstMessageInstruction || ""),
      firstMessageVariability:
        p.pipelineFirstMessageVariability === "exact" ? "exact" : "instruction",
      // Hard language override stored at persona.language. "auto" lets the
      // engine fall back to the campaign/lead heuristic.
      language: String(p.language || "auto"),
      followUps,
      followUpEnabled: followUps.length > 0,
      transferPhone: p.pipelineTransferPhone || "",
      transferMessage: p.pipelineTransferMessage || "",
      calendarEnabled: p.pipelineCalendarEnabled || false,
      calendarEmail: p.pipelineCalendarEmail || "",
      humanApproval: p.pipelineHumanApproval || false,
      webhookId: p.pipelineWebhookId || "",
      // ── Closing strategy ──
      closingStrategy: asClosingStrategy(p.pipelineClosingStrategy),
      closingLink: String(p.pipelineClosingLink || ""),
      closingMessage: String(p.pipelineClosingMessage || ""),
      qualifyingQuestions: asStringArray(p.pipelineQualifyingQuestions, 20),
      requiredInfo: asStringArray(p.pipelineRequiredInfo, 20),
      handoffEmail: String(p.pipelineHandoffEmail || ""),
      handoffWebhook: String(p.pipelineHandoffWebhook || ""),
      handoffWaitMessage: String(p.pipelineHandoffWaitMessage || ""),
      paymentEnabled: !!p.pipelinePaymentEnabled,
      paymentInstructions: String(p.pipelinePaymentInstructions || ""),
      paymentConfirmerPhones: asPhoneArray(p.pipelinePaymentConfirmerPhones),
      paymentWaitMessage: String(p.pipelinePaymentWaitMessage || ""),
      paymentConfirmedMessage: String(p.pipelinePaymentConfirmedMessage || ""),
      importantLinks: asImportantLinks(p.pipelineImportantLinks),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const existing = await prisma.aIConfig.findUnique({
      where: { accountId: session.accountId },
    });
    const existingPersona = (existing?.persona as PersonaShape) || {};

    const webhookId =
      (existingPersona.pipelineWebhookId as string) ||
      crypto.randomBytes(16).toString("hex");

    const channels = asChannelArray(body.channels);
    const resolvedChannels = channels.length > 0 ? channels : ["WHATSAPP" as Channel];
    const followUps = asFollowUps(body.followUps);
    const firstMessageInstruction = String(body.firstMessageInstruction || "")
      .trim()
      .slice(0, 2000);
    const firstMessageVariability =
      body.firstMessageVariability === "exact" ? "exact" : "instruction";
    // Whitelist of language codes the engine knows how to render. Anything
    // else is normalized to "auto" so we never write garbage.
    const ALLOWED_LANGS = new Set([
      "auto", "pt", "pt-BR", "en", "es", "it", "de", "fr", "nl", "ja",
    ]);
    const rawLang = String(body.language || "auto");
    const language = ALLOWED_LANGS.has(rawLang) ? rawLang : "auto";

    const persona: PersonaShape = {
      ...existingPersona,
      // Hard language override read by the AI engine on every generation.
      language,
      pipelineTemplate: body.template,
      pipelineGoal: body.goal,
      pipelineFirstContact: body.firstContact,
      // New shape
      pipelineChannels: resolvedChannels,
      pipelineFirstMessageInstruction: firstMessageInstruction,
      pipelineFirstMessageVariability: firstMessageVariability,
      pipelineFollowUps: followUps,
      // Legacy mirror, kept in sync so older callers still work
      pipelinePrimaryChannel: resolvedChannels[0],
      pipelineSecondaryChannel: resolvedChannels[1] || "",
      pipelineFollowUpEnabled: followUps.length > 0,
      pipelineFollowUpAttempts: followUps.length,
      pipelineFollowUpInterval: followUps[0]?.delayHours || 24,
      pipelineTransferPhone: body.transferPhone,
      pipelineTransferMessage: body.transferMessage,
      pipelineCalendarEnabled: body.calendarEnabled,
      pipelineCalendarEmail: body.calendarEmail,
      pipelineHumanApproval: body.humanApproval,
      pipelineWebhookId: webhookId,
      // ── Closing strategy ──
      pipelineClosingStrategy: asClosingStrategy(body.closingStrategy),
      pipelineClosingLink: String(body.closingLink || "").trim().slice(0, 500),
      pipelineClosingMessage: String(body.closingMessage || "").trim().slice(0, 1000),
      pipelineQualifyingQuestions: asStringArray(body.qualifyingQuestions, 20),
      pipelineRequiredInfo: asStringArray(body.requiredInfo, 20),
      pipelineHandoffEmail: String(body.handoffEmail || "").trim().slice(0, 200),
      pipelineHandoffWebhook: String(body.handoffWebhook || "").trim().slice(0, 500),
      pipelineHandoffWaitMessage: String(body.handoffWaitMessage || "").trim().slice(0, 500),
      pipelinePaymentEnabled: !!body.paymentEnabled,
      pipelinePaymentInstructions: String(body.paymentInstructions || "").trim().slice(0, 2000),
      pipelinePaymentConfirmerPhones: asPhoneArray(body.paymentConfirmerPhones),
      pipelinePaymentWaitMessage: String(body.paymentWaitMessage || "").trim().slice(0, 500),
      pipelinePaymentConfirmedMessage: String(body.paymentConfirmedMessage || "").trim().slice(0, 500),
      pipelineImportantLinks: asImportantLinks(body.importantLinks),
    };

    // Prisma's JSON column types require an InputJsonValue, but our
    // PersonaShape is a flexible Record<string, unknown>. The runtime
    // shape is JSON-serializable, the cast just silences the strict
    // structural check.
    const personaJson = persona as Prisma.InputJsonValue;

    await prisma.aIConfig.upsert({
      where: { accountId: session.accountId },
      create: {
        accountId: session.accountId,
        provider: "openai",
        model: "gpt-4o",
        systemPrompt: "",
        temperature: 0.7,
        maxTokens: 500,
        persona: personaJson,
      },
      update: { persona: personaJson, updatedAt: new Date() },
    });

    return NextResponse.json({ success: true, webhookId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
