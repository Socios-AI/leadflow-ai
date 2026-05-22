// src/lib/app-url.ts
//
// Canonical app URL resolver. Order of precedence:
//   1. Request headers (x-forwarded-host + x-forwarded-proto), what the user
//      is actually loading right now. Always correct if the request is
//      coming through the public hostname.
//   2. NEXT_PUBLIC_APP_URL env var, configured static fallback.
//   3. Hardcoded production URL, last resort so invite links are never
//      pointed at a placeholder when the env var is misconfigured.

const DEFAULT_APP_URL = "https://mktdigital.sociosai.com";

function clean(url: string): string {
  return url.replace(/\/+$/, "");
}

export function appUrlFromRequest(req: Request): string {
  // Prefer the host the client used, that way invite links work even when
  // the env var was set to the wrong tenant or to a stale CNAME.
  try {
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto =
      req.headers.get("x-forwarded-proto") ||
      (req.url.startsWith("http://") ? "http" : "https");
    if (forwardedHost) {
      // Defend against multi-host headers like "a.com, b.com"
      const host = forwardedHost.split(",")[0].trim();
      // And against obviously wrong hosts like "localhost" in prod
      if (host && !host.startsWith("localhost")) {
        return clean(`${forwardedProto}://${host}`);
      }
    }
  } catch {
    // fall through
  }

  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && env.trim()) return clean(env.trim());
  return DEFAULT_APP_URL;
}

/** Pure-env variant for callers that don't have a Request (workers, cron, ...). */
export function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && env.trim()) return clean(env.trim());
  return DEFAULT_APP_URL;
}
