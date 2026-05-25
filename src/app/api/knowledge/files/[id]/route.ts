// src/app/api/knowledge/files/[id]/route.ts
//
// GET /api/knowledge/files/{id} returns the extracted text for a single
// file so the dashboard's "eye" preview can show what the AI sees, no
// matter how long the text is. Tenant-scoped, never leaks across accounts.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const file = await prisma.knowledgeFile.findFirst({
    where: { id, accountId: session.accountId },
    select: {
      id: true,
      title: true,
      description: true,
      mimeType: true,
      sizeBytes: true,
      extractedText: true,
      createdAt: true,
    },
  });
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    id: file.id,
    title: file.title,
    description: file.description,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    extractedText: file.extractedText || "",
    indexedChars: file.extractedText?.length ?? 0,
    indexed: !!(file.extractedText && file.extractedText.trim()),
  });
}
