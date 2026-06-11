// src/instrumentation.ts
//
// Next.js runs register() once at server startup (before serving requests),
// in the standalone production server too. We use it to apply our idempotent
// additive schema migrations automatically on every deploy — so the operator
// never runs SQL by hand.

export async function register() {
  // Only in the Node.js server runtime (not edge). The DB client is Node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSchema } = await import("@/lib/db/ensure-schema");
    await ensureSchema();
  } catch (e) {
    console.error("[instrumentation] ensureSchema failed:", e instanceof Error ? e.message : e);
  }
}
