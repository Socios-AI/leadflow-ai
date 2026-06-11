// src/app/api/channels/email/route.ts
//
// Email channel configuration (Resend). Stores credentials, an inbound
// webhook secret and the inbound URL for the tenant to wire up in their
// mail provider (Resend Inbound, Postmark, Mailgun, or a forwarder).
//
// Credential leak rules: GET never returns the raw Resend API key. The UI
// gets a masked preview only. On save, if the form sends a masked value
// back, we keep the stored secret untouched so the user can edit other
// fields without re-typing the key.
//
// On the first save we ALWAYS generate an `inboundSecret`. The inbound
// webhook refuses requests that don't carry it as `x-webhook-secret`,
// so the URL alone is not enough to pretend to be a lead.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { platformEmailDomain } from "@/lib/channels/email";

type EmailConfig = {
  /** "platform" = uses our Resend + mkt.sociosai.com. "custom" = tenant's own */
  mode?: "platform" | "custom";
  /** Platform mode: localpart for sender ("vendas" -> vendas@mkt.sociosai.com) */
  alias?: string;
  resendApiKey?: string;
  fromName?: string;
  fromEmail?: string;
  domain?: string;
  verified?: boolean;
  inboundEnabled?: boolean;
  inboundSecret?: string;
};

const MASK = "••••••••";
// Alias rules: 3-30 chars, lowercase letters/digits/hyphens, must start with
// a letter, must not end with hyphen. Mirrors what most providers accept
// as a stable localpart and what reads well in a from header.
const ALIAS_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;
// Reserved aliases that we never let a tenant claim, to keep system mail
// (transactional notifications, support) distinguishable.
const RESERVED_ALIASES = new Set([
  "admin", "administrator", "root", "support", "help", "info", "contact",
  "noreply", "no-reply", "postmaster", "abuse", "security", "billing",
  "system", "team", "ai", "mkt", "platform", "owner", "hello",
]);

function maskApiKey(s?: string): string {
  if (!s) return "";
  if (s.length < 8) return MASK;
  return `${MASK}${s.slice(-4)}`;
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "https://mktdigital.sociosai.com"
  );
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidDomain(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(s);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const channel = await prisma.channel.findFirst({
      where: { accountId: session.accountId, type: "EMAIL" },
      orderBy: { createdAt: "asc" },
    });
    const cfg = (channel?.config as EmailConfig | null) || {};
    // Default new accounts to platform mode so the email channel works
    // out of the box without asking for a Resend key.
    const mode = cfg.mode === "custom" ? "custom" : "platform";
    return NextResponse.json({
      mode,
      alias: cfg.alias || "",
      platformDomain: platformEmailDomain(),
      // Public, non-sensitive fields
      fromName: cfg.fromName || "",
      fromEmail: cfg.fromEmail || "",
      domain: cfg.domain || "",
      enabled: channel?.isEnabled || false,
      verified: cfg.verified || false,
      inboundEnabled: cfg.inboundEnabled !== false,
      inboundSecret: cfg.inboundSecret || "",
      inboundWebhookUrl: `${appUrl()}/api/webhooks/email/${session.accountId}`,
      // Masked preview, never the raw value
      resendApiKey: cfg.resendApiKey ? maskApiKey(cfg.resendApiKey) : "",
      hasResendApiKey: !!cfg.resendApiKey,
    });
  } catch {
    return NextResponse.json({
      mode: "platform",
      alias: "",
      platformDomain: platformEmailDomain(),
      fromName: "",
      fromEmail: "",
      domain: "",
      enabled: false,
      verified: false,
      inboundEnabled: true,
      inboundSecret: "",
      inboundWebhookUrl: `${appUrl()}/api/webhooks/email/${session.accountId}`,
      resendApiKey: "",
      hasResendApiKey: false,
    });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { action } = body;

  try {
    const channel = await prisma.channel.findFirst({
      where: { accountId: session.accountId, type: "EMAIL" },
      orderBy: { createdAt: "asc" },
    });
    const cfg = (channel?.config as EmailConfig | null) || {};

    if (action === "save") {
      const mode = body.mode === "custom" ? "custom" : "platform";
      const fromName = String(body.fromName || "").trim();
      if (!fromName) {
        return NextResponse.json({ error: "missing_from_name" }, { status: 400 });
      }

      let nextCfg: EmailConfig;

      if (mode === "platform") {
        // ── Platform mode: tenant claims an alias on our domain ──
        const alias = String(body.alias || "").trim().toLowerCase();
        if (!ALIAS_RE.test(alias)) {
          return NextResponse.json({ error: "invalid_alias_format" }, { status: 400 });
        }
        if (RESERVED_ALIASES.has(alias)) {
          return NextResponse.json({ error: "alias_reserved" }, { status: 400 });
        }
        // Uniqueness: no two accounts can claim the same alias on the
        // platform domain. JSON path-equals lets us index-skip safely.
        const conflict = await prisma.channel.findFirst({
          where: {
            type: "EMAIL",
            NOT: { accountId: session.accountId },
            AND: [
              { config: { path: ["mode"], equals: "platform" } },
              { config: { path: ["alias"], equals: alias } },
            ],
          },
          select: { id: true },
        });
        if (conflict) {
          return NextResponse.json({ error: "alias_taken" }, { status: 409 });
        }
        nextCfg = {
          mode: "platform",
          alias,
          fromName,
          // Wipe custom-mode fields so they don't leak into the next send.
          resendApiKey: undefined,
          domain: undefined,
          fromEmail: `${alias}@${platformEmailDomain()}`,
          verified: true,
          inboundEnabled: body.inboundEnabled !== false,
          inboundSecret: cfg.inboundSecret || randomBytes(24).toString("hex"),
        };
      } else {
        // ── Custom mode: tenant brings their Resend key + domain ──
        const submittedKey = String(body.resendApiKey || "");
        const keepStoredKey =
          submittedKey === "" || submittedKey.startsWith(MASK);

        const fromEmail = String(body.fromEmail || "").trim().toLowerCase();
        const domain = String(body.domain || "").trim().toLowerCase();

        if (!isValidEmail(fromEmail)) {
          return NextResponse.json({ error: "invalid_from_email" }, { status: 400 });
        }
        if (domain && !isValidDomain(domain)) {
          return NextResponse.json({ error: "invalid_domain" }, { status: 400 });
        }
        if (domain && !fromEmail.endsWith(`@${domain}`)) {
          return NextResponse.json(
            { error: "sender_domain_mismatch" },
            { status: 400 }
          );
        }
        // Block tenants from setting our own domain as their "custom" one.
        if (
          (domain && domain === platformEmailDomain()) ||
          fromEmail.endsWith(`@${platformEmailDomain()}`)
        ) {
          return NextResponse.json(
            { error: "use_platform_mode_for_our_domain" },
            { status: 400 }
          );
        }
        const finalKey = keepStoredKey ? cfg.resendApiKey : submittedKey;
        if (!finalKey) {
          return NextResponse.json(
            { error: "missing_api_key" },
            { status: 400 }
          );
        }
        nextCfg = {
          mode: "custom",
          alias: undefined,
          resendApiKey: finalKey,
          fromName,
          fromEmail,
          domain,
          verified: cfg.verified || false,
          inboundEnabled: body.inboundEnabled !== false,
          inboundSecret: cfg.inboundSecret || randomBytes(24).toString("hex"),
        };
      }

      if (channel) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { isEnabled: true, config: nextCfg },
        });
      } else {
        await prisma.channel.create({
          data: { accountId: session.accountId, type: "EMAIL", isEnabled: true, config: nextCfg },
        });
      }
      return NextResponse.json({ success: true, mode: nextCfg.mode });
    }

    // ── Alias availability check (used by the UI as the user types) ──
    if (action === "check_alias") {
      const alias = String(body.alias || "").trim().toLowerCase();
      if (!ALIAS_RE.test(alias)) {
        return NextResponse.json({ ok: false, reason: "invalid_format" });
      }
      if (RESERVED_ALIASES.has(alias)) {
        return NextResponse.json({ ok: false, reason: "reserved" });
      }
      const conflict = await prisma.channel.findFirst({
        where: {
          type: "EMAIL",
          NOT: { accountId: session.accountId },
          AND: [
            { config: { path: ["mode"], equals: "platform" } },
            { config: { path: ["alias"], equals: alias } },
          ],
        },
        select: { id: true },
      });
      return NextResponse.json({
        ok: !conflict,
        reason: conflict ? "taken" : undefined,
      });
    }

    if (action === "rotate_inbound_secret") {
      const newSecret = randomBytes(24).toString("hex");
      const nextCfg: EmailConfig = { ...cfg, inboundSecret: newSecret };
      if (channel) {
        await prisma.channel.update({ where: { id: channel.id }, data: { config: nextCfg } });
      } else {
        await prisma.channel.create({
          data: { accountId: session.accountId, type: "EMAIL", isEnabled: false, config: nextCfg },
        });
      }
      return NextResponse.json({ success: true, inboundSecret: newSecret });
    }

    if (action === "test") {
      const to = String(body.to || "").trim().toLowerCase();
      if (!isValidEmail(to)) {
        return NextResponse.json({ error: "invalid_to_email" }, { status: 400 });
      }
      // Pull mode + credentials from the stored config (we already saved
      // before getting here in the normal flow).
      const mode = cfg.mode === "custom" ? "custom" : "platform";
      let apiKey: string | undefined;
      let fromEmail: string;
      if (mode === "platform") {
        apiKey = process.env.PLATFORM_RESEND_API_KEY || process.env.RESEND_API_KEY;
        if (!apiKey) {
          return NextResponse.json(
            { error: "platform_resend_not_configured" },
            { status: 500 }
          );
        }
        const alias = cfg.alias;
        if (!alias) {
          return NextResponse.json({ error: "missing_platform_alias" }, { status: 400 });
        }
        fromEmail = `${alias}@${platformEmailDomain()}`;
      } else {
        apiKey = cfg.resendApiKey;
        if (!apiKey) {
          return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
        }
        fromEmail = cfg.fromEmail || `noreply@${cfg.domain || "resend.dev"}`;
      }

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${cfg.fromName || "MKT Digital"} <${fromEmail}>`,
          to: [to],
          subject: "Teste de envio",
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#0f172a"><h2 style="margin:0 0 12px;font-weight:600">Conexao confirmada</h2><p style="color:#475569;line-height:1.6;font-size:14px">Este e um email de teste do canal de email do sistema. Se voce recebeu, a configuracao esta correta.</p></div>`,
        }),
      });
      if (r.ok) return NextResponse.json({ success: true });
      const err = await r.text();
      return NextResponse.json({ error: friendlyResendError(err) }, { status: 400 });
    }

    if (action === "disable") {
      if (channel) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { isEnabled: false },
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Email channel error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function friendlyResendError(raw: string): string {
  const text = raw || "";
  if (/domain.*not.*verified|verify.*domain/i.test(text))
    return "Dominio nao verificado em Resend";
  if (/invalid.*api.*key|unauthorized/i.test(text))
    return "API key do Resend invalida";
  if (/rate.*limit/i.test(text)) return "Limite de envio do Resend excedido";
  if (/recipient/i.test(text)) return "Destinatario rejeitado";
  return text.slice(0, 200);
}
