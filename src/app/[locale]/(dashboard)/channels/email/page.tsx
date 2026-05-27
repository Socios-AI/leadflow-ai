// src/app/[locale]/(dashboard)/channels/email/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Mail, Loader2, CheckCircle, ArrowLeft, Eye, EyeOff,
  Send, AlertCircle, ExternalLink, X, Wifi, WifiOff, Copy, Check, Inbox, RefreshCw,
  Globe, Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "platform" | "custom";

interface EmailConfig {
  mode: Mode;
  alias: string;
  platformDomain: string;
  resendApiKey: string;
  fromName: string;
  fromEmail: string;
  domain: string;
  enabled: boolean;
  verified: boolean;
  inboundEnabled: boolean;
  inboundSecret: string;
  inboundWebhookUrl: string;
}

export default function EmailChannelPage() {
  const t = useTranslations("channels.email");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<EmailConfig>({
    mode: "platform",
    alias: "",
    platformDomain: "mkt.sociosai.com",
    resendApiKey: "",
    fromName: "",
    fromEmail: "",
    domain: "",
    enabled: false,
    verified: false,
    inboundEnabled: true,
    inboundSecret: "",
    inboundWebhookUrl: "",
  });
  // Real-time alias check state. ok=null means "haven't checked yet".
  const [aliasCheck, setAliasCheck] = useState<{
    ok: boolean | null;
    reason?: string;
    checking: boolean;
  }>({ ok: null, checking: false });

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch("/api/channels/email");
      if (r.ok) {
        const d = await r.json();
        setConfig(d);
      }
    } catch {
      // silent; UI shows disabled state
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    // Per-mode validation, so the error message is specific to what's missing.
    if (!config.fromName) {
      showToast(t("fillRequired"), false);
      return;
    }
    if (config.mode === "platform") {
      if (!config.alias) {
        showToast(t("aliasRequired"), false);
        return;
      }
      if (aliasCheck.ok === false) {
        // Block save if the alias is invalid/taken/reserved.
        showToast(t(aliasCheck.reason === "taken" ? "aliasTaken" : "aliasInvalid"), false);
        return;
      }
    } else {
      if (!config.resendApiKey || !config.fromEmail) {
        showToast(t("fillRequired"), false);
        return;
      }
    }
    setSaving(true);
    try {
      const r = await fetch("/api/channels/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...config }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast(t("emailSaved"), true);
        setConfig((prev) => ({ ...prev, enabled: true }));
      } else {
        // Surface specific API errors when they map to a user-fixable issue.
        const errKey =
          d.error === "alias_taken" ? "aliasTaken" :
          d.error === "invalid_alias_format" ? "aliasInvalid" :
          d.error === "alias_reserved" ? "aliasReserved" :
          d.error === "use_platform_mode_for_our_domain" ? "usePlatformInstead" :
          "saveError";
        showToast(t(errKey), false);
      }
    } catch {
      showToast(t("connectionError"), false);
    }
    setSaving(false);
  }

  /**
   * Debounced alias availability check. Runs while the user types so we
   * can show "available" / "taken" / "reserved" without making them hit
   * Save first.
   */
  useEffect(() => {
    if (config.mode !== "platform") return;
    const alias = config.alias.trim().toLowerCase();
    if (!alias) {
      setAliasCheck({ ok: null, checking: false });
      return;
    }
    setAliasCheck((s) => ({ ...s, checking: true }));
    const id = setTimeout(async () => {
      try {
        const r = await fetch("/api/channels/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check_alias", alias }),
        });
        const d = await r.json();
        setAliasCheck({ ok: !!d.ok, reason: d.reason, checking: false });
      } catch {
        setAliasCheck({ ok: null, checking: false });
      }
    }, 350);
    return () => clearTimeout(id);
  }, [config.alias, config.mode]);

  async function handleTest() {
    if (!testEmail.trim()) {
      showToast(t("enterTestEmail"), false);
      return;
    }
    setTesting(true);
    try {
      const r = await fetch("/api/channels/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", to: testEmail }),
      });
      const d = await r.json();
      if (d.success) {
        showToast(`${t("testSent")} ${testEmail}`, true);
        setShowTestModal(false);
        setTestEmail("");
      } else showToast(d.error || t("testError"), false);
    } catch {
      showToast(t("connectionError"), false);
    }
    setTesting(false);
  }

  async function handleDisable() {
    if (!confirm(t("disableConfirm"))) return;
    await fetch("/api/channels/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable" }),
    });
    setConfig((prev) => ({ ...prev, enabled: false }));
    showToast(t("disabled"), true);
  }

  async function copyWebhook() {
    if (!config.inboundWebhookUrl) return;
    try {
      await navigator.clipboard.writeText(config.inboundWebhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast(tc("copyFailed"), false);
    }
  }

  async function rotateSecret() {
    if (!confirm(t("rotateSecretConfirm"))) return;
    const r = await fetch("/api/channels/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate_inbound_secret" }),
    });
    if (r.ok) {
      const d = await r.json();
      setConfig((prev) => ({ ...prev, inboundSecret: d.inboundSecret }));
      showToast(t("secretRotated"), true);
    } else showToast(t("error"), false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
            toast.ok
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-space-grotesk text-lg font-bold text-foreground tracking-tight">
              {t("title")}
            </h1>
            <p className="text-[11px] text-muted-foreground font-dm-sans">{t("subtitle")}</p>
          </div>
        </div>
        {config.enabled && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTestModal(true)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground border border-border hover:bg-muted cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" />
              {t("sendTest")}
            </button>
            <button
              onClick={handleDisable}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/5 cursor-pointer transition-colors"
            >
              {t("disable")}
            </button>
          </div>
        )}
      </div>

      <div
        className={cn(
          "rounded-2xl border p-4 flex items-center gap-3",
          config.enabled
            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
            : "border-border bg-card"
        )}
      >
        {config.enabled ? (
          <Wifi className="w-5 h-5 text-emerald-500" />
        ) : (
          <WifiOff className="w-5 h-5 text-muted-foreground/40" />
        )}
        <div>
          <p className="text-[13px] font-semibold text-foreground">
            {config.enabled ? t("active") : t("inactive")}
          </p>
          {config.enabled && config.fromEmail && (
            <p className="text-[11px] text-emerald-500 mt-0.5">
              {config.fromName} &lt;{config.fromEmail}&gt;
            </p>
          )}
        </div>
      </div>

      {/* Mode tabs: platform domain (free, instant) vs own domain (advanced) */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-2 border-b border-border/50">
          <ModeTab
            active={config.mode === "platform"}
            icon={Globe}
            title={t("modePlatformTitle")}
            subtitle={t("modePlatformSubtitle")}
            onClick={() => setConfig((c) => ({ ...c, mode: "platform" }))}
          />
          <ModeTab
            active={config.mode === "custom"}
            icon={Server}
            title={t("modeCustomTitle")}
            subtitle={t("modeCustomSubtitle")}
            onClick={() => setConfig((c) => ({ ...c, mode: "custom" }))}
          />
        </div>

        {config.mode === "platform" ? (
          <div className="px-5 py-5 space-y-4">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {t("platformDesc", { domain: config.platformDomain })}
            </p>
            <Field label={t("senderName")} required>
              <input
                value={config.fromName}
                onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                placeholder={t("senderNamePlaceholder")}
                className="field"
              />
            </Field>
            <Field label={t("aliasLabel")} hint={t("aliasHint")} required>
              <div className="flex items-stretch h-10 rounded-xl bg-muted border border-transparent focus-within:border-ring/30 overflow-hidden">
                <input
                  value={config.alias}
                  onChange={(e) =>
                    setConfig({ ...config, alias: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                  }
                  placeholder="vendas"
                  className="flex-1 px-3 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40 font-dm-sans"
                  maxLength={30}
                />
                <span className="px-3 flex items-center text-[13px] text-muted-foreground border-l border-border/60 bg-card/40 font-mono">
                  @{config.platformDomain}
                </span>
              </div>
              {config.alias && (
                <p
                  className={cn(
                    "text-[11px] mt-1.5 flex items-center gap-1.5",
                    aliasCheck.checking
                      ? "text-muted-foreground/60"
                      : aliasCheck.ok === true
                        ? "text-emerald-500"
                        : aliasCheck.ok === false
                          ? "text-rose-500"
                          : "text-muted-foreground/60"
                  )}
                >
                  {aliasCheck.checking ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> {t("aliasChecking")}
                    </>
                  ) : aliasCheck.ok === true ? (
                    <>
                      <Check className="w-3 h-3" /> {t("aliasAvailable", { addr: `${config.alias}@${config.platformDomain}` })}
                    </>
                  ) : aliasCheck.ok === false ? (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      {aliasCheck.reason === "taken"
                        ? t("aliasTaken")
                        : aliasCheck.reason === "reserved"
                          ? t("aliasReserved")
                          : t("aliasInvalid")}
                    </>
                  ) : null}
                </p>
              )}
            </Field>
            <button
              onClick={handleSave}
              disabled={saving || aliasCheck.checking || aliasCheck.ok === false}
              className="w-full h-10 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-transform active:scale-[0.99]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? t("saving") : t("saveConfig")}
            </button>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {t("customDesc")}
            </p>
            <Field label={t("apiKey")} required>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={config.resendApiKey}
                  onChange={(e) => setConfig({ ...config, resendApiKey: e.target.value })}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="field pr-10"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("senderName")} required>
                <input
                  value={config.fromName}
                  onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                  placeholder={t("senderNamePlaceholder")}
                  className="field"
                />
              </Field>
              <Field label={t("senderEmail")} required>
                <input
                  value={config.fromEmail}
                  onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                  placeholder="contato@dominio.com"
                  className="field"
                />
              </Field>
            </div>
            <Field label={t("domain")} hint={t("domainHint")}>
              <input
                value={config.domain}
                onChange={(e) => setConfig({ ...config, domain: e.target.value })}
                placeholder="dominio.com"
                className="field"
              />
            </Field>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-10 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-transform active:scale-[0.99]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? t("saving") : t("saveConfig")}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">
                {t("inboundTitle")}
              </h2>
              <p className="text-[11px] text-muted-foreground font-dm-sans mt-0.5">
                {t("inboundDesc")}
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[11px] font-medium text-muted-foreground">
              {config.inboundEnabled ? tc("enabled") : tc("disabled")}
            </span>
            <input
              type="checkbox"
              checked={config.inboundEnabled}
              onChange={(e) =>
                setConfig({ ...config, inboundEnabled: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted rounded-full peer-checked:bg-primary/80 relative transition-colors">
              <div
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform",
                  config.inboundEnabled && "translate-x-4"
                )}
              />
            </div>
          </label>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            {t("inboundInstructions")}
          </p>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block font-dm-sans">
              {t("inboundUrlLabel")}
            </label>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={config.inboundWebhookUrl}
                className="field font-mono text-[11.5px] flex-1"
              />
              <button
                onClick={copyWebhook}
                className="h-10 px-3 rounded-xl border border-border text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? tc("copied") : tc("copy")}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block font-dm-sans">
              {t("inboundSecretLabel")}
            </label>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={config.inboundSecret || tc("notGenerated")}
                className="field font-mono text-[11.5px] flex-1"
              />
              <button
                onClick={rotateSecret}
                className="h-10 px-3 rounded-xl border border-border text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {tc("rotate")}
              </button>
            </div>
            <p className="text-[10.5px] text-muted-foreground/70 mt-1.5">
              {t("inboundSecretHint")}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 rounded-xl border border-border/30 bg-muted/20 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] text-muted-foreground leading-relaxed font-dm-sans">
            {t("helpText")}
          </p>
          <a
            href="https://resend.com/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
          >
            {t("docsLink")} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {showTestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowTestModal(false)}
        >
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-space-grotesk text-[14px] font-semibold">
                {t("testEmail")}
              </h3>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Field label={t("testTo")}>
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="email@example.com"
                className="field"
                autoFocus
              />
            </Field>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowTestModal(false)}
                className="flex-1 h-9 rounded-xl border border-border text-[12px] font-medium text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex-1 h-9 rounded-xl btn-brand text-[12px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {testing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {tc("send")}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .field {
          width: 100%;
          height: 40px;
          padding: 0 16px;
          border-radius: 12px;
          background: hsl(var(--muted));
          border: 1px solid transparent;
          font-size: 13px;
          color: hsl(var(--foreground));
          font-family: var(--font-dm-sans);
        }
        .field:focus {
          outline: none;
          border-color: hsl(var(--ring) / 0.3);
        }
        .field::placeholder {
          color: hsl(var(--muted-foreground) / 0.4);
        }
      `}</style>
    </div>
  );
}

function ModeTab({
  active,
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-5 py-4 text-left transition-colors cursor-pointer",
        active
          ? "bg-primary/[0.06] border-b-2 border-primary"
          : "bg-card hover:bg-muted/40 border-b-2 border-transparent"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground/60")} />
        <span className={cn("text-[13px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
          {title}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-1 leading-snug">
        {subtitle}
      </p>
    </button>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block font-dm-sans">
        {label} {required && <span className="text-red-400">*</span>}
        {hint && (
          <span className="text-muted-foreground/40 normal-case tracking-normal ml-1">
            , {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
