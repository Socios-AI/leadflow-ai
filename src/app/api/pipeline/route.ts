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
      followUps,
      followUpEnabled: followUps.length > 0,
      transferPhone: p.pipelineTransferPhone || "",
      transferMessage: p.pipelineTransferMessage || "",
      calendarEnabled: p.pipelineCalendarEnabled || false,
      calendarEmail: p.pipelineCalendarEmail || "",
      humanApproval: p.pipelineHumanApproval || false,
      webhookId: p.pipelineWebhookId || "",
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

    const persona: PersonaShape = {
      ...existingPersona,
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
    };

    await prisma.aIConfig.upsert({
      where: { accountId: session.accountId },
      create: {
        accountId: session.accountId,
        provider: "openai",
        model: "gpt-4o",
        systemPrompt: "",
        temperature: 0.7,
        maxTokens: 500,
        persona,
      },
      update: { persona, updatedAt: new Date() },
    });

    return NextResponse.json({ success: true, webhookId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
