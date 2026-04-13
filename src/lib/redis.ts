// src/lib/redis.ts
//
// BullMQ ships its own ioredis internally.
// Installing a SEPARATE ioredis causes type conflicts
// (duplicate AbstractConnector). The fix: pass the Redis
// URL string to BullMQ — it handles connection creation.

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * BullMQ-compatible connection string.
 */
export function getQueueConnection(): string {
  return REDIS_URL;
}

/**
 * Parse Redis URL into host/port/password for anything
 * outside BullMQ that needs a structured config.
 */
export function parseRedisUrl(url?: string): {
  host: string;
  port: number;
  password?: string;
} {
  const parsed = new URL(url || REDIS_URL);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
  };
}