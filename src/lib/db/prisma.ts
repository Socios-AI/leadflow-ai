// src/lib/db/prisma.ts
//
// Prisma client singleton with two safety nets:
//
//   1) URL repair, when DATABASE_URL is the pooler URL but the username is
//      the bare `postgres`, we auto-rewrite it to `postgres.<project-ref>`
//      using the ref from NEXT_PUBLIC_SUPABASE_URL. Supavisor requires
//      that prefix or every query fails with `Tenant or user not found`.
//      This is the single most common Coolify misconfiguration.
//
//   2) Transient-error retry, all model operations are wrapped with a
//      jittered retry loop for pooler-side errors like connection drops
//      and prepared-statement misses, common on Supabase free tier.
//
// Production: set DATABASE_URL to the Supabase pooled URL,
//   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10

import { PrismaClient } from "@prisma/client";

type PrismaClientWithRetry = PrismaClient;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithRetry | undefined;
  prismaPatchLogged: boolean | undefined;
};

/** Extract the Supabase project ref from NEXT_PUBLIC_SUPABASE_URL. */
function projectRefFromPublicUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Expected: <ref>.supabase.co  (sometimes <ref>.supabase.in, <ref>.<region>.supabase.co)
    const host = u.hostname;
    const m = host.match(/^([a-z0-9]{16,32})\./i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Repair a Supabase pooler URL that has the wrong username.
 * - If the host is a pooler (port 6543 or hostname contains `pooler`/`pgbouncer`)
 *   and the username is bare `postgres` (no `.<ref>` suffix), inject the ref
 *   from NEXT_PUBLIC_SUPABASE_URL.
 * - Always patch missing `pgbouncer=true` and `connection_limit` query params
 *   on pooler URLs so we never blow the pool.
 */
function repairUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let patched = false;
  try {
    const u = new URL(url);
    const isPooled =
      u.port === "6543" ||
      u.hostname.includes("pooler") ||
      u.hostname.includes("pgbouncer");

    if (isPooled) {
      // Fix username if it's bare `postgres` instead of `postgres.<ref>`.
      if (u.username === "postgres") {
        const ref = projectRefFromPublicUrl();
        if (ref) {
          u.username = `postgres.${ref}`;
          patched = true;
        }
      }
      // Patch pool hints.
      if (!u.searchParams.has("pgbouncer")) {
        u.searchParams.set("pgbouncer", "true");
        patched = true;
      }
      if (!u.searchParams.has("connection_limit")) {
        u.searchParams.set("connection_limit", "10");
        patched = true;
      }
    }

    if (patched && !globalForPrisma.prismaPatchLogged) {
      globalForPrisma.prismaPatchLogged = true;
      const safeUser = u.username;
      const safeHost = `${u.hostname}:${u.port || "5432"}`;
      console.warn(
        `[prisma] DATABASE_URL auto-repaired: user=${safeUser}, host=${safeHost}, ` +
          `pgbouncer=${u.searchParams.get("pgbouncer")}, connection_limit=${u.searchParams.get("connection_limit")}`
      );
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Warn loudly if the URL is still bad after our best-effort repair. */
function diagnoseUrl(url: string | undefined): void {
  if (!url) {
    console.error("[prisma] DATABASE_URL is not set");
    return;
  }
  try {
    const u = new URL(url);
    const isPooled =
      u.port === "6543" ||
      u.hostname.includes("pooler") ||
      u.hostname.includes("pgbouncer");
    if (isPooled && u.username === "postgres") {
      console.error(
        "[prisma] DATABASE_URL still uses bare `postgres` on the pooler and we " +
          "couldn't derive the project ref from NEXT_PUBLIC_SUPABASE_URL. Every query " +
          "will fail with `Tenant or user not found`. Fix the connection string in your env."
      );
    }
  } catch {
    console.error("[prisma] DATABASE_URL is not a valid URL");
  }
}

const databaseUrl = repairUrl(process.env.DATABASE_URL);
diagnoseUrl(databaseUrl);

// Transient connection-layer errors from the pooler. Bubble everything else.
const RETRYABLE_RE =
  /tenant or user not found|server has closed the connection|connection terminated|engine is not yet connected|terminating connection due to administrator command|prepared statement .* does not exist|server closed the connection unexpectedly/i;

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_RE.test(msg);
}

function createClient(): PrismaClientWithRetry {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
  });

  // Client extension that wraps every model operation with retries on
  // transient pooler errors. We do NOT call $disconnect inside the loop
  // because that would tank parallel queries on the same client. A short
  // jittered backoff is enough for Supavisor to hand us a fresh backend
  // connection on the next attempt.
  const extended = base.$extends({
    name: "supavisor-retry",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              return await query(args);
            } catch (err) {
              lastError = err;
              if (!isRetryable(err)) throw err;
              const delay = 80 + attempt * 180 + Math.floor(Math.random() * 60);
              await new Promise((r) => setTimeout(r, delay));
            }
          }
          throw lastError;
        },
      },
    },
  });

  return extended as unknown as PrismaClientWithRetry;
}

const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
