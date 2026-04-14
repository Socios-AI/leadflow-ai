// src/app/[locale]/(dashboard)/channels/email/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Mail, Loader2, CheckCircle, ArrowLeft, Eye, EyeOff,
  Send, AlertCircle, ExternalLink, X, Wifi, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailConfig { resendApiKey: string; fromName: string; fromEmail: string; domain: string; enabled: boolean; verified: boolean; }

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
  const [config, setConfig] = useState<EmailConfig>({ resendApiKey: "", fromName: "", fromEmail: "", domain: "", enabled: false, verified: false });

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const loadConfig = useCallback(async () => {
    try { const r = await fetch("/api/channels/email"); if (r.ok) { const d = await r.json(); setConfig(d); } } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function handleSave() {
    if (!config.resendApiKey || !config.fromEmail || !config.fromName) { showToast(t("fillRequired"), false); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/channels/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...config }) });
      if (r.ok) { showToast(t("emailSaved"), true); setConfig(prev => ({ ...prev, enabled: true })); }
      else showToast(t("saveError"), false);
    } catch { showToast(t("connectionError"), false); }
    setSaving(false);
  }

  async function handleTest() {
    if (!testEmail.trim()) { showToast(t("enterTestEmail"), false); return; }
    setTesting(true);
    try {
      const r = await fetch("/api/channels/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", to: testEmail }) });
      const d = await r.json();
      if (d.success) { showToast(`${t("testSent")} ${testEmail}`, true); setShowTestModal(false); setTestEmail(""); }
      else showToast(d.error || t("testError"), false);
    } catch { showToast(t("connectionError"), false); }
    setTesting(false);
  }

  async function handleDisable() {
    if (!confirm(t("disableConfirm"))) return;
    await fetch("/api/channels/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable" }) });
    setConfig(prev => ({ ...prev, enabled: false })); showToast(t("disabled"), true);
  }

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {toast && (<div className={cn("fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2", toast.ok ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>{toast.msg}</div>)}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4 text-muted-foreground" /></Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center"><Mail className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="font-space-grotesk text-lg font-bold text-foreground tracking-tight">{t("title")}</h1>
            <p className="text-[11px] text-muted-foreground font-dm-sans">{t("subtitle")}</p>
          </div>
        </div>
        {config.enabled && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTestModal(true)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground border border-border hover:bg-muted cursor-pointer transition-colors flex items-center gap-1.5"><Send className="w-3 h-3" />{t("sendTest")}</button>
            <button onClick={handleDisable} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/5 cursor-pointer transition-colors">{t("disable")}</button>
          </div>
        )}
      </div>

      <div className={cn("rounded-2xl border p-4 flex items-center gap-3", config.enabled ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-border bg-card")}>
        {config.enabled ? <Wifi className="w-5 h-5 text-emerald-500" /> : <WifiOff className="w-5 h-5 text-muted-foreground/40" />}
        <div>
          <p className="text-[13px] font-semibold text-foreground">{config.enabled ? t("active") : t("inactive")}</p>
          {config.enabled && config.fromEmail && <p className="text-[11px] text-emerald-500 mt-0.5">{config.fromName} &lt;{config.fromEmail}&gt;</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border/50">
          <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("resendConfig")}</h2>
          <p className="text-[11px] text-muted-foreground font-dm-sans mt-0.5">{t("resendConfigDesc")}</p>
        </div>
        <div className="px-5 py-5 space-y-4">
          <Field label={t("apiKey")} required>
            <div className="relative">
              <input type={showKey ? "text" : "password"} value={config.resendApiKey} onChange={e => setConfig({ ...config, resendApiKey: e.target.value })} placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="field pr-10" />
              <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer">{showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("senderName")} required><input value={config.fromName} onChange={e => setConfig({ ...config, fromName: e.target.value })} placeholder="Marketing Digital AI" className="field" /></Field>
            <Field label={t("senderEmail")} required><input value={config.fromEmail} onChange={e => setConfig({ ...config, fromEmail: e.target.value })} placeholder="contato@domain.com" className="field" /></Field>
          </div>
          <Field label={t("domain")} hint={t("domainHint")}><input value={config.domain} onChange={e => setConfig({ ...config, domain: e.target.value })} placeholder="domain.com" className="field" /></Field>
          <button onClick={handleSave} disabled={saving} className="w-full h-10 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}{saving ? t("saving") : t("saveConfig")}
          </button>
        </div>
      </div>

      <div className="px-4 py-3 rounded-xl border border-border/30 bg-muted/20 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] text-muted-foreground leading-relaxed font-dm-sans">{t("helpText")}</p>
          <a href="https://resend.com/docs" target="_blank" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">{t("docsLink")} <ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>

      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setShowTestModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-space-grotesk text-[14px] font-semibold">{t("testEmail")}</h3>
              <button onClick={() => setShowTestModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <Field label={t("testTo")}><input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="email@example.com" className="field" autoFocus /></Field>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowTestModal(false)} className="flex-1 h-9 rounded-xl border border-border text-[12px] font-medium text-muted-foreground hover:bg-muted cursor-pointer transition-colors">{tc("cancel")}</button>
              <button onClick={handleTest} disabled={testing} className="flex-1 h-9 rounded-xl btn-brand text-[12px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}{tc("send")}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`.field { width: 100%; height: 40px; padding: 0 16px; border-radius: 12px; background: hsl(var(--muted)); border: 1px solid transparent; font-size: 13px; color: hsl(var(--foreground)); font-family: var(--font-dm-sans); } .field:focus { outline: none; border-color: hsl(var(--ring) / 0.3); } .field::placeholder { color: hsl(var(--muted-foreground) / 0.4); }`}</style>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (<div><label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block font-dm-sans">{label} {required && <span className="text-red-400">*</span>}{hint && <span className="text-muted-foreground/40 normal-case tracking-normal ml-1">— {hint}</span>}</label>{children}</div>);
}