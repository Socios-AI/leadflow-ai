// src/app/api/channels/whatsapp/diagnose/route.ts
//
// End-to-end diagnostic for the WhatsApp send path. Returns the raw
// Evolution response (status + headers + body) for each step so the
// operator can see exactly where it fails:
//
//   1. fetchInstances    — does Evolution know about this instance?
//   2. connectionState   — is the WhatsApp socket "open" right now?
//   3. whatsappNumbers   — can Evolution validate a number?
//   4. sendText          — can it actually deliver a message?
//
// The destination number is the operator's own paired phone (when known)
// so the test message goes to themselves and doesn't bother a lead.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

const EVO_URL = () => (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
const EVO_KEY = () => process.env.EVOLUTION_API_KEY || "";

interface WaConfig {
  instanceName?: string;
  phoneNumber?: string | null;
}

interface Step {
  name: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  ms: number;
  bodySent?: unknown;
  responseRaw: string;
  responseJson?: unknown;
  note?: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { to?: string };

  const baseUrl = EVO_URL();
  const apiKey = EVO_KEY();
  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "missing_evolution_env", baseUrlSet: !!baseUrl, apiKeySet: !!apiKey },
      { status: 500 }
    );
  }

  const channel = await prisma.channel.findFirst({
    where: { accountId: session.accountId, type: "WHATSAPP" },
    orderBy: { createdAt: "asc" },
  });
  const cfg = (channel?.config as WaConfig | null) || {};
  const instance = cfg.instanceName || `mdai-${session.accountId}`;

  // Use the operator's own paired number as the test destination unless
  // they explicitly passed `to` in the body.
  const destinationRaw = (body.to || cfg.phoneNumber || "").toString();
  const destination = destinationRaw.replace(/[\s\-()]+/g, "").replace(/^\+/, "");

  const headers = { "Content-Type": "application/json", apikey: apiKey };
  const steps: Step[] = [];

  // STEP 1 — does the instance exist?
  steps.push(
    await runStep("fetchInstances", "GET", `${baseUrl}/instance/fetchInstances?instanceName=${instance}`, { headers })
  );

  // STEP 2 — what does Evolution think the connection state is?
  steps.push(
    await runStep("connectionState", "GET", `${baseUrl}/instance/connectionState/${instance}`, { headers })
  );

  // STEP 3 — number validation (only if we have a destination)
  if (destination) {
    const numberCheckBody = { numbers: [destination] };
    steps.push(
      await runStep(
        "whatsappNumbers",
        "POST",
        `${baseUrl}/chat/whatsappNumbers/${instance}`,
        { headers, body: JSON.stringify(numberCheckBody) },
        numberCheckBody
      )
    );
  } else {
    steps.push({
      name: "whatsappNumbers",
      method: "POST",
      url: `${baseUrl}/chat/whatsappNumbers/${instance}`,
      status: 0,
      ok: false,
      ms: 0,
      responseRaw: "",
      note: "skipped: no destination phone (channel has no paired number and no `to` was provided)",
    });
  }

  // STEP 4 — the real send. Only if we have a destination AND the
  // operator opted in (?send=true), so a diagnostic run doesn't surprise
  // them by actually messaging their phone.
  const url = new URL(req.url);
  const doSend = url.searchParams.get("send") === "true";
  if (destination && doSend) {
    const sendBody = {
      number: destination,
      text: "Diagnostico do MKT Digital. Se voce recebeu, o canal esta funcionando.",
    };
    steps.push(
      await runStep(
        "sendText",
        "POST",
        `${baseUrl}/message/sendText/${instance}`,
        { headers, body: JSON.stringify(sendBody) },
        sendBody
      )
    );
  } else {
    steps.push({
      name: "sendText",
      method: "POST",
      url: `${baseUrl}/message/sendText/${instance}`,
      status: 0,
      ok: false,
      ms: 0,
      responseRaw: "",
      note: destination
        ? "skipped: pass ?send=true to actually send a test message to your paired number"
        : "skipped: no destination phone",
    });
  }

  // Summary that the UI can color-code
  const verdict = summarize(steps);

  return NextResponse.json({
    instance,
    destination: destination || null,
    baseUrl,
    verdict,
    steps,
  });
}

async function runStep(
  name: string,
  method: string,
  url: string,
  init: RequestInit,
  bodySent?: unknown
): Promise<Step> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, ...init });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return {
      name,
      method,
      url,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - t0,
      bodySent,
      responseRaw: text.slice(0, 4000),
      responseJson: json,
    };
  } catch (err) {
    return {
      name,
      method,
      url,
      status: 0,
      ok: false,
      ms: Date.now() - t0,
      bodySent,
      responseRaw: err instanceof Error ? err.message : String(err),
      note: "network_error",
    };
  }
}

function summarize(steps: Step[]): {
  status: "healthy" | "partial" | "broken";
  hint: string;
} {
  const byName: Record<string, Step> = {};
  for (const s of steps) byName[s.name] = s;

  const conn = byName.connectionState;
  const send = byName.sendText;

  // Instance not found
  const fetch = byName.fetchInstances;
  if (fetch && fetch.status === 404) {
    return {
      status: "broken",
      hint: "A instancia nao existe na Evolution. Vai em Channels -> WhatsApp e clica em Reconectar (vai recriar e mostrar um QR).",
    };
  }

  // 401/403 anywhere = bad API key
  if (steps.some((s) => s.status === 401 || s.status === 403)) {
    return {
      status: "broken",
      hint: "Evolution recusou a API key. Verifique a env var EVOLUTION_API_KEY no Coolify.",
    };
  }

  // Connection isn't open
  if (conn) {
    const state = (conn.responseJson as { instance?: { state?: string } } | undefined)?.instance?.state;
    if (state && state !== "open") {
      return {
        status: "broken",
        hint: `Evolution diz que a conexao esta '${state}'. Reconecte o WhatsApp escaneando o QR de novo.`,
      };
    }
  }

  // Send attempted and failed
  if (send && send.status >= 500) {
    return {
      status: "broken",
      hint: "Evolution aceitou o request mas Baileys nao conseguiu enviar (Connection Closed). Clique em Reiniciar no card de WhatsApp e tente de novo. Se persistir, o numero pareado foi deslogado no celular.",
    };
  }

  // Send succeeded
  if (send && send.ok) {
    return { status: "healthy", hint: "Tudo certo, mensagem enviada com sucesso." };
  }

  // Connection ok but send wasn't tested
  if (conn && conn.ok) {
    return {
      status: "partial",
      hint: "Conexao OK. Adicione ?send=true na URL pra disparar uma mensagem de teste real ao seu numero.",
    };
  }

  return { status: "broken", hint: "Nao foi possivel determinar o estado, veja os steps acima." };
}
