// src/app/api/ai/assistants/activate/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

// POST { assistantId | null }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { assistantId?: string | null };
  const assistantId = body.assistantId ?? null;

  if (assistantId) {
    const exists = await prisma.aIAssistant.findFirst({
      where: { id: assistantId, accountId: session.accountId },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // aiConfig may not exist yet (tenant just signed up) — upsert with safe defaults.
  await prisma.aIConfig.upsert({
    where: { accountId: session.accountId },
    create: {
      accountId: session.accountId,
      systemPrompt: "Você é um atendente comercial profissional e humano.",
      activeAssistantId: assistantId,
    },
    update: { activeAssistantId: assistantId },
  });

  return NextResponse.json({ ok: true, activeAssistantId: assistantId });
}
