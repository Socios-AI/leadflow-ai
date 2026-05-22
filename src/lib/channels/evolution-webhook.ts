// src/lib/channels/evolution-webhook.ts
//
// Auto-configure the Evolution API webhook for a given instance.
//
// Evolution API has shifted endpoint shapes across releases and forks, so
// we probe a list of well-known paths and stop at the first one that the
// server accepts. We return the full attempt log so the dashboard and the
// operator can diagnose which path their server speaks.

import { logger } from "@/lib/logger";

const log = logger.child({ module: "channels/evolution-webhook" });

export interface ConfigureWebhookInput {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  webhookSecret?: string;
}

export interface ConfigureWebhookAttempt {
  label: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  detail?: string;
}

export interface ConfigureWebhookResult {
  ok: boolean;
  status: number;
  detail?: string;
  /** Endpoint variant that succeeded, for ops visibility */
  variant?: string;
  /** Full attempt log, ordered, so the operator can paste it as a bug report */
  attempts: ConfigureWebhookAttempt[];
}

const EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

interface Attempt {
  method: "POST" | "PUT";
  path: string;
  body: unknown;
  label: string;
}

/** Build the JSON bodies used by different Evolution forks. */
export function webhookBodies(input: ConfigureWebhookInput) {
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
  return { wrapped, flat };
}

function buildAttempts(input: ConfigureWebhookInput): Attempt[] {
  const inst = encodeURIComponent(input.instanceName);
  const { wrapped, flat } = webhookBodies(input);

  // Ordered, most likely first. We stop on the first 2xx.
  return [
    // Evolution v2.x official (Postman/docs)
    { method: "POST", path: `/webhook/set/${inst}`, body: wrapped, label: "v2_post_set_wrapped" },
    { method: "POST", path: `/webhook/set/${inst}`, body: flat, label: "v2_post_set_flat" },
    { method: "PUT", path: `/webhook/set/${inst}`, body: wrapped, label: "v2_put_set_wrapped" },
    { method: "PUT", path: `/webhook/set/${inst}`, body: flat, label: "v2_put_set_flat" },
    // v2.3.x some forks
    { method: "POST", path: `/webhook/instance/${inst}`, body: flat, label: "v2_post_instance_flat" },
    { method: "POST", path: `/webhook/instance/${inst}`, body: wrapped, label: "v2_post_instance_wrapped" },
    // v1.x legacy
    { method: "POST", path: `/instance/setWebhook/${inst}`, body: flat, label: "v1_post_setWebhook" },
    // Some forks
    { method: "POST", path: `/webhook/${inst}`, body: flat, label: "fork_post_short" },
    { method: "PUT", path: `/webhook/${inst}`, body: flat, label: "fork_put_short" },
    { method: "POST", path: `/instance/webhook/${inst}`, body: flat, label: "fork_post_instance_webhook" },
  ];
}

export async function configureEvolutionWebhook(
  input: ConfigureWebhookInput
): Promise<ConfigureWebhookResult> {
  if (!input.baseUrl || !input.apiKey || !input.instanceName || !input.webhookUrl) {
    return {
      ok: false,
      status: 0,
      detail: "missing_params",
      attempts: [],
    };
  }

  const cleanBase = input.baseUrl.replace(/\/+$/, "");
  const attempts = buildAttempts(input);
  const log_: ConfigureWebhookAttempt[] = [];

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
          status: res.status,
        });
        log_.push({
          label: a.label,
          method: a.method,
          url,
          status: res.status,
          ok: true,
        });
        return {
          ok: true,
          status: res.status,
          variant: a.label,
          attempts: log_,
        };
      }

      const text = await res.text().catch(() => "");
      log_.push({
        label: a.label,
        method: a.method,
        url,
        status: res.status,
        ok: false,
        detail: text.slice(0, 240),
      });
      log.warn("evolution webhook variant failed", {
        instanceName: input.instanceName,
        variant: a.label,
        status: res.status,
        detail: text.slice(0, 200),
      });

      // Auth errors short-circuit, no other path will fix bad credentials.
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          detail: `auth_failed: ${text.slice(0, 200)}`,
          variant: a.label,
          attempts: log_,
        };
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log_.push({
        label: a.label,
        method: a.method,
        url,
        status: 0,
        ok: false,
        detail,
      });
      log.warn("evolution webhook variant crashed", {
        instanceName: input.instanceName,
        variant: a.label,
        detail,
      });
    }
  }

  const last = log_[log_.length - 1];
  return {
    ok: false,
    status: last?.status ?? 0,
    detail: last?.detail || "no_variant_accepted",
    attempts: log_,
  };
}
