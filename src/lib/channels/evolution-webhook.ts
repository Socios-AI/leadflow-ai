// src/lib/channels/evolution-webhook.ts
//
// Auto-configure the Evolution API webhook for a given instance.
//
// Evolution API has shifted endpoint shapes across releases and forks, so
// we probe a handful of well-known paths and stop at the first one that
// the server accepts. We log the winning attempt so the operator can see
// which path their server speaks.
//
// Known variants we try, in order:
//   1) POST /webhook/set/{instance}   body { webhook: { enabled, url, ... } }
//   2) POST /webhook/set/{instance}   body flat { enabled, url, ... }
//   3) PUT  /webhook/set/{instance}   body { webhook: { enabled, url, ... } }
//   4) POST /instance/setWebhook/{instance}   body flat (v1.x legacy)
//   5) POST /webhook/{instance}        body flat (some forks)
//
// All variants get the apikey header. We accept any 2xx response as success.

import { logger } from "@/lib/logger";

const log = logger.child({ module: "channels/evolution-webhook" });

export interface ConfigureWebhookInput {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  webhookSecret?: string;
}

export interface ConfigureWebhookResult {
  ok: boolean;
  status: number;
  detail?: string;
  /** Endpoint variant that succeeded, for ops visibility */
  variant?: string;
}

const EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

interface Attempt {
  method: "POST" | "PUT";
  path: string; // already starting with /
  body: unknown;
  label: string;
}

function buildAttempts(input: ConfigureWebhookInput): Attempt[] {
  const inst = encodeURIComponent(input.instanceName);
  const headers = input.webhookSecret
    ? { "x-webhook-secret": input.webhookSecret }
    : undefined;
  const wrapped = {
    webhook: {
      enabled: true,
      url: input.webhookUrl,
      headers,
      byEvents: false,
      base64: false,
      events: EVENTS,
      // Some forks read these capitalized variants on the same payload
      webhookByEvents: false,
      webhookBase64: false,
    },
  };
  const flat = {
    enabled: true,
    url: input.webhookUrl,
    headers,
    byEvents: false,
    base64: false,
    events: EVENTS,
    webhookByEvents: false,
    webhookBase64: false,
  };

  return [
    { method: "POST", path: `/webhook/set/${inst}`, body: wrapped, label: "v2_post_wrapped" },
    { method: "POST", path: `/webhook/set/${inst}`, body: flat, label: "v2_post_flat" },
    { method: "PUT", path: `/webhook/set/${inst}`, body: wrapped, label: "v2_put_wrapped" },
    { method: "POST", path: `/instance/setWebhook/${inst}`, body: flat, label: "v1_legacy" },
    { method: "POST", path: `/webhook/${inst}`, body: flat, label: "fork_short" },
  ];
}

export async function configureEvolutionWebhook(
  input: ConfigureWebhookInput
): Promise<ConfigureWebhookResult> {
  if (!input.baseUrl || !input.apiKey || !input.instanceName || !input.webhookUrl) {
    return { ok: false, status: 0, detail: "missing_params" };
  }

  const cleanBase = input.baseUrl.replace(/\/+$/, "");
  const attempts = buildAttempts(input);

  let lastStatus = 0;
  let lastDetail = "";

  for (const a of attempts) {
    const url = `${cleanBase}${a.path}`;
    try {
      const res = await fetch(url, {
        method: a.method,
        headers: {
          "Content-Type": "application/json",
          apikey: input.apiKey,
        },
        body: JSON.stringify(a.body),
      });

      if (res.ok) {
        log.info("evolution webhook set", {
          instanceName: input.instanceName,
          variant: a.label,
          url,
          status: res.status,
        });
        return { ok: true, status: res.status, variant: a.label };
      }

      const text = await res.text().catch(() => "");
      lastStatus = res.status;
      lastDetail = text.slice(0, 300);
      log.warn("evolution webhook variant failed", {
        instanceName: input.instanceName,
        variant: a.label,
        status: res.status,
        detail: lastDetail,
      });

      // 401/403 means auth is wrong, no point trying other paths.
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          detail: `auth_failed: ${lastDetail}`,
          variant: a.label,
        };
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      lastDetail = detail;
      log.warn("evolution webhook variant crashed", {
        instanceName: input.instanceName,
        variant: a.label,
        detail,
      });
    }
  }

  return {
    ok: false,
    status: lastStatus,
    detail: lastDetail || "no_variant_accepted",
  };
}
