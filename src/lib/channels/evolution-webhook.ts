// src/lib/channels/evolution-webhook.ts
//
// Auto-configure the Evolution API webhook for a given instance.
// Evolution 2.x exposes POST /webhook/set/{instanceName} with this body:
//
//   {
//     "webhook": {
//       "enabled": true,
//       "url": "https://<app>/api/webhooks/evolution",
//       "headers": { "x-webhook-secret": "<optional>" },
//       "byEvents": false,    // send all events on one URL
//       "base64": false,      // we transcribe audio ourselves
//       "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
//     }
//   }
//
// Without this, the AI never sees inbound WhatsApp messages, the lead
// thinks no one is replying, the operator thinks the platform is broken.
// We call this right after creating an instance and also expose it as a
// `configureWebhook` action so the dashboard can backfill instances that
// were created before this code existed.

import { logger } from "@/lib/logger";

const log = logger.child({ module: "channels/evolution-webhook" });

export interface ConfigureWebhookInput {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  /** Optional per-tenant secret. When present, Evolution sends it as
   * `x-webhook-secret` so /api/webhooks/evolution can reject impostors. */
  webhookSecret?: string;
}

export interface ConfigureWebhookResult {
  ok: boolean;
  status: number;
  detail?: string;
}

const EVENTS = [
  "MESSAGES_UPSERT",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
];

export async function configureEvolutionWebhook(
  input: ConfigureWebhookInput
): Promise<ConfigureWebhookResult> {
  const { baseUrl, apiKey, instanceName, webhookUrl, webhookSecret } = input;
  if (!baseUrl || !apiKey || !instanceName || !webhookUrl) {
    return { ok: false, status: 0, detail: "missing_params" };
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/webhook/set/${encodeURIComponent(instanceName)}`;

  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      headers: webhookSecret ? { "x-webhook-secret": webhookSecret } : undefined,
      byEvents: false,
      base64: false,
      events: EVENTS,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      log.info("evolution webhook set", { instanceName, webhookUrl });
      return { ok: true, status: res.status };
    }

    const text = await res.text().catch(() => "");
    log.warn("evolution webhook set failed", {
      instanceName,
      status: res.status,
      detail: text.slice(0, 200),
    });

    // Evolution 1.x used POST /webhook/instance, try that as a fallback so
    // older self-hosted servers still receive the config. Same payload.
    if (res.status === 404) {
      const altUrl = `${cleanBase}/webhook/instance`;
      const altRes = await fetch(altUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          instanceName,
          ...payload.webhook,
        }),
      });
      if (altRes.ok) {
        log.info("evolution webhook set via legacy path", { instanceName });
        return { ok: true, status: altRes.status };
      }
      const altText = await altRes.text().catch(() => "");
      return {
        ok: false,
        status: altRes.status,
        detail: altText.slice(0, 200) || `legacy_path_${altRes.status}`,
      };
    }

    return { ok: false, status: res.status, detail: text.slice(0, 200) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error("evolution webhook set crashed", { instanceName, detail });
    return { ok: false, status: 0, detail };
  }
}
