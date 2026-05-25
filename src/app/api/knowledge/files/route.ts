// src/app/api/knowledge/files/route.ts
//
// Upload, list, update and delete knowledge files. Files live in the
// `knowledge-files` Supabase Storage bucket and are referenced by the AI
// engine when answering leads. Text is extracted in-process via the
// extractor (PDF, DOCX, XLSX, PPTX and plain text are supported).
//
// Extraction never blocks the upload: if the parser fails or the format is
// unsupported, the file is still stored as a reference and the user is
// notified via a soft warning.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import {
  uploadToBucket,
  deleteFromBucket,
  createSignedUrl,
} from "@/lib/storage/supabase-storage";
import { logger } from "@/lib/logger";
import { extractTextFromFile } from "@/lib/knowledge/extract";

const log = logger.child({ module: "api/knowledge-files" });
// Per-file ceiling. The platform itself is "unlimited" in number of files
// the tenant can upload (we don't cap rows or storage from the app side),
// but each individual file is bounded so a stray 500MB upload doesn't
// thrash the storage bucket or Vision OCR.
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const files = await prisma.knowledgeFile.findMany({
    where: { accountId: session.accountId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      mimeType: true,
      sizeBytes: true,
      category: true,
      storagePath: true,
      extractedText: true,
      createdAt: true,
    },
  });

  const enriched = await Promise.all(
    files.map(async (f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      category: f.category,
      createdAt: f.createdAt,
      indexed: !!(f.extractedText && f.extractedText.length > 0),
      indexedChars: f.extractedText?.length ?? 0,
      url: await createSignedUrl("knowledge-files", f.storagePath).catch(() => null),
    }))
  );
  return NextResponse.json({ files: enriched });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    log.error("bad formdata", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "INVALID_FORMDATA" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const category = String(form.get("category") || "general").trim() || "general";

  if (!file) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: "FILE_TOO_LARGE",
        sizeMB: Math.round((file.size / 1024 / 1024) * 10) / 10,
        limitMB: 100,
      },
      { status: 413 }
    );
  }

  const mime = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  // Extract text first so the AI sees the file the moment it's stored.
  const extraction = await extractTextFromFile({
    buffer,
    mimeType: mime,
    fileName: file.name,
  });

  try {
    const { storagePath } = await uploadToBucket(
      "knowledge-files",
      session.accountId,
      file.name,
      buffer,
      mime
    );

    const row = await prisma.knowledgeFile.create({
      data: {
        accountId: session.accountId,
        title,
        description: description || null,
        storagePath,
        mimeType: mime,
        sizeBytes: file.size,
        extractedText: extraction.text,
        category,
      },
    });

    const signedUrl = await createSignedUrl("knowledge-files", storagePath);
    return NextResponse.json(
      {
        ...row,
        url: signedUrl,
        indexed: !!extraction.text,
        indexedChars: extraction.text?.length ?? 0,
        extractionWarning: extraction.text
          ? undefined
          : extraction.error || "UNSUPPORTED_FORMAT_OR_EMPTY",
      },
      { status: 201 }
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error("upload failed", { detail });
    return NextResponse.json({ error: "UPLOAD_FAILED", detail }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    title?: string;
    description?: string;
    category?: string;
  };
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const existing = await prisma.knowledgeFile.findFirst({
    where: { id: body.id, accountId: session.accountId },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.knowledgeFile.update({
    where: { id: body.id },
    data: {
      ...(typeof body.title === "string" && body.title.trim() && { title: body.title.trim() }),
      ...(typeof body.description === "string" && {
        description: body.description.trim() || null,
      }),
      ...(typeof body.category === "string" && body.category.trim() && {
        category: body.category.trim(),
      }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const existing = await prisma.knowledgeFile.findFirst({
    where: { id, accountId: session.accountId },
    select: { storagePath: true },
  });
  if (!existing) return NextResponse.json({ ok: true });

  await deleteFromBucket("knowledge-files", existing.storagePath);
  await prisma.knowledgeFile.deleteMany({
    where: { id, accountId: session.accountId },
  });
  return NextResponse.json({ ok: true });
}
