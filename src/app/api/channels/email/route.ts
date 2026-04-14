// src/app/api/channels/email/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
    });
    const cfg = (channel?.config as any) || {};
    return NextResponse.json({
      resendApiKey: cfg.resendApiKey || "",
      fromName: cfg.fromName || "",
      fromEmail: cfg.fromEmail || "",
      domain: cfg.domain || "",
      enabled: channel?.isEnabled || false,
      verified: cfg.verified || false,
    });
  } catch {
    return NextResponse.json({ resendApiKey: "", fromName: "", fromEmail: "", domain: "", enabled: false, verified: false });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { action } = body;

  try {
    const channel = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
    });
    const cfg = (channel?.config as any) || {};

    if (action === "save") {
      await prisma.channel.upsert({
        where: { accountId_type: { accountId: session.accountId, type: "EMAIL" } },
        create: {
          accountId: session.accountId, type: "EMAIL", isEnabled: true,
          config: { resendApiKey: body.resendApiKey, fromName: body.fromName, fromEmail: body.fromEmail, domain: body.domain },
        },
        update: {
          isEnabled: true,
          config: { resendApiKey: body.resendApiKey, fromName: body.fromName, fromEmail: body.fromEmail, domain: body.domain },
        },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "test") {
      const apiKey = cfg.resendApiKey;
      if (!apiKey) return NextResponse.json({ error: "API Key não configurada" }, { status: 400 });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${cfg.fromName || "Marketing Digital AI"} <${cfg.fromEmail || "onboarding@resend.dev"}>`,
          to: [body.to],
          subject: "Teste de Email — Marketing Digital AI",
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:40px 20px"><h2 style="margin:0 0 16px">Email funcionando!</h2><p style="color:#666;line-height:1.6">Este é um email de teste do Marketing Digital AI. Se você recebeu, a configuração está correta.</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:12px;color:#999">Marketing Digital AI · Vendas por Inteligência Artificial</p></div>`,
        }),
      });
      if (r.ok) return NextResponse.json({ success: true });
      const err = await r.text();
      return NextResponse.json({ error: `Erro Resend: ${err}` }, { status: 400 });
    }

    if (action === "disable") {
      if (channel) await prisma.channel.update({ where: { id: channel.id }, data: { isEnabled: false } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) { console.error("Email error:", e.message); return NextResponse.json({ error: e.message }, { status: 500 }); }
}