// src/lib/inbound-idempotency.ts
//
// Redis-backed idempotency guard for inbound webhooks. Protects against
// the common race where Twilio/Resend retries a webhook within seconds and
// both invocations would otherwise findOrCreate a lead, conversation and
// message in parallel.
//
// Usage:
//   const claim = await claimInbound(`sms:${accountId}:${msgSid}`);
//   if (!claim.fresh) return { status: "ignored", reason: "duplicate" };
//   ... process ...
//
// We deliberately use Redis SETNX with a short TTL, not a DB unique
// constraint, because:
//   - changing the Message schema needs a migration which we can't run
//     from here without downtime risk
//   - the guard works even when the duplicate hits a different web
//     instance behind a load balancer
//   - the TTL self-expires so we never accumulate dead keys

import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 60 * 60; // 1h is more than enough for any sane retry

export interface Claim {
  fresh: boolean;
}

export async function claimInbound(key: string): Promise<Claim> {
  if (!key) return { fresh: true };
  try {
    const redis = getRedis();
    const result = await redis.set(`inbound:idem:${key}`, "1", "EX", TTL_SECONDS, "NX");
    return { fresh: result === "OK" };
  } catch {
    // Redis unavailable, fall open so we don't silently drop inbound.
    return { fresh: true };
  }
}
