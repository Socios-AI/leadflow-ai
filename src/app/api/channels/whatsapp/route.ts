// src/app/api/channels/whatsapp/route.ts
//
// Evolution API integration. On connect we now ALSO push the webhook
// config to Evolution so inbound messages flow to /api/webhooks/evolution
// automatically. The dashboard also exposes a `configureWebhook` action
// so the owner can backfill instances that were created before this code
// existed.
//
// ENV VARS:
//   EVOLUTION_API_URL=https://evo.example.com
//   EVOLUTION_API_KEY=<global api key>

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import {
  configureEvolutionWebhook,
  webhookBodies,
} from "@/lib/channels/evolution-webhook";
import { appUrlFromRequest } from "@/lib/app-url";

const EVO_URL = () => (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
const EVO_KEY = () => process.env.EVOLUTION_API_KEY || "";

function instanceName(accountId: string) {
  return `mdai-${accountId}`;
}

function webhookUrlFor(req: Request | NextRequest): string {
  return `${appUrlFromRequest(req)}/api/webhooks/evolution`;
}

interface WaConfig {
  instanceName?: string;
  connected?: boolean;
  phoneNumber?: string | null;
  lastActivity?: string | null;
  webhookConfigured?: boolean;
  webhookConfiguredAt?: string | null;
  webhookSecret?: string;
  // When true (default), the AI only engages leads that already exist in
  // the funnel (came from a webhook, manual import, CSV, etc.). When false
  // the AI answers any stranger that messages the connected number.
  respondToFunnelLeadsOnly?: boolean;
}

/**
 * Best-effort push of the webhook config to Evolution for the given
 * account's instance. Returns a small status object the caller can log
 * or surface. Never throws, never blocks the calling flow.
 */
async function setWebhookForAccount(
  req: Request | NextRequest,
  accountId: string,
  cfg: WaConfig
): Promise<{ ok: boolean; detail?: string }> {
  const baseUrl = EVO_URL();
  const apiKey = EVO_KEY();
  const inst = cfg.instanceName || instanceName(accountId);
  if (!baseUrl || !apiKey) return { ok: false, detail: "missing_evolution_env" };

  const res = await configureEvolutionWebhook({
    baseUrl,
    apiKey,
    instanceName: inst,
    webhookUrl: webhookUrlFor(req),
    webhookSecret: cfg.webhookSecret,
  });

  if (res.ok) {
    await prisma.channel.update({
      where: { accountId_type: { accountId, type: "WHATSAPP" } },
      data: {
        config: {
          ...cfg,
          instanceName: inst,
          webhookConfigured: true,
          webhookConfiguredAt: new Date().toISOString(),
        },
      },
    });
    return { ok: true };
  }
  return { ok: false, detail: res.detail || `http_${res.status}` };
}

/** GET, current WhatsApp status (always cross-checked with Evolution live state) */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
    });
    const cfg = (channel?.config as WaConfig | null) || {};
    const targetInstance = cfg.instanceName || instanceName(session.accountId);

    // ── Live cross-check with Evolution ──
    // The old code only checked when the cached config said connected=true,
    // so a successful manual re-pair on Evolution would never propagate
    // back to this UI ("WhatsApp not connected" even though it was). Now
    // we always ask Evolution for the truth and reconcile the DB cache in
    // both directions.
    let live: { connected: boolean; phone: string | null; available: boolean } = {
      connected: !!cfg.connected,
      phone: cfg.phoneNumber || null,
      available: false,
    };

    if (EVO_URL()) {
      try {
        const r = await fetch(
          `${EVO_URL()}/instance/connectionState/${targetInstance}`,
          { headers: { apikey: EVO_KEY() } }
        );
        if (r.ok) {
          const d = await r.json();
          const open = d?.instance?.state === "open";
          live = { connected: open, phone: cfg.phoneNumber || null, available: true };

          // When Evolution says open but we have no phone yet, fetch the
          // instance to pull the paired number for the UI.
          if (open && !live.phone) {
            try {
              const ir = await fetch(
                `${EVO_URL()}/instance/fetchInstances?instanceName=${targetInstance}`,
                { headers: { apikey: EVO_KEY() } }
              );
              if (ir.ok) {
                const data = await ir.json();
                const inst = Array.isArray(data) ? data[0] : data;
                live.phone = inst?.instance?.wuid?.split("@")[0] || null;
              }
            } catch {
              // phone is optional, ignore
            }
          }
        }
      } catch {
        // Evolution unreachable, fall back to cached state, don't lie to the UI
      }
    }

    // Reconcile the DB cache so callers (workers, factories) read fresh data.
    if (live.available && channel && (live.connected !== !!cfg.connected || (live.connected && live.phone && live.phone !== cfg.phoneNumber))) {
      await prisma.channel.update({
        where: { id: channel.id },
        data: {
          config: {
            ...cfg,
            instanceName: targetInstance,
            connected: live.connected,
            phoneNumber: live.connected ? live.phone : null,
            lastActivity: live.connected ? new Date().toISOString() : cfg.lastActivity,
          },
        },
      });
    }

    return NextResponse.json({
      connected: live.connected,
      phoneNumber: live.connected ? live.phone : null,
      lastActivity: cfg.lastActivity || null,
      webhookConfigured: cfg.webhookConfigured || false,
      webhookConfiguredAt: cfg.webhookConfiguredAt || null,
      webhookUrl: webhookUrlFor(req),
      respondToFunnelLeadsOnly: cfg.respondToFunnelLeadsOnly !== false,
    });
  } catch {
    return NextResponse.json({
      connected: false,
      phoneNumber: null,
      lastActivity: null,
      webhookConfigured: false,
      webhookUrl: webhookUrlFor(req),
      respondToFunnelLeadsOnly: true,
    });
  }
}

/** POST, connect / disconnect / status / configureWebhook */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseUrl = EVO_URL();
  const apiKey = EVO_KEY();

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "Evolution API nao configurada no servidor" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { action } = body;
  const instName = instanceName(session.accountId);

  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
    });
    const cfg = (channel?.config as WaConfig | null) || {};

    // ═══ RESTART BAILEYS ═══
    // Forces Evolution to re-establish the WhatsApp socket without
    // dropping the paired session. Use when sends fail with "Connection
    // Closed" or messages are stuck. Probes PUT then POST since
    // Evolution forks disagree on the verb.
    if (action === "restart") {
      const targetInstance = cfg.instanceName || instName;
      const url = `${baseUrl}/instance/restart/${targetInstance}`;
      const tried: { method: string; status: number; body?: string }[] = [];
      let ok = false;
      for (const method of ["PUT", "POST"] as const) {
        try {
          const r = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", apikey: apiKey },
          });
          const body = await r.text().catch(() => "");
          tried.push({ method, status: r.status, body: body.slice(0, 200) });
          if (r.ok) {
            ok = true;
            break;
          }
        } catch (err) {
          tried.push({
            method,
            status: 0,
            body: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return NextResponse.json({ ok, instanceName: targetInstance, tried }, { status: ok ? 200 : 502 });
    }

    // ═══ UPDATE FUNNEL-ONLY FLAG ═══
    if (action === "setRespondToFunnelLeadsOnly") {
      const value = body.value !== false;
      await prisma.channel.upsert({
        where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
        create: {
          accountId: session.accountId,
          type: "WHATSAPP",
          isEnabled: true,
          config: { instanceName: instName, respondToFunnelLeadsOnly: value },
        },
        update: {
          config: { ...cfg, respondToFunnelLeadsOnly: value },
        },
      });
      return NextResponse.json({
        success: true,
        respondToFunnelLeadsOnly: value,
      });
    }

    // ═══ CONFIGURE WEBHOOK (backfill for existing instances) ═══
    if (action === "configureWebhook") {
      const targetInstance = cfg.instanceName || instName;
      let result = await configureEvolutionWebhook({
        baseUrl,
        apiKey,
        instanceName: targetInstance,
        webhookUrl: webhookUrlFor(req),
        webhookSecret: cfg.webhookSecret,
      });

      // Self-heal: when Evolution says the instance does not exist (was
      // deleted from the Evolution server but our DB still points at it),
      // create it with the webhook baked into the create payload and try
      // again. This is the same path used by the "connect" action so the
      // operator always lands in a working state with one click.
      const instanceMissing = result.attempts.some(
        (a) => a.status === 404 && /instance.*does not exist/i.test(a.detail || "")
      );
      let recreatedQr: string | null = null;
      if (!result.ok && instanceMissing) {
        const { wrapped: webhookWrapped } = webhookBodies({
          baseUrl,
          apiKey,
          instanceName: targetInstance,
          webhookUrl: webhookUrlFor(req),
          webhookSecret: cfg.webhookSecret,
        });
        try {
          const createRes = await fetch(`${baseUrl}/instance/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify({
              instanceName: targetInstance,
              integration: "WHATSAPP-BAILEYS",
              qrcode: true,
              rejectCall: true,
              groupsIgnore: true,
              alwaysOnline: true,
              readMessages: false,
              readStatus: false,
              syncFullHistory: false,
              ...webhookWrapped,
            }),
          });
          if (createRes.ok) {
            const createData = await createRes.json().catch(() => ({}));
            recreatedQr = createData?.qrcode?.base64 || null;
            // Some Evolution versions don't honor webhook on /create.
            // Re-attempt the set call, instance now exists.
            result = await configureEvolutionWebhook({
              baseUrl,
              apiKey,
              instanceName: targetInstance,
              webhookUrl: webhookUrlFor(req),
              webhookSecret: cfg.webhookSecret,
            });
          }
        } catch {
          // fall through to error path below
        }
      }

      if (result.ok) {
        await prisma.channel.update({
          where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
          data: {
            config: {
              ...cfg,
              instanceName: targetInstance,
              webhookConfigured: true,
              webhookConfiguredAt: new Date().toISOString(),
              // If we just recreated the instance, the lead also needs to
              // pair again, mark connection as stale so the UI prompts QR.
              ...(recreatedQr ? { connected: false } : {}),
            },
          },
        });
        return NextResponse.json({
          success: true,
          webhookUrl: webhookUrlFor(req),
          variant: result.variant,
          // If the instance had to be recreated, surface the QR so the
          // operator can re-pair without a second click.
          qrCode: recreatedQr,
          recreated: !!recreatedQr,
        });
      }

      return NextResponse.json(
        {
          error: result.detail || "webhook_config_failed",
          instanceName: targetInstance,
          attempts: result.attempts,
        },
        { status: 502 }
      );
    }

    // ═══ CONNECT ═══
    if (action === "connect") {
      let qrCode: string | null = null;
      let created = false;

      // 1. Try to create instance (ignore if already exists).
      // Pass the webhook config in the create body so brand-new instances
      // come up already wired, no second round-trip needed.
      const { wrapped: webhookWrapped } = webhookBodies({
        baseUrl,
        apiKey,
        instanceName: instName,
        webhookUrl: webhookUrlFor(req),
        webhookSecret: cfg.webhookSecret,
      });
      try {
        const createRes = await fetch(`${baseUrl}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({
            instanceName: instName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
            rejectCall: true,
            groupsIgnore: true,
            alwaysOnline: true,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
            // Evolution v2.x reads the webhook from the create payload.
            // Older versions ignore unknown keys, so this is safe.
            ...webhookWrapped,
          }),
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          if (createData.qrcode?.base64) {
            qrCode = createData.qrcode.base64;
            created = true;
            await prisma.channel.upsert({
              where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
              create: {
                accountId: session.accountId,
                type: "WHATSAPP",
                isEnabled: true,
                config: { instanceName: instName, connected: false },
              },
              update: { isEnabled: true },
            });
          }
        }
      } catch {
        // fall through
      }

      // 2. Instance already exists, fetch connection/QR
      if (!qrCode) {
        try {
          const connectRes = await fetch(
            `${baseUrl}/instance/connect/${instName}`,
            { method: "GET", headers: { apikey: apiKey } }
          );
          if (connectRes.ok) {
            const connectData = await connectRes.json();
            const isOpen =
              connectData.instance?.status === "open" ||
              connectData.instance?.state === "open";
            if (isOpen) {
              const phone = connectData.instance?.wuid?.split("@")[0] || null;
              await prisma.channel.upsert({
                where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
                create: {
                  accountId: session.accountId,
                  type: "WHATSAPP",
                  isEnabled: true,
                  config: {
                    instanceName: instName,
                    connected: true,
                    phoneNumber: phone,
                    lastActivity: new Date().toISOString(),
                  },
                },
                update: {
                  isEnabled: true,
                  config: {
                    ...cfg,
                    instanceName: instName,
                    connected: true,
                    phoneNumber: phone,
                    lastActivity: new Date().toISOString(),
                  },
                },
              });

              // Configure webhook now that we are connected, idempotent.
              await setWebhookForAccount(req, session.accountId, {
                ...cfg,
                instanceName: instName,
              });

              return NextResponse.json({
                connected: true,
                phoneNumber: phone,
                webhookUrl: webhookUrlFor(req),
              });
            }
            if (connectData.base64) qrCode = connectData.base64;
          }
        } catch {
          // fall through
        }
      }

      // 3. Try fetching instance directly
      if (!qrCode) {
        try {
          const qrRes = await fetch(
            `${baseUrl}/instance/fetchInstances?instanceName=${instName}`,
            { headers: { apikey: apiKey } }
          );
          if (qrRes.ok) {
            const instances = await qrRes.json();
            const inst = Array.isArray(instances) ? instances[0] : instances;
            if (inst?.instance?.status === "open") {
              const phone = inst.instance?.wuid?.split("@")[0] || null;
              await prisma.channel.upsert({
                where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
                create: {
                  accountId: session.accountId,
                  type: "WHATSAPP",
                  isEnabled: true,
                  config: { instanceName: instName, connected: true, phoneNumber: phone },
                },
                update: {
                  isEnabled: true,
                  config: { ...cfg, connected: true, phoneNumber: phone },
                },
              });
              await setWebhookForAccount(req, session.accountId, {
                ...cfg,
                instanceName: instName,
              });
              return NextResponse.json({
                connected: true,
                phoneNumber: phone,
                webhookUrl: webhookUrlFor(req),
              });
            }
          }
        } catch {
          // fall through
        }
      }

      // Whether the instance was just created OR was already there, push
      // the webhook config. Evolution accepts the call even when the
      // instance is not yet paired, so the next QR scan inherits it.
      if (qrCode) {
        await setWebhookForAccount(req, session.accountId, {
          ...cfg,
          instanceName: instName,
        });
        return NextResponse.json({
          qrCode,
          created,
          webhookUrl: webhookUrlFor(req),
        });
      }

      return NextResponse.json(
        { error: "Nao foi possivel gerar o QR Code. Tente novamente." },
        { status: 400 }
      );
    }

    // ═══ STATUS ═══
    if (action === "status") {
      try {
        const r = await fetch(`${baseUrl}/instance/connectionState/${instName}`, {
          headers: { apikey: apiKey },
        });
        const d = await r.json();
        const connected = d.instance?.state === "open";

        if (connected) {
          let phone = cfg.phoneNumber || null;
          try {
            const fetchRes = await fetch(
              `${baseUrl}/instance/fetchInstances?instanceName=${instName}`,
              { headers: { apikey: apiKey } }
            );
            const fetchData = await fetchRes.json();
            const inst = Array.isArray(fetchData) ? fetchData[0] : fetchData;
            phone = inst?.instance?.wuid?.split("@")[0] || phone;
          } catch {
            // ignore
          }

          await prisma.channel.upsert({
            where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
            create: {
              accountId: session.accountId,
              type: "WHATSAPP",
              isEnabled: true,
              config: {
                instanceName: instName,
                connected: true,
                phoneNumber: phone,
                lastActivity: new Date().toISOString(),
              },
            },
            update: {
              isEnabled: true,
              config: {
                ...cfg,
                connected: true,
                phoneNumber: phone,
                lastActivity: new Date().toISOString(),
              },
            },
          });

          // Self-heal: if the webhook was never configured for this
          // instance (older record), push it now. Idempotent.
          if (!cfg.webhookConfigured) {
            await setWebhookForAccount(req, session.accountId, {
              ...cfg,
              instanceName: instName,
            });
          }

          return NextResponse.json({ connected: true, phoneNumber: phone });
        }

        return NextResponse.json({ connected: false });
      } catch {
        return NextResponse.json({ connected: false });
      }
    }

    // ═══ DISCONNECT ═══
    if (action === "disconnect") {
      try {
        await fetch(`${baseUrl}/instance/logout/${instName}`, {
          method: "DELETE",
          headers: { apikey: apiKey },
        });
      } catch {
        // best effort
      }

      if (channel) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            isEnabled: false,
            config: { ...cfg, connected: false, phoneNumber: null },
          },
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("WhatsApp API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
