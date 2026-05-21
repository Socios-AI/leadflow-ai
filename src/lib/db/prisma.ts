// src/lib/db/prisma.ts
//
// Prisma client singleton, explicitly avoids creating new connections on
// every Next.js dev hot-reload, and adds `connection_limit` to the URL when
// missing so we never blow past Supabase's PgBouncer pool.
//
// Also installs a query interceptor that auto-recovers from the Supavisor
// "Tenant or user not found" error. That message comes up when the pooler
// drops a stale client connection or when the engine is reconnecting on
// boot. A single retry after $disconnect almost always resolves it, and we
// log clearly when it persists so the operator can diagnose the
// connection string.
//
// Production (Coolify): set DATABASE_URL to the Supabase pooled URL,
//   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10
// Note the **postgres.<project-ref>** username, the bare "postgres" user
// will trigger "Tenant or user not found" 100% of the time.

import { PrismaClient } from "@prisma/client";

type PrismaClientWithRetry = PrismaClient;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithRetry | undefined;
  prismaWarned: boolean | undefined;
};

function withPoolHints(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    const isPooled =
      u.port === "6543" ||
      u.hostname.includes("pooler") ||
      u.hostname.includes("pgbouncer");
    if (!isPooled) return url;
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("connection_limit"))
      u.searchParams.set("connection_limit", "10");
    return u.toString();
  } catch {
    return url;
  }
}

function diagnoseUrl(url: string | undefined): void {
  if (globalForPrisma.prismaWarned) return;
  globalForPrisma.prismaWarned = true;
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
      console.warn(
        "[prisma] DATABASE_URL uses the pooler but the username is bare `postgres`. " +
          "Supavisor needs `postgres.<project-ref>` or every query will fail with `Tenant or user not found`."
      );
    }
  } catch {
    console.error("[prisma] DATABASE_URL is not a valid URL");
  }
}

const databaseUrl = withPoolHints(process.env.DATABASE_URL);
diagnoseUrl(databaseUrl);

// Transient connection-layer errors from the pooler. We retry once after
// forcing a reconnect. Anything outside this list bubbles up unchanged.
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

  // Client extension that wraps every model operation with a couple of
  // retries on transient pooler errors. We deliberately do NOT call
  // $disconnect() inside the retry, that would tank any other in-flight
  // queries on the same client. A short jittered backoff is enough for
  // Supavisor to hand us a fresh backend connection on the next attempt.
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

  // $extends returns a typed proxy. Cast back to PrismaClient so the rest
  // of the app keeps the original surface.
  return extended as unknown as PrismaClientWithRetry;
}

const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
