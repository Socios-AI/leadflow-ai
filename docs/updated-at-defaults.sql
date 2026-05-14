-- ══════════════════════════════════════════════════════════════════
-- Add DEFAULT NOW() to every `updated_at` column
-- ══════════════════════════════════════════════════════════════════
--
-- Prisma's @updatedAt decorator only fires for Prisma writes. Inserts
-- that go through Supabase REST (admin tenant create, onboarding,
-- worker provisioning) hit the raw Postgres NOT NULL and fail with
-- "null value in column updated_at violates not-null constraint".
--
-- Setting a column default of NOW() makes the insert succeed even when
-- the caller forgets the field, with the same semantic as Prisma.
--
-- Idempotent. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
      AND is_nullable = 'NO'
      AND column_default IS NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN updated_at SET DEFAULT NOW();',
      rec.table_schema, rec.table_name
    );
    RAISE NOTICE 'Set default on %.updated_at', rec.table_name;
  END LOOP;
END $$;
