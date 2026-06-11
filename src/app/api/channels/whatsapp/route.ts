// src/app/api/channels/whatsapp/route.ts
//
// Evolution API integration — MULTI-NUMBER.
//
// A tenant can connect SEVERAL WhatsApp numbers. Each number is one `channels`
// row (type WHATSAPP) whose config.instanceName is a distinct Evolution
// instance. The FIRST/legacy number keeps the historical name `mdai-<account>`
// so already-connected tenants are untouched; additional numbers get
// `mdai-<account>-<rand>`.
//
// GET  -> { channels: [{ id, label, connected, phoneNumber, ... }, ...] }
// POST -> actions take an optional `channelId` to target a specific number.
//         action "connect" with `new: true` creates a brand-new number.
//
// ENV: EVOLUTION_API_URL, EVOLUTION_API_KEY

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { configureEvolutionWebhook, webhookBodies } from "@/lib/channels/evolution-webhook";
import { appUrlFromRequest } from "@/lib/app-url";

const EVO_URL = () => (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
const EVO_KEY = () => process.env.EVOLUTION_API_KEY || "";

/** Legacy/primary instance name (kept so existing connections don't move). */
function legacyInstanceName(accountId: string) {
  return `mdai-${accountId}`;
}
/** Fresh instance name for an additional number. */
function newInstanceName(accountId: string) {
  return `mdai-${accountId}-${crypto.randomBytes(3).toString("hex")}`;
}

function webhookUrlFor(req: Request | NextRequest): string {
  return `${appUrlFromRequest(req)}/api/webhooks/evolution`;
}

// Prisma's JSON column input is `InputJsonValue`, which a typed interface like
// WaConfig isn't structurally assignable to (no index signature). Our configs
// are JSON-serializable at runtime, so cast at the write boundary.
const asJson = (c: unknown): Prisma.InputJsonValue => c as Prisma.InputJsonValue;

interface WaConfig {
  instanceName?: string;
  connected?: boolean;
  phoneNumber?: string | null;
  lastActivity?: string | null;
  webhookConfigured?: boolean;
  webhookConfiguredAt?: string | null;
  webhookSecret?: string;
  respondToFunnelLeadsOnly?: boolean;
}

type ChannelRow = { id: string; label: string | null; isEnabled: boolean; config: unknown };

/** All WhatsApp channels for the account, oldest first (primary first). */
async function listChannels(accountId: string) {
  return prisma.channel.findMany({
    where: { accountId, type: "WHATSAPP" },
    orderBy: { createdAt: "asc" },
  });
}

/** Resolve a target channel by id (scoped to account) or the primary (oldest). */
async function resolveChannel(accountId: string, channelId?: string): Promise<ChannelRow | null> {
  if (channelId) {
    return prisma.channel.findFirst({ where: { id: channelId, accountId, type: "WHATSAPP" } });
  }
  return prisma.channel.findFirst({
    where: { accountId, type: "WHATSAPP" },
    orderBy: { createdAt: "asc" },
  });
}

async function liveState(instance: string): Promise<{ connected: boolean; phone: string | null; available: boolean }> {
  if (!EVO_URL()) return { connected: false, phone: null, available: false };
  try {
    const r = await fetch(`${EVO_URL()}/instance/connectionState/${instance}`, {
      headers: { apikey: EVO_KEY() },
    });
    if (!r.ok) return { connected: false, phone: null, available: false };
    const d = await r.json();
    const open = d?.instance?.state === "open";
    let phone: string | null = null;
    if (open) {
      try {
        const ir = await fetch(`${EVO_URL()}/instance/fetchInstances?instanceName=${instance}`, {
          headers: { apikey: EVO_KEY() },
        });
        if (ir.ok) {
          const data = await ir.json();
          const inst = Array.isArray(data) ? data[0] : data;
          phone = inst?.instance?.wuid?.split("@")[0] || null;
        }
      } catch {
        /* phone optional */
      }
    }
    return { connected: open, phone, available: true };
  } catch {
    return { connected: false, phone: null, available: false };
  }
}

async function setWebhook(req: NextRequest, channelId: string, cfg: WaConfig, instance: string): Promise<void> {
  const baseUrl = EVO_URL();
  const apiKey = EVO_KEY();
  if (!baseUrl || !apiKey) return;
  const res = await configureEvolutionWebhook({
    baseUrl,
    apiKey,
    instanceName: instance,
    webhookUrl: webhookUrlFor(req),
    webhookSecret: cfg.webhookSecret,
  });
  if (res.ok) {
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        config: asJson({ ...cfg, instanceName: instance, webhookConfigured: true, webhookConfiguredAt: new Date().toISOString() }),
      },
    });
  }
}

/** GET — list every WhatsApp number with its live status. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await listChannels(session.accountId);
    const channels = await Promise.all(
      rows.map(async (ch) => {
        const cfg = (ch.config as WaConfig | null) || {};
        const instance = cfg.instanceName || legacyInstanceName(session.accountId);
        const live = await liveState(instance);

        // Reconcile cache when Evolution disagrees with what we stored.
        if (live.available && (live.connected !== !!cfg.connected || (live.connected && live.phone && live.phone !== cfg.phoneNumber))) {
          await prisma.channel
            .update({
              where: { id: ch.id },
              data: {
                config: asJson({
                  ...cfg,
                  instanceName: instance,
                  connected: live.connected,
                  phoneNumber: live.connected ? live.phone : null,
                  lastActivity: live.connected ? new Date().toISOString() : cfg.lastActivity,
                }),
              },
            })
            .catch(() => {});
        }

        return {
          id: ch.id,
          label: ch.label || null,
          instanceName: instance,
          connected: live.available ? live.connected : !!cfg.connected,
          phoneNumber: (live.available ? live.connected : !!cfg.connected) ? live.phone || cfg.phoneNumber || null : null,
          lastActivity: cfg.lastActivity || null,
          webhookConfigured: cfg.webhookConfigured || false,
          respondToFunnelLeadsOnly: cfg.respondToFunnelLeadsOnly !== false,
        };
      })
    );

    return NextResponse.json({ channels, webhookUrl: webhookUrlFor(req) });
  } catch {
    return NextResponse.json({ channels: [], webhookUrl: webhookUrlFor(req) });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseUrl = EVO_URL();
  const apiKey = EVO_KEY();
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Evolution API nao configurada no servidor" }, { status: 500 });
  }

  const body = await req.json();
  const { action } = body;
  const channelId: string | undefined = typeof body.channelId === "string" ? body.channelId : undefined;

  try {
    // ═══ CONNECT (reconnect existing OR add a new number) ═══
    if (action === "connect") {
      const isNew = body.new === true;
      let target = isNew ? null : await resolveChannel(session.accountId, channelId);
      const cfg = (target?.config as WaConfig | null) || {};

      // Decide the instance name: existing target keeps its name; a brand-new
      // number gets a fresh one; the very first connect for an account uses the
      // legacy name for backward-compat.
      let instance: string;
      if (target) {
        instance = cfg.instanceName || legacyInstanceName(session.accountId);
      } else if (isNew) {
        const existingCount = await prisma.channel.count({ where: { accountId: session.accountId, type: "WHATSAPP" } });
        instance = existingCount === 0 ? legacyInstanceName(session.accountId) : newInstanceName(session.accountId);
      } else {
        instance = legacyInstanceName(session.accountId);
      }

      const { wrapped: webhookWrapped } = webhookBodies({
        baseUrl,
        apiKey,
        instanceName: instance,
        webhookUrl: webhookUrlFor(req),
        webhookSecret: cfg.webhookSecret,
      });

      let qrCode: string | null = null;
      let created = false;

      // 1. Try to create the instance (idempotent on Evolution side).
      try {
        const createRes = await fetch(`${baseUrl}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({
            instanceName: instance,
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
          const createData = await createRes.json();
          if (createData.qrcode?.base64) {
            qrCode = createData.qrcode.base64;
            created = true;
          }
        }
      } catch {
        /* fall through */
      }

      // 2. Already exists → connect/QR or detect open.
      if (!qrCode) {
        try {
          const connectRes = await fetch(`${baseUrl}/instance/connect/${instance}`, {
            method: "GET",
            headers: { apikey: apiKey },
          });
          if (connectRes.ok) {
            const connectData = await connectRes.json();
            const isOpen = connectData.instance?.status === "open" || connectData.instance?.state === "open";
            if (isOpen) {
              const phone = connectData.instance?.wuid?.split("@")[0] || null;
              target = await upsertChannel(session.accountId, target?.id, {
                ...cfg,
                instanceName: instance,
                connected: true,
                phoneNumber: phone,
                lastActivity: new Date().toISOString(),
              });
              await setWebhook(req, target.id, { ...cfg, instanceName: instance }, instance);
              return NextResponse.json({ connected: true, phoneNumber: phone, channelId: target.id, webhookUrl: webhookUrlFor(req) });
            }
            if (connectData.base64) qrCode = connectData.base64;
          }
        } catch {
          /* fall through */
        }
      }

      if (qrCode) {
        // Persist (create-or-update) the row in the "pending pair" state.
        target = await upsertChannel(session.accountId, target?.id, {
          ...cfg,
          instanceName: instance,
          connected: false,
        });
        await setWebhook(req, target.id, { ...cfg, instanceName: instance }, instance);
        return NextResponse.json({ qrCode, created, channelId: target.id, webhookUrl: webhookUrlFor(req) });
      }

      return NextResponse.json({ error: "Nao foi possivel gerar o QR Code. Tente novamente." }, { status: 400 });
    }

    // For every other action we need a resolved target channel.
    const target = await resolveChannel(session.accountId, channelId);
    const cfg = (target?.config as WaConfig | null) || {};
    const instance = cfg.instanceName || legacyInstanceName(session.accountId);

    // ═══ STATUS ═══
    if (action === "status") {
      const live = await liveState(instance);
      if (live.connected && target) {
        await prisma.channel.update({
          where: { id: target.id },
          data: { isEnabled: true, config: asJson({ ...cfg, instanceName: instance, connected: true, phoneNumber: live.phone, lastActivity: new Date().toISOString() }) },
        });
        if (!cfg.webhookConfigured) await setWebhook(req, target.id, { ...cfg, instanceName: instance }, instance);
        return NextResponse.json({ connected: true, phoneNumber: live.phone, channelId: target.id });
      }
      return NextResponse.json({ connected: false, channelId: target?.id });
    }

    // ═══ RESTART ═══
    if (action === "restart") {
      const url = `${baseUrl}/instance/restart/${instance}`;
      const tried: { method: string; status: number; body?: string }[] = [];
      let ok = false;
      for (const method of ["PUT", "POST"] as const) {
        try {
          const r = await fetch(url, { method, headers: { "Content-Type": "application/json", apikey: apiKey } });
          const t = await r.text().catch(() => "");
          tried.push({ method, status: r.status, body: t.slice(0, 200) });
          if (r.ok) { ok = true; break; }
        } catch (err) {
          tried.push({ method, status: 0, body: err instanceof Error ? err.message : String(err) });
        }
      }
      return NextResponse.json({ ok, instanceName: instance, tried }, { status: ok ? 200 : 502 });
    }

    // ═══ CONFIGURE WEBHOOK (backfill) ═══
    if (action === "configureWebhook") {
      let result = await configureEvolutionWebhook({ baseUrl, apiKey, instanceName: instance, webhookUrl: webhookUrlFor(req), webhookSecret: cfg.webhookSecret });
      const instanceMissing = result.attempts.some((a) => a.status === 404 && /instance.*does not exist/i.test(a.detail || ""));
      let recreatedQr: string | null = null;
      if (!result.ok && instanceMissing) {
        const { wrapped: webhookWrapped } = webhookBodies({ baseUrl, apiKey, instanceName: instance, webhookUrl: webhookUrlFor(req), webhookSecret: cfg.webhookSecret });
        try {
          const createRes = await fetch(`${baseUrl}/instance/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify({ instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true, rejectCall: true, groupsIgnore: true, alwaysOnline: true, readMessages: false, readStatus: false, syncFullHistory: false, ...webhookWrapped }),
          });
          if (createRes.ok) {
            const createData = await createRes.json().catch(() => ({}));
            recreatedQr = createData?.qrcode?.base64 || null;
            result = await configureEvolutionWebhook({ baseUrl, apiKey, instanceName: instance, webhookUrl: webhookUrlFor(req), webhookSecret: cfg.webhookSecret });
          }
        } catch {
          /* fall through */
        }
      }
      if (result.ok && target) {
        await prisma.channel.update({
          where: { id: target.id },
          data: { config: asJson({ ...cfg, instanceName: instance, webhookConfigured: true, webhookConfiguredAt: new Date().toISOString(), ...(recreatedQr ? { connected: false } : {}) }) },
        });
        return NextResponse.json({ success: true, webhookUrl: webhookUrlFor(req), variant: result.variant, qrCode: recreatedQr, recreated: !!recreatedQr, channelId: target.id });
      }
      return NextResponse.json({ error: result.detail || "webhook_config_failed", instanceName: instance, attempts: result.attempts }, { status: 502 });
    }

    // ═══ SET FUNNEL-ONLY FLAG ═══
    if (action === "setRespondToFunnelLeadsOnly") {
      const value = body.value !== false;
      const saved = await upsertChannel(session.accountId, target?.id, { ...cfg, instanceName: instance, respondToFunnelLeadsOnly: value });
      return NextResponse.json({ success: true, respondToFunnelLeadsOnly: value, channelId: saved.id });
    }

    // ═══ DISCONNECT ═══
    if (action === "disconnect") {
      try {
        await fetch(`${baseUrl}/instance/logout/${instance}`, { method: "DELETE", headers: { apikey: apiKey } });
      } catch {
        /* best effort */
      }
      if (target) {
        await prisma.channel.update({ where: { id: target.id }, data: { isEnabled: false, config: asJson({ ...cfg, connected: false, phoneNumber: null }) } });
      }
      return NextResponse.json({ success: true });
    }

    // ═══ DELETE (remove a number entirely) ═══
    if (action === "delete") {
      try {
        await fetch(`${baseUrl}/instance/delete/${instance}`, { method: "DELETE", headers: { apikey: apiKey } });
      } catch {
        /* best effort */
      }
      if (target) await prisma.channel.delete({ where: { id: target.id } }).catch(() => {});
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("WhatsApp API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Create the channel row (when channelId is unknown) or update it by id. */
async function upsertChannel(accountId: string, channelId: string | undefined, config: WaConfig) {
  if (channelId) {
    return prisma.channel.update({ where: { id: channelId }, data: { isEnabled: true, config: asJson(config) } });
  }
  // No row yet for this instance — does one already exist with this instanceName?
  const existing = await prisma.channel.findFirst({
    where: { accountId, type: "WHATSAPP", config: { path: ["instanceName"], equals: config.instanceName || "" } },
  });
  if (existing) {
    return prisma.channel.update({ where: { id: existing.id }, data: { isEnabled: true, config: asJson(config) } });
  }
  return prisma.channel.create({ data: { accountId, type: "WHATSAPP", isEnabled: true, config: asJson(config) } });
}
