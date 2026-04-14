// src/app/api/pipeline/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = await prisma.aIConfig.findUnique({ where: { accountId: session.accountId } });
    if (!config) return NextResponse.json({ templateId: "", goalId: "", firstContact: "immediate", followUpEnabled: true, followUpAttempts: 3, followUpInterval: 24, requireHumanApproval: false });
    const p = (config.persona as any) || {};
    return NextResponse.json({
      templateId: p.pipelineTemplate || "",
      goalId: p.pipelineGoal || "",
      firstContact: p.pipelineFirstContact || "immediate",
      followUpEnabled: p.pipelineFollowUp ?? true,
      followUpAttempts: p.pipelineFollowUpAttempts ?? 3,
      followUpInterval: p.pipelineFollowUpInterval ?? 24,
      requireHumanApproval: p.pipelineHumanApproval ?? false,
    });
  } catch (e: any) { console.error("GET pipeline:", e.message); return NextResponse.json({ error: "Internal error" }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const existing = await prisma.aIConfig.findUnique({ where: { accountId: session.accountId } });
    const existingPersona = (existing?.persona as any) || {};
    const persona = {
      ...existingPersona,
      pipelineTemplate: body.templateId,
      pipelineGoal: body.goalId,
      pipelineFirstContact: body.firstContact,
      pipelineFollowUp: body.followUpEnabled,
      pipelineFollowUpAttempts: body.followUpAttempts,
      pipelineFollowUpInterval: body.followUpInterval,
      pipelineHumanApproval: body.requireHumanApproval,
    };
    await prisma.aIConfig.upsert({
      where: { accountId: session.accountId },
      create: { accountId: session.accountId, provider: "openai", model: "gpt-4o", systemPrompt: "", temperature: 0.7, maxTokens: 500, persona },
      update: { persona },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) { console.error("PUT pipeline:", e.message); return NextResponse.json({ error: e.message }, { status: 500 }); }
}