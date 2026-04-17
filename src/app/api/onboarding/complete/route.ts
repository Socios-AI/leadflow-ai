// src/app/api/onboarding/complete/route.ts
//
// Saves the wizard answers into AIConfig.persona and marks the account's
// onboarding as completed. After this call the dashboard gate in
// (dashboard)/layout.tsx stops redirecting.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import crypto from "crypto";

interface OnboardingPayload {
  template?: string;
  goal?: string;
  primaryChannel?: string;
  secondaryChannel?: string;
  firstContact?: string;
  aiName?: string;
  aiRole?: string;
  tone?: string;
  businessName?: string;
}

const VALID_TEMPLATES = [
  "form_lp",
  "whatsapp_direct",
  "quiz_external",
  "social_dm",
  "lp_followup",
  "manual_outbound",
];
const VALID_GOALS = [
  "close_sale",
  "schedule_meeting",
  "qualify_transfer",
  "collect_send",
];
const VALID_CHANNELS = ["WHATSAPP", "EMAIL", "SMS"];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as OnboardingPayload;

  if (!body.template || !VALID_TEMPLATES.includes(body.template)) {
    return NextResponse.json({ error: "invalid_template" }, { status: 400 });
  }
  if (!body.goal || !VALID_GOALS.includes(body.goal)) {
    return NextResponse.json({ error: "invalid_goal" }, { status: 400 });
  }
  const primary = body.primaryChannel || "WHATSAPP";
  if (!VALID_CHANNELS.includes(primary)) {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  // Load existing persona to preserve unrelated fields
  const existing = await prisma.aIConfig.findUnique({
    where: { accountId: session.accountId },
  });
  const existingPersona =
    (existing?.persona as Record<string, unknown>) || {};

  const webhookId =
    (existingPersona.pipelineWebhookId as string) ||
    crypto.randomBytes(16).toString("hex");

  const persona = {
    ...existingPersona,
    pipelineTemplate: body.template,
    pipelineGoal: body.goal,
    pipelinePrimaryChannel: primary,
    pipelineSecondaryChannel: body.secondaryChannel || "",
    pipelineFirstContact: body.firstContact || "immediate",
    pipelineWebhookId: webhookId,
    aiName: body.aiName || existingPersona.aiName || "Sofia",
    aiRole: body.aiRole || existingPersona.aiRole || "Consultor de vendas",
    tone: body.tone || existingPersona.tone || "professional_friendly",
  };

  await prisma.aIConfig.upsert({
    where: { accountId: session.accountId },
    create: {
      accountId: session.accountId,
      provider: "openai",
      model: "gpt-4o",
      systemPrompt:
        existing?.systemPrompt ||
        "Você é um assistente de vendas inteligente. Engaje leads de forma natural e profissional, entenda suas necessidades e guie-os para a conversão. Nunca invente informações.",
      temperature: 0.7,
      maxTokens: 1000,
      persona,
    },
    update: { persona, updatedAt: new Date() },
  });

  // Optional business name (saves to account if provided)
  if (body.businessName && body.businessName.trim()) {
    await prisma.account.update({
      where: { id: session.accountId },
      data: {
        name: body.businessName.trim(),
        onboardingCompletedAt: new Date(),
      },
    });
  } else {
    await prisma.account.update({
      where: { id: session.accountId },
      data: { onboardingCompletedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
