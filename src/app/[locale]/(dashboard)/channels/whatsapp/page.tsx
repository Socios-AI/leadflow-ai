// src/app/[locale]/(dashboard)/channels/whatsapp/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Phone, Loader2, QrCode, Unplug, ArrowLeft, RefreshCw,
  Wifi, WifiOff, Smartphone, Shield, Zap, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "loading" | "disconnected" | "connecting" | "qr" | "connected";

export default function WhatsAppChannelPage() {
  const t = useTranslations("channels.whatsapp");
  const locale = useLocale();

  const [status, setStatus] = useState<Status>("loading");
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [reconfiguring, setReconfiguring] = useState(false);
  const [webhookToast, setWebhookToast] = useState<string | null>(null);
  const [webhookAttempts, setWebhookAttempts] = useState<
    | {
        label: string;
        method: string;
        url: string;
        status: number;
        ok: boolean;
        detail?: string;
      }[]
    | null
  >(null);
  const [webhookInstance, setWebhookInstance] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/channels/whatsapp"); if (!r.ok) return;
      const d = await r.json();
      setWebhookConfigured(!!d.webhookConfigured);
      setWebhookUrl(d.webhookUrl || "");
      if (d.connected) { setStatus("connected"); setPhoneNumber(d.phoneNumber); setLastActivity(d.lastActivity); setQrCode(null); stopPolling(); }
      else if (status === "loading") setStatus("disconnected");
    } catch {}
  }, []);

  useEffect(() => { loadStatus(); return () => stopPolling(); }, [loadStatus]);
  function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  async function handleReconfigureWebhook() {
    setReconfiguring(true);
    setWebhookToast(null);
    setWebhookAttempts(null);
    setWebhookInstance(null);
    try {
      const r = await fetch("/api/channels/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configureWebhook" }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setWebhookConfigured(true);
        if (d.webhookUrl) setWebhookUrl(d.webhookUrl);
        // When the API had to recreate the instance, it returns a fresh QR
        // and signals that pairing is needed again. Surface that flow
        // immediately so the operator scans without a second click.
        if (d.qrCode && d.recreated) {
          setQrCode(d.qrCode);
          setStatus("qr");
          setPhoneNumber(null);
          setWebhookToast(t("webhookRecreated"));
          stopPolling();
          pollRef.current = setInterval(async () => {
            try {
              const sr = await fetch("/api/channels/whatsapp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "status" }),
              });
              const sd = await sr.json();
              if (sd.connected) {
                setStatus("connected");
                setPhoneNumber(sd.phoneNumber);
                setQrCode(null);
                stopPolling();
              }
            } catch {}
          }, 4000);
        } else {
          setWebhookToast(t("webhookReconfigured"));
          setTimeout(() => setWebhookToast(null), 4000);
        }
      } else {
        setWebhookToast(d.error || t("webhookReconfigureError"));
        if (Array.isArray(d.attempts)) setWebhookAttempts(d.attempts);
        if (typeof d.instanceName === "string") setWebhookInstance(d.instanceName);
      }
    } catch {
      setWebhookToast(t("webhookReconfigureError"));
    } finally {
      setReconfiguring(false);
    }
  }

  async function handleConnect() {
    setStatus("connecting"); setError(null); setQrCode(null);
    try {
      const r = await fetch("/api/channels/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect" }) });
      const d = await r.json();
      if (d.connected) { setStatus("connected"); setPhoneNumber(d.phoneNumber); setQrCode(null); return; }
      if (d.qrCode) {
        setQrCode(d.qrCode); setStatus("qr"); stopPolling();
        pollRef.current = setInterval(async () => {
          try { const sr = await fetch("/api/channels/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status" }) }); const sd = await sr.json(); if (sd.connected) { setStatus("connected"); setPhoneNumber(sd.phoneNumber); setQrCode(null); stopPolling(); } } catch {}
        }, 4000);
        return;
      }
      setError(d.error || t("qrError")); setStatus("disconnected");
    } catch { setError(t("serverError")); setStatus("disconnected"); }
  }

  async function handleDisconnect() {
    if (!confirm(t("disconnectConfirm"))) return;
    setDisconnecting(true);
    try { await fetch("/api/channels/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) }); setStatus("disconnected"); setPhoneNumber(null); setQrCode(null); } catch {}
    setDisconnecting(false);
  }

  if (status === "loading") return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4 text-muted-foreground" /></Link>
        <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center"><Phone className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="font-space-grotesk text-lg font-bold text-foreground tracking-tight">{t("title")}</h1>
          <p className="text-[11px] text-muted-foreground font-dm-sans">{t("subtitle")}</p>
        </div>
      </div>

      {status === "connected" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3"><Wifi className="w-6 h-6 text-emerald-500" /></div>
            <h2 className="font-space-grotesk text-lg font-bold text-foreground">{t("connected")}</h2>
            {phoneNumber && <p className="text-emerald-500 font-mono text-[15px] font-semibold mt-1">+{phoneNumber}</p>}
            <p className="text-[12px] text-muted-foreground mt-2 font-dm-sans">{t("aiReady")}</p>
            {lastActivity && (
              <p className="text-[10px] text-muted-foreground/50 mt-1 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />{t("lastActivity")}: {new Date(lastActivity).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleConnect} className="flex-1 h-10 rounded-xl border border-border text-[13px] font-medium text-muted-foreground hover:bg-muted cursor-pointer transition-colors flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />{t("reconnect")}</button>
            <button onClick={handleDisconnect} disabled={disconnecting} className="flex-1 h-10 rounded-xl border border-red-500/20 text-[13px] font-medium text-red-400 hover:bg-red-500/5 cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}{t("disconnect")}
            </button>
          </div>
        </div>
      )}

      {status === "qr" && qrCode && (
        <div className="rounded-2xl border border-primary/20 bg-card p-6 text-center space-y-4">
          <h2 className="font-space-grotesk text-[16px] font-bold text-foreground">{t("scanQR")}</h2>
          <p className="text-[12px] text-muted-foreground font-dm-sans max-w-sm mx-auto" dangerouslySetInnerHTML={{ __html: t("scanInstructions") }} />
          <div className="inline-block p-4 bg-white rounded-2xl shadow-sm"><img src={qrCode} alt="QR Code" className="w-[250px] h-[250px]" /></div>
          <div className="flex items-center justify-center gap-2"><span className="w-2 h-2 rounded-full bg-primary animate-pulse" /><span className="text-[12px] text-primary font-medium">{t("waitingQR")}</span></div>
          <button onClick={handleConnect} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground cursor-pointer">{t("newQR")}</button>
        </div>
      )}

      {status === "disconnected" && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto"><WifiOff className="w-6 h-6 text-muted-foreground/40" /></div>
          <div>
            <h2 className="font-space-grotesk text-[16px] font-bold text-foreground">{t("notConnected")}</h2>
            <p className="text-[12px] text-muted-foreground font-dm-sans mt-1 max-w-sm mx-auto">{t("notConnectedDesc")}</p>
          </div>
          {error && <div className="px-4 py-2.5 rounded-xl bg-red-500/[0.06] border border-red-500/10 text-[12px] text-red-400 font-dm-sans">{error}</div>}
          <button onClick={handleConnect} className="w-full max-w-xs mx-auto h-11 rounded-xl btn-brand text-[14px] font-semibold flex items-center justify-center gap-2"><QrCode className="w-5 h-5" />{t("connect")}</button>
        </div>
      )}

      {status === "connecting" && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-[13px] text-foreground font-medium">{t("preparing")}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{t("preparingDesc")}</p>
        </div>
      )}

      {/* WEBHOOK STATUS, sempre visivel quando nao esta no QR ou conectando.
          O early return de "loading" la em cima ja garante que aqui status
          e apenas connected | disconnected | connecting | qr. */}
      {status !== "connecting" && (
        <div className={cn(
          "rounded-2xl border p-4",
          webhookConfigured
            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
            : "border-amber-500/30 bg-amber-500/[0.06]"
        )}>
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-9 h-9 rounded-xl grid place-items-center shrink-0",
              webhookConfigured ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/20 text-amber-500"
            )}>
              {webhookConfigured ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                {webhookConfigured ? t("webhookActive") : t("webhookMissing")}
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                {webhookConfigured ? t("webhookActiveDesc") : t("webhookMissingDesc")}
              </p>
              {webhookUrl && (
                <p className="text-[10.5px] text-muted-foreground/70 font-mono mt-2 break-all">
                  {webhookUrl}
                </p>
              )}
              {webhookToast && (
                <p className="text-[11.5px] text-foreground mt-2">{webhookToast}</p>
              )}
              {webhookAttempts && webhookAttempts.length > 0 && (
                <details className="mt-3 text-[10.5px]">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                    {t("webhookAttemptsTitle", { instance: webhookInstance || "?" })}
                  </summary>
                  <div className="mt-2 space-y-1 font-mono">
                    {webhookAttempts.map((a, i) => (
                      <div
                        key={i}
                        className={cn(
                          "px-2 py-1.5 rounded border",
                          a.ok
                            ? "border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-500"
                            : "border-border bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{a.method}</span>
                          <span className="opacity-70">{a.status || "ERR"}</span>
                          <span className="truncate flex-1">{a.label}</span>
                        </div>
                        {a.detail && (
                          <div className="opacity-60 truncate mt-0.5">{a.detail}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <button
              onClick={handleReconfigureWebhook}
              disabled={reconfiguring}
              className={cn(
                "h-9 px-3 rounded-lg text-[11.5px] font-semibold border transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50",
                webhookConfigured
                  ? "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
              )}
            >
              {reconfiguring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {webhookConfigured ? t("webhookReconfigure") : t("webhookConfigure")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {[
          { icon: Shield, titleKey: "secureConnection" as const, descKey: "secureConnectionDesc" as const },
          { icon: Zap, titleKey: "autoReply" as const, descKey: "autoReplyDesc" as const },
          { icon: Smartphone, titleKey: "useNormally" as const, descKey: "useNormallyDesc" as const },
        ].map(info => (
          <div key={info.titleKey} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border/30 bg-muted/10">
            <info.icon className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-medium text-foreground">{t(info.titleKey)}</p>
              <p className="text-[11px] text-muted-foreground/60 font-dm-sans">{t(info.descKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}