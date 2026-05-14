// src/lib/storage/supabase-storage.ts
//
// Thin wrapper around Supabase Storage for tenant-scoped uploads.
// Files are bucketed by feature ("knowledge-files", "assistant-media") and
// keyed by `<accountId>/<unique>-<safeName>` so deletes can cascade cleanly
// when an account is removed.
//
// All buckets are private. We mint short-lived signed URLs whenever the UI
// needs to display or download a file — public URLs are never exposed.

import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase-server";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "storage/supabase" });

export type Bucket = "knowledge-files" | "assistant-media";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface UploadResult {
  storagePath: string;
  signedUrl: string;
}

export async function uploadToBucket(
  bucket: Bucket,
  accountId: string,
  fileName: string,
  body: Buffer | Blob | ArrayBuffer | Uint8Array,
  contentType: string
): Promise<UploadResult> {
  const supabase = getSupabaseAdmin();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const unique = randomBytes(6).toString("hex");
  const storagePath = `${accountId}/${unique}-${safeName}`;

  // Normalize to a Blob so the Supabase client accepts any input shape.
  const payload =
    body instanceof Blob
      ? body
      : new Blob([toArrayBuffer(body)], { type: contentType });

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, payload, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) {
    log.error("upload failed", { bucket, storagePath, error: error.message });
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const signedUrl = await createSignedUrl(bucket, storagePath);
  return { storagePath, signedUrl };
}

export async function createSignedUrl(
  bucket: Bucket,
  storagePath: string,
  expiresIn = SIGNED_URL_TTL_SECONDS
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    log.error("signed url failed", { bucket, storagePath, error: error?.message });
    throw new Error(`Could not sign storage URL: ${error?.message || "unknown"}`);
  }
  return data.signedUrl;
}

export async function deleteFromBucket(
  bucket: Bucket,
  storagePath: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    // Best-effort — log and swallow so the DB row delete isn't blocked
    log.warn("storage delete failed", { bucket, storagePath, error: error.message });
  }
}

export async function downloadFromBucket(
  bucket: Bucket,
  storagePath: string
): Promise<Buffer> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || "no data"}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

function toArrayBuffer(input: Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  // For Buffer and Uint8Array, copy into a fresh ArrayBuffer so the Blob
  // typing matches across Node and DOM lib defs.
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}
