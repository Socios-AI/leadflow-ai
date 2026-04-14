// src/app/api/channels/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

/*
 * ENV VARS needed:
 * EVOLUTION_API_URL=https://evo.projetok.app.w8hub.com.br
 * EVOLUTION_API_KEY=your-global-api-key
 */

const EVO_URL = () => (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
const EVO_KEY = () => process.env.EVOLUTION_API_KEY || "";

function instanceName(accountId: string) {
  return `mdai-${accountId}`;
}

/** GET — current WhatsApp status */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
    });
    const cfg = (channel?.config as any) || {};

    // If channel says connected, verify with Evolution
    if (cfg.connected && EVO_URL()) {
      try {
        const r = await fetch(`${EVO_URL()}/instance/connectionState/${instanceName(session.accountId)}`, {
          headers: { apikey: EVO_KEY() },
        });
        const d = await r.json();
        const stillConnected = d.instance?.state === "open";
        if (!stillConnected && channel) {
          await prisma.channel.update({ where: { id: channel.id }, data: { config: { ...cfg, connected: false } } });
          return NextResponse.json({ connected: false, phoneNumber: null, lastActivity: null });
        }
      } catch {}
    }

    return NextResponse.json({
      connected: cfg.connected || false,
      phoneNumber: cfg.phoneNumber || null,
      lastActivity: cfg.lastActivity || null,
    });
  } catch {
    return NextResponse.json({ connected: false, phoneNumber: null, lastActivity: null });
  }
}

/** POST — connect, disconnect, status */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseUrl = EVO_URL();
  const apiKey = EVO_KEY();

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Evolution API não configurada no servidor" }, { status: 500 });
  }

  const body = await req.json();
  const { action } = body;
  const instName = instanceName(session.accountId);

  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
    });
    const cfg = (channel?.config as any) || {};

    // ═══ CONNECT ═══
    if (action === "connect") {

      // 1. Try to create instance (ignore if already exists)
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
          }),
        });

        // If instance was just created and returned QR
        if (createRes.ok) {
          const createData = await createRes.json();
          if (createData.qrcode?.base64) {
            // Save channel record
            await prisma.channel.upsert({
              where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
              create: { accountId: session.accountId, type: "WHATSAPP", isEnabled: true, config: { instanceName: instName, connected: false } },
              update: { isEnabled: true },
            });
            return NextResponse.json({ qrCode: createData.qrcode.base64 });
          }
        }
      } catch {}

      // 2. Instance already exists — get connection/QR
      try {
        const connectRes = await fetch(`${baseUrl}/instance/connect/${instName}`, {
          method: "GET",
          headers: { apikey: apiKey },
        });

        if (connectRes.ok) {
          const connectData = await connectRes.json();

          // Already connected
          if (connectData.instance?.status === "open" || connectData.instance?.state === "open") {
            const phone = connectData.instance?.wuid?.split("@")[0] ||
                          connectData.instance?.profilePictureUrl ? null : null;

            await prisma.channel.upsert({
              where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
              create: { accountId: session.accountId, type: "WHATSAPP", isEnabled: true, config: { instanceName: instName, connected: true, phoneNumber: phone, lastActivity: new Date().toISOString() } },
              update: { isEnabled: true, config: { ...cfg, instanceName: instName, connected: true, phoneNumber: phone, lastActivity: new Date().toISOString() } },
            });

            return NextResponse.json({ connected: true, phoneNumber: phone });
          }

          // Got QR code
          if (connectData.base64) {
            return NextResponse.json({ qrCode: connectData.base64 });
          }
        }
      } catch {}

      // 3. Try fetching QR directly
      try {
        const qrRes = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${instName}`, {
          headers: { apikey: apiKey },
        });
        if (qrRes.ok) {
          const instances = await qrRes.json();
          const inst = Array.isArray(instances) ? instances[0] : instances;
          if (inst?.instance?.status === "open") {
            const phone = inst.instance?.wuid?.split("@")[0] || null;
            await prisma.channel.upsert({
              where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
              create: { accountId: session.accountId, type: "WHATSAPP", isEnabled: true, config: { instanceName: instName, connected: true, phoneNumber: phone } },
              update: { isEnabled: true, config: { ...cfg, connected: true, phoneNumber: phone } },
            });
            return NextResponse.json({ connected: true, phoneNumber: phone });
          }
        }
      } catch {}

      return NextResponse.json({ error: "Não foi possível gerar o QR Code. Tente novamente." }, { status: 400 });
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
          // Try to get phone number
          let phone = cfg.phoneNumber;
          try {
            const fetchRes = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${instName}`, { headers: { apikey: apiKey } });
            const fetchData = await fetchRes.json();
            const inst = Array.isArray(fetchData) ? fetchData[0] : fetchData;
            phone = inst?.instance?.wuid?.split("@")[0] || phone;
          } catch {}

          await prisma.channel.upsert({
            where: { accountId_type: { accountId: session.accountId, type: "WHATSAPP" } },
            create: { accountId: session.accountId, type: "WHATSAPP", isEnabled: true, config: { instanceName: instName, connected: true, phoneNumber: phone, lastActivity: new Date().toISOString() } },
            update: { isEnabled: true, config: { ...cfg, connected: true, phoneNumber: phone, lastActivity: new Date().toISOString() } },
          });
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
      } catch {}

      if (channel) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { isEnabled: false, config: { ...cfg, connected: false, phoneNumber: null } },
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