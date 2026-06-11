// src/lib/db/ensure-schema.ts
//
// Self-applying, idempotent schema migrations run at process startup (web via
// instrumentation.ts, workers via their entrypoint). The operator deploys with
// `git push` and never has to run SQL by hand — which is exactly how this
// project is operated.
//
// RULES for what may live here:
//   - ONLY additive / idempotent DDL: `ADD COLUMN IF NOT EXISTS`,
//     `CREATE INDEX IF NOT EXISTS`, `DROP ... IF EXISTS`. Never destructive
//     (no DROP COLUMN, no data rewrites). Adding a nullable column is the
//     safest DDL there is and is a no-op when the column already exists.
//   - Each statement is best-effort and isolated: one failing statement logs
//     and does NOT block the others or crash boot.
//
// This is intentionally NOT a full migration framework. It's a pragmatic way
// to ship the small additive columns our JSON-light schema occasionally needs
// without a manual SQL step.

import prisma from "@/lib/db/prisma";

const STATEMENTS: string[] = [
  // ── Multi-channel (vários canais do mesmo tipo) — Fase 1 ──
  `ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "label" TEXT`,
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "channel_config_id" TEXT`,
  `CREATE INDEX IF NOT EXISTS "channels_account_id_type_idx" ON "channels" ("account_id", "type")`,
];

let ran = false;

export async function ensureSchema(): Promise<void> {
  if (ran) return;
  ran = true;
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      // Best-effort: a missing DDL permission or transient error must not
      // crash boot. Log loudly so it's visible in the deploy logs.
      console.error(
        "[ensure-schema] statement failed (continuing):",
        sql,
        e instanceof Error ? e.message : e
      );
    }
  }
}
