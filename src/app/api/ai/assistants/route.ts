// src/app/api/ai/assistants/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

interface AssistantPayload {
  name?: unknown;
  description?: unknown;
  provider?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  persona?: unknown;
  rules?: unknown;
  businessHours?: unknown;
  offHoursMessage?: unknown;
  escalationConfig?: unknown;
  conversionConfig?: unknown;
}

function sanitize(body: AssistantPayload) {
  const out: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) out.name = body.name.trim().slice(0, 120);
  if (typeof body.description === "string") out.description = body.description.trim().slice(0, 500) || null;
  if (typeof body.provider === "string") out.provider = body.provider;
  if (typeof body.model === "string") out.model = body.model;
  if (typeof body.systemPrompt === "string") out.systemPrompt = body.systemPrompt;
  if (typeof body.temperature === "number") out.temperature = Math.max(0, Math.min(2, body.temperature));
  if (typeof body.maxTokens === "number") out.maxTokens = Math.max(50, Math.min(8000, Math.floor(body.maxTokens)));
  if (body.persona && typeof body.persona === "object") out.persona = body.persona;
  if (body.rules && typeof body.rules === "object") out.rules = body.rules;
  if (body.businessHours && typeof body.businessHours === "object") out.businessHours = body.businessHours;
  if (typeof body.offHoursMessage === "string") out.offHoursMessage = body.offHoursMessage || null;
  if (body.escalationConfig && typeof body.escalationConfig === "object") out.escalationConfig = body.escalationConfig;
  if (body.conversionConfig && typeof body.conversionConfig === "object") out.conversionConfig = body.conversionConfig;
  return out;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [assistants, aiConfig] = await Promise.all([
    prisma.aIAssistant.findMany({
      where: { accountId: session.accountId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aIConfig.findUnique({ where: { accountId: session.accountId } }),
  ]);

  return NextResponse.json({
    assistants,
    activeAssistantId: aiConfig?.activeAssistantId ?? null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as AssistantPayload;
  const data = sanitize(body);
  if (!data.name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  if (!data.systemPrompt) {
    return NextResponse.json({ error: "system_prompt_required" }, { status: 400 });
  }

  const created = await prisma.aIAssistant.create({
    data: {
      accountId: session.accountId,
      name: data.name as string,
      description: (data.description as string | null) ?? null,
      provider: (data.provider as string) || "openai",
      model: (data.model as string) || "gpt-4o",
      systemPrompt: data.systemPrompt as string,
      temperature: (data.temperature as number) ?? 0.7,
      maxTokens: (data.maxTokens as number) ?? 1000,
      persona: (data.persona as object) ?? undefined,
      rules: (data.rules as object) ?? undefined,
      businessHours: (data.businessHours as object) ?? undefined,
      offHoursMessage: (data.offHoursMessage as string | null) ?? undefined,
      escalationConfig: (data.escalationConfig as object) ?? undefined,
      conversionConfig: (data.conversionConfig as object) ?? undefined,
    },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as AssistantPayload & { id?: string };
  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const existing = await prisma.aIAssistant.findFirst({
    where: { id: body.id, accountId: session.accountId },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data = sanitize(body);
  const updated = await prisma.aIAssistant.update({
    where: { id: body.id },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  await prisma.aIAssistant.deleteMany({
    where: { id, accountId: session.accountId },
  });
  // Detach from aiConfig if it was the active one
  await prisma.aIConfig.updateMany({
    where: { accountId: session.accountId, activeAssistantId: id },
    data: { activeAssistantId: null },
  });

  return NextResponse.json({ ok: true });
}
