// src/app/api/knowledge/files/reindex/route.ts
//
// Re-extract text from files that were uploaded before the extractor existed
// or that failed extraction. Triggered manually from the dashboard.
//
// Body: { id?: string }  // single file; omitted = full account batch

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { downloadFromBucket } from "@/lib/storage/supabase-storage";
import { extractTextFromFile } from "@/lib/knowledge/extract";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "api/knowledge-files/reindex" });

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };

  const where = body.id
    ? { id: body.id, accountId: session.accountId }
    : { accountId: session.accountId, OR: [{ extractedText: null }, { extractedText: "" }] };

  const files = await prisma.knowledgeFile.findMany({
    where,
    select: { id: true, storagePath: true, mimeType: true, title: true },
    take: body.id ? 1 : 25,
    orderBy: { createdAt: "desc" },
  });

  if (files.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, indexed: 0 });
  }

  let indexed = 0;
  const failed: { id: string; reason: string }[] = [];

  for (const f of files) {
    try {
      const buffer = await downloadFromBucket("knowledge-files", f.storagePath);
      const out = await extractTextFromFile({
        buffer,
        mimeType: f.mimeType,
        fileName: f.title,
      });
      if (out.text) {
        await prisma.knowledgeFile.update({
          where: { id: f.id },
          data: { extractedText: out.text },
        });
        indexed++;
      } else {
        failed.push({ id: f.id, reason: out.error || "no_text" });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.warn("reindex failed", { fileId: f.id, detail });
      failed.push({ id: f.id, reason: detail });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: files.length,
    indexed,
    failed,
  });
}
