// src/app/api/ai/media-library/route.ts
//
// Catalog of media the AI is allowed to send during conversations.
// Each item has a name, a description (what's inside) and a send
// instruction (when the AI should send it). The engine surfaces this
// list to the LLM as "available media" and parses [MEDIA:name] tags
// from the reply to attach the right file to the outbound message.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import {
  uploadToBucket,
  deleteFromBucket,
  createSignedUrl,
} from "@/lib/storage/supabase-storage";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "api/media-library" });
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB — videos common in this bucket

export const runtime = "nodejs";
export const maxDuration = 120;

function kindFromMime(mime: string): "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  if (m.startsWith("audio/")) return "AUDIO";
  return "DOCUMENT";
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.assistantMedia.findMany({
    where: { accountId: session.accountId },
    orderBy: { createdAt: "desc" },
  });
  const enriched = await Promise.all(
    items.map(async (m) => ({
      ...m,
      url: await createSignedUrl("assistant-media", m.storagePath).catch(() => null),
    }))
  );
  return NextResponse.json({ media: enriched });
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
  const name = String(form.get("name") || "").trim();
  const description = String(form.get("description") || "").trim();
  const sendInstruction = String(form.get("sendInstruction") || "").trim();

  if (!file) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "DESCRIPTION_REQUIRED" }, { status: 400 });
  if (!sendInstruction) return NextResponse.json({ error: "SEND_INSTRUCTION_REQUIRED" }, { status: 400 });

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

  try {
    const { storagePath } = await uploadToBucket(
      "assistant-media",
      session.accountId,
      file.name,
      buffer,
      mime
    );

    const row = await prisma.assistantMedia.create({
      data: {
        accountId: session.accountId,
        name,
        description,
        sendInstruction,
        kind: kindFromMime(mime),
        storagePath,
        mimeType: mime,
        sizeBytes: file.size,
      },
    });
    const signedUrl = await createSignedUrl("assistant-media", storagePath);
    return NextResponse.json({ ...row, url: signedUrl }, { status: 201 });
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
    name?: string;
    description?: string;
    sendInstruction?: string;
    isActive?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const existing = await prisma.assistantMedia.findFirst({
    where: { id: body.id, accountId: session.accountId },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.assistantMedia.update({
    where: { id: body.id },
    data: {
      ...(typeof body.name === "string" && body.name.trim() && { name: body.name.trim() }),
      ...(typeof body.description === "string" && body.description.trim() && {
        description: body.description.trim(),
      }),
      ...(typeof body.sendInstruction === "string" && body.sendInstruction.trim() && {
        sendInstruction: body.sendInstruction.trim(),
      }),
      ...(typeof body.isActive === "boolean" && { isActive: body.isActive }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const existing = await prisma.assistantMedia.findFirst({
    where: { id, accountId: session.accountId },
    select: { storagePath: true },
  });
  if (!existing) return NextResponse.json({ ok: true });

  await deleteFromBucket("assistant-media", existing.storagePath);
  await prisma.assistantMedia.deleteMany({
    where: { id, accountId: session.accountId },
  });
  return NextResponse.json({ ok: true });
}
