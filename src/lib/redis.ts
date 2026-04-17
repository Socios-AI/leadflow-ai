// src/lib/redis.ts
//
// Redis access layer.
//
// Two exports:
//   - getRedis()            → singleton IORedis client for app code
//                             (debounce buffer, caches, locks).
//   - getQueueConnection()  → BullMQ-ready RedisOptions object.
//                             BullMQ requires maxRetriesPerRequest: null.
//
// ioredis is pinned in package.json (^5.10.1) and is also what BullMQ ships
// internally, so types line up.

import IORedis, { type RedisOptions } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let sharedClient: IORedis | null = null;

/**
 * App-wide Redis client. Lazy singleton.
 * Safe to import from anywhere — the connection is opened on first use.
 */
export function getRedis(): IORedis {
  if (!sharedClient) {
    sharedClient = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    sharedClient.on("error", (err) => {
      console.error("[redis] client error:", err.message);
    });
  }
  return sharedClient;
}

/**
 * Build a BullMQ-compatible connection options object.
 * BullMQ accepts a RedisOptions object (not a URL string) in its types.
 */
export function getQueueConnection(): RedisOptions {
  const parsed = new URL(REDIS_URL);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function parseRedisUrl(url?: string): {
  host: string;
  port: number;
  password?: string;
} {
  const parsed = new URL(url || REDIS_URL);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}
