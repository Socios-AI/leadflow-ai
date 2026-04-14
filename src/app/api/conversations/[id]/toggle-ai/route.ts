// src/app/api/conversations/[id]/toggle-ai/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

/**
 * PATCH /api/conversations/:id/toggle-ai
 *
 * Toggles AI on/off for a specific conversation.
 * When AI is disabled, auto-responses stop. A human takes over.
 *
 * Body (optional): { "enabled": true/false }
 * If no body, toggles current state.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));

    const conversation = await prisma.conversation.findFirst({
      where: { id, accountId: session.accountId },
      select: { isAIEnabled: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const newState =
      typeof body.enabled === "boolean" ? body.enabled : !conversation.isAIEnabled;

    await prisma.conversation.update({
      where: { id },
      data: { isAIEnabled: newState },
    });

    // Log the event
    try {
      await prisma.eventLog.create({
        data: {
          accountId: session.accountId,
          event: newState ? "ai.enabled" : "ai.disabled",
          data: {
            conversationId: id,
            by: session.email,
          },
        },
      });
    } catch {
      // eventLog might not exist yet — non-critical
    }

    return NextResponse.json({
      conversationId: id,
      isAIEnabled: newState,
      message: newState
        ? "IA reativada nesta conversa"
        : "IA pausada — controle manual ativado",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Toggle AI error:", msg);
    return NextResponse.json(
      { error: "Internal error", message: msg },
      { status: 500 }
    );
  }
}