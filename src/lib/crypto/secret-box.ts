// src/lib/crypto/secret-box.ts
//
// Symmetric encryption for secrets stored at rest (OAuth tokens, API keys).
// AES-256-GCM with random IV per ciphertext. Output is a single string so
// it fits in the existing TEXT columns without schema changes.
//
// Format: `enc:v1:<iv-base64>:<tag-base64>:<ciphertext-base64>`
//
// Backwards compatible: if a stored value does not start with `enc:v1:`
// it is returned as-is by `decryptSecret`. Next time the caller writes
// via `encryptSecret` it gets upgraded to ciphertext.
//
// The 32-byte key comes from env. Use either:
//   SECRET_ENCRYPTION_KEY — 32 raw bytes hex- or base64-encoded
// In dev, if absent, we fall back to a deterministic key derived from
// NEXTAUTH_SECRET or APP_URL so local stacks keep working. Production
// MUST set SECRET_ENCRYPTION_KEY explicitly.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const PREFIX = "enc:v1:";
const ALG = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce — recommended for GCM
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (raw) {
    // Try hex first, then base64
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      cachedKey = Buffer.from(raw, "hex");
      return cachedKey;
    }
    try {
      const buf = Buffer.from(raw, "base64");
      if (buf.length === 32) {
        cachedKey = buf;
        return cachedKey;
      }
    } catch {
      // fall through
    }
    // Last resort: SHA-256 of the provided string
    cachedKey = createHash("sha256").update(raw).digest();
    return cachedKey;
  }

  // Dev fallback — never use in prod
  const fallback =
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "leadflow-dev-only-fallback";
  cachedKey = createHash("sha256")
    .update(`leadflow:secret-box:${fallback}`)
    .digest();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted

  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext — handled by caller

  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret payload");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const key = loadKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Invalid encrypted secret header");
  }

  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}
