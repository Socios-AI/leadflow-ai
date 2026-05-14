-- ══════════════════════════════════════════════════════════════════
-- AI Knowledge + Media + Assistants migration
-- Apply once in the Supabase SQL Editor. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- 1) New enum for media kinds ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssistantMediaKind') THEN
    CREATE TYPE "AssistantMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT');
  END IF;
END $$;

-- 2) Extend ai_configs with active_assistant_id ────────────────────
ALTER TABLE "ai_configs"
  ADD COLUMN IF NOT EXISTS "active_assistant_id" TEXT;

-- 3) Named AI personas (multiple per account) ──────────────────────
CREATE TABLE IF NOT EXISTS "ai_assistants" (
  "id"                TEXT PRIMARY KEY,
  "account_id"        TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "name"              TEXT NOT NULL,
  "description"       TEXT,
  "provider"          TEXT NOT NULL DEFAULT 'openai',
  "model"             TEXT NOT NULL DEFAULT 'gpt-4o',
  "system_prompt"     TEXT NOT NULL,
  "temperature"       DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "max_tokens"        INT NOT NULL DEFAULT 1000,
  "persona"           JSONB,
  "rules"             JSONB,
  "business_hours"    JSONB,
  "off_hours_message" TEXT,
  "escalation_config" JSONB,
  "conversion_config" JSONB,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ai_assistants_account_id_idx"
  ON "ai_assistants" ("account_id");

-- 4) Knowledge files (PDF / DOCX / TXT uploaded to feed the AI) ────
CREATE TABLE IF NOT EXISTS "knowledge_files" (
  "id"             TEXT PRIMARY KEY,
  "account_id"     TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "storage_path"   TEXT NOT NULL,
  "public_url"     TEXT,
  "mime_type"      TEXT NOT NULL,
  "size_bytes"     INT NOT NULL,
  "extracted_text" TEXT,
  "category"       TEXT NOT NULL DEFAULT 'general',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "knowledge_files_account_id_category_idx"
  ON "knowledge_files" ("account_id", "category");

-- 5) Assistant media library (files the AI sends during chat) ──────
CREATE TABLE IF NOT EXISTS "assistant_media" (
  "id"               TEXT PRIMARY KEY,
  "account_id"       TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "name"             TEXT NOT NULL,
  "description"      TEXT NOT NULL,
  "send_instruction" TEXT NOT NULL,
  "kind"             "AssistantMediaKind" NOT NULL,
  "storage_path"     TEXT NOT NULL,
  "public_url"       TEXT,
  "mime_type"        TEXT NOT NULL,
  "size_bytes"       INT NOT NULL,
  "is_active"        BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "assistant_media_account_active_idx"
  ON "assistant_media" ("account_id", "is_active");

-- 6) Supabase Storage buckets ──────────────────────────────────────
-- The app uploads to two buckets. Run this with the service role
-- (Supabase SQL Editor uses service role by default).
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('assistant-media', 'assistant-media', false)
ON CONFLICT (id) DO NOTHING;
