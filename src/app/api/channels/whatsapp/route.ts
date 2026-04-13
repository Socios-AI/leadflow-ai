// src/app/api/channels/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!;

async function evoFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${EVOLUTION_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_KEY,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * POST /api/channels/whatsapp
 * Actions: create-instance, get-qr, check-status, disconnect
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "create-instance":
        return handleCreateInstance(session.accountId, body);
      case "get-qr":
        return handleGetQR(session.accountId);
      case "check-status":
        return handleCheckStatus(session.accountId);
      case "disconnect":
        return handleDisconnect(session.accountId);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("WhatsApp channel error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Creates a new Evolution instance for this account.
 * - Instance name = nexus_{accountId}
 * - Auto-configures webhook pointing to our Evolution webhook receiver
 * - Enables messages.upsert event
 */
async function handleCreateInstance(accountId: string, body: any) {
  const instanceName = `nexus_${accountId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
  const phoneNumber = body.phoneNumber || "";

  // Build the webhook URL that Evolution will call when messages arrive
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/evolution`;

  // 1. Create instance with webhook configured
  const createResult = await evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      // Webhook configuration — built into instance creation
      webhook: {
        url: webhookUrl,
        byEvents: true,
        base64: false,
        headers: {
          "x-account-id": accountId,
        },
        events: [
          "messages.upsert",
        ],
      },
    }),
  });

  if (!createResult.ok) {
    // Instance might already exist — try to fetch it
    if (createResult.data?.error?.includes("already") || createResult.status === 409) {
      // Instance exists, just update webhook
      await evoFetch(`/webhook/set/${instanceName}`, {
        method: "POST",
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: true,
          webhook_base64: false,
          events: ["messages.upsert"],
        }),
      });
    } else {
      return NextResponse.json(
        { error: "Failed to create instance", details: createResult.data },
        { status: 400 }
      );
    }
  } else {
    // 2. Also set webhook explicitly (some Evolution versions need this separately)
    await evoFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: true,
        webhook_base64: false,
        events: ["messages.upsert"],
      }),
    });
  }

  // 3. Save config to database
  await prisma.channel.upsert({
    where: { accountId_type: { accountId, type: "WHATSAPP" } },
    create: {
      accountId,
      type: "WHATSAPP",
      isEnabled: false, // Will be enabled after QR scan
      config: {
        instanceName,
        evolutionApiUrl: EVOLUTION_URL,
        evolutionApiKey: EVOLUTION_KEY,
        phoneNumber,
        webhookUrl,
        status: "pending",
      },
    },
    update: {
      config: {
        instanceName,
        evolutionApiUrl: EVOLUTION_URL,
        evolutionApiKey: EVOLUTION_KEY,
        phoneNumber,
        webhookUrl,
        status: "pending",
      },
    },
  });

  // 4. Get QR code
  const qrResult = await evoFetch(`/instance/connect/${instanceName}`);

  return NextResponse.json({
    success: true,
    instanceName,
    qrCode: qrResult.data?.base64 || qrResult.data?.qrcode?.base64 || null,
    pairingCode: qrResult.data?.pairingCode || null,
    webhookUrl,
  });
}

/**
 * Gets the current QR code for scanning.
 */
async function handleGetQR(accountId: string) {
  const channel = await prisma.channel.findUnique({
    where: { accountId_type: { accountId, type: "WHATSAPP" } },
  });

  if (!channel) {
    return NextResponse.json({ error: "No WhatsApp instance" }, { status: 404 });
  }

  const cfg = channel.config as Record<string, string>;
  const result = await evoFetch(`/instance/connect/${cfg.instanceName}`);

  return NextResponse.json({
    qrCode: result.data?.base64 || result.data?.qrcode?.base64 || null,
    pairingCode: result.data?.pairingCode || null,
  });
}

/**
 * Checks if WhatsApp is connected (QR was scanned).
 */
async function handleCheckStatus(accountId: string) {
  const channel = await prisma.channel.findUnique({
    where: { accountId_type: { accountId, type: "WHATSAPP" } },
  });

  if (!channel) {
    return NextResponse.json({ connected: false, status: "not_configured" });
  }

  const cfg = channel.config as Record<string, string>;
  const result = await evoFetch(`/instance/connectionState/${cfg.instanceName}`);

  const state = result.data?.instance?.state || result.data?.state || "disconnected";
  const connected = state === "open";

  // Auto-enable channel when connected
  if (connected && !channel.isEnabled) {
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        isEnabled: true,
        config: { ...cfg, status: "connected" },
      },
    });
  }

  return NextResponse.json({
    connected,
    status: state,
    instanceName: cfg.instanceName,
    phoneNumber: cfg.phoneNumber,
  });
}

/**
 * Disconnects and removes the instance.
 */
async function handleDisconnect(accountId: string) {
  const channel = await prisma.channel.findUnique({
    where: { accountId_type: { accountId, type: "WHATSAPP" } },
  });

  if (!channel) {
    return NextResponse.json({ success: true });
  }

  const cfg = channel.config as Record<string, string>;

  // Logout + delete instance
  await evoFetch(`/instance/logout/${cfg.instanceName}`, { method: "DELETE" });
  await evoFetch(`/instance/delete/${cfg.instanceName}`, { method: "DELETE" });

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      isEnabled: false,
      config: { ...cfg, status: "disconnected" },
    },
  });

  return NextResponse.json({ success: true });
}