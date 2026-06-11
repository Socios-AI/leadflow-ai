// src/app/[locale]/(dashboard)/channels/whatsapp/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Phone, Loader2, QrCode, Unplug, ArrowLeft, RefreshCw,
  Wifi, WifiOff, Filter, Power, Plus, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WaChannel {
  id: string;
  label: string | null;
  instanceName: string;
  connected: boolean;
  phoneNumber: string | null;
  lastActivity: string | null;
  webhookConfigured: boolean;
  respondToFunnelLeadsOnly: boolean;
}

const API = "/api/channels/whatsapp";

export default function WhatsAppChannelPage() {
  const t = useTranslations("channels.whatsapp");

  const [channels, setChannels] = useState<WaChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The number currently pairing (showing a QR). channelId may be "new".
  const [qr, setQr] = useState<{ channelId: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(API);
      if (!r.ok) return;
      const d = await r.json();
      setChannels(Array.isArray(d.channels) ? d.channels : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // Background heartbeat while not pairing.
  useEffect(() => {
    if (qr) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [qr, load]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Poll the live status of the pairing instance until it connects.
  function startPairPolling(channelId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const { data } = await post({ action: "status", channelId });
      if (data?.connected) {
        stopPolling();
        setQr(null);
        load();
      }
    }, 4000);
  }

  async function connect(channelId?: string, isNew = false) {
    setError(null);
    if (isNew) setAdding(true); else setBusyId(channelId || "primary");
    try {
      const { data } = await post({ action: "connect", channelId, new: isNew });
      if (data?.connected) { await load(); return; }
      if (data?.qrCode && data?.channelId) {
        setQr({ channelId: data.channelId, code: data.qrCode });
        startPairPolling(data.channelId);
        await load();
        return;
      }
      setError(data?.error || t("qrError"));
    } catch {
      setError(t("serverError"));
    } finally {
      setAdding(false);
      setBusyId(null);
    }
  }

  async function disconnect(channelId: string) {
    if (!confirm(t("disconnectConfirm"))) return;
    setBusyId(channelId);
    try { await post({ action: "disconnect", channelId }); await load(); } finally { setBusyId(null); }
  }

  async function remove(channelId: string) {
    if (!confirm("Remover este número? Ele será desconectado e apagado da lista.")) return;
    setBusyId(channelId);
    try { await post({ action: "delete", channelId }); await load(); } finally { setBusyId(null); }
  }

  async function restart(channelId: string) {
    setBusyId(channelId);
    try { await post({ action: "restart", channelId }); } finally { setBusyId(null); }
  }

  async function reconfigureWebhook(channelId: string) {
    setBusyId(channelId);
    try {
      const { data } = await post({ action: "configureWebhook", channelId });
      if (data?.qrCode && data?.recreated && data?.channelId) {
        setQr({ channelId: data.channelId, code: data.qrCode });
        startPairPolling(data.channelId);
      }
      await load();
    } finally { setBusyId(null); }
  }

  async function toggleFunnel(channelId: string, next: boolean) {
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, respondToFunnelLeadsOnly: next } : c)));
    await post({ action: "setRespondToFunnelLeadsOnly", channelId, value: next });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4 text-muted-foreground" /></Link>
        <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center"><Phone className="w-5 h-5 text-white" /></div>
        <div className="flex-1">
          <h1 className="font-space-grotesk text-lg font-bold text-foreground tracking-tight">{t("title")}</h1>
          <p className="text-[11px] text-muted-foreground font-dm-sans">Conecte um ou vários números de WhatsApp.</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/[0.06] border border-red-500/10 text-[12px] text-red-400 font-dm-sans">{error}</div>
      )}

      {/* QR modal */}
      {qr && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => { stopPolling(); setQr(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[360px] rounded-2xl border border-primary/20 bg-card p-6 text-center space-y-4 shadow-floating">
            <button onClick={() => { stopPolling(); setQr(null); }} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            <h2 className="font-space-grotesk text-[16px] font-bold text-foreground">{t("scanQR")}</h2>
            <p className="text-[12px] text-muted-foreground font-dm-sans" dangerouslySetInnerHTML={{ __html: t("scanInstructions") }} />
            <div className="inline-block p-4 bg-white rounded-2xl shadow-sm"><img src={qr.code} alt="QR Code" className="w-[240px] h-[240px]" /></div>
            <div className="flex items-center justify-center gap-2"><span className="w-2 h-2 rounded-full bg-primary animate-pulse" /><span className="text-[12px] text-primary font-medium">{t("waitingQR")}</span></div>
          </div>
        </>
      )}

      {/* Channel list */}
      <div className="space-y-3">
        {channels.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto"><WifiOff className="w-6 h-6 text-muted-foreground/40" /></div>
            <div>
              <h2 className="font-space-grotesk text-[16px] font-bold text-foreground">{t("notConnected")}</h2>
              <p className="text-[12px] text-muted-foreground font-dm-sans mt-1">{t("notConnectedDesc")}</p>
            </div>
          </div>
        )}

        {channels.map((c) => (
          <div key={c.id} className={cn("rounded-2xl border p-4", c.connected ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-border bg-card")}>
            <div className="flex items-start gap-3">
              <div className={cn("w-10 h-10 rounded-xl grid place-items-center shrink-0", c.connected ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground/50")}>
                {c.connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground">
                  {c.connected ? (c.phoneNumber ? `+${c.phoneNumber}` : t("connected")) : t("notConnected")}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{c.instanceName}</p>
                {!c.webhookConfigured && (
                  <p className="text-[10.5px] text-amber-500 mt-1">{t("webhookMissing")}</p>
                )}
              </div>
              {busyId === c.id && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
            </div>

            {/* Funnel-only toggle per number */}
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11.5px] text-muted-foreground truncate">{t("funnelOnlyTitle")}</span>
              </div>
              <button
                type="button" role="switch" aria-checked={c.respondToFunnelLeadsOnly}
                onClick={() => toggleFunnel(c.id, !c.respondToFunnelLeadsOnly)}
                className={cn("relative h-5 w-9 rounded-full transition-colors shrink-0", c.respondToFunnelLeadsOnly ? "bg-primary" : "bg-muted")}
              >
                <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", c.respondToFunnelLeadsOnly ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <button onClick={() => connect(c.id)} disabled={busyId === c.id} className="h-9 rounded-lg border border-border text-[11.5px] font-medium text-muted-foreground hover:bg-muted cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                {c.connected ? <><RefreshCw className="w-3.5 h-3.5" />{t("reconnect")}</> : <><QrCode className="w-3.5 h-3.5" />{t("connect")}</>}
              </button>
              <button onClick={() => restart(c.id)} disabled={busyId === c.id} className="h-9 rounded-lg border border-amber-500/30 text-[11.5px] font-medium text-amber-500 hover:bg-amber-500/10 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Power className="w-3.5 h-3.5" />{t("restart")}
              </button>
              <button onClick={() => reconfigureWebhook(c.id)} disabled={busyId === c.id} className="h-9 rounded-lg border border-border text-[11.5px] font-medium text-muted-foreground hover:bg-muted cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" />Webhook
              </button>
              <button onClick={() => (c.connected ? disconnect(c.id) : remove(c.id))} disabled={busyId === c.id} className="h-9 rounded-lg border border-red-500/20 text-[11.5px] font-medium text-red-400 hover:bg-red-500/5 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                {c.connected ? <><Unplug className="w-3.5 h-3.5" />{t("disconnect")}</> : <><Trash2 className="w-3.5 h-3.5" />Remover</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add another number */}
      <button
        onClick={() => connect(undefined, true)}
        disabled={adding}
        className="w-full h-11 rounded-xl btn-brand text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        {channels.length === 0 ? t("connect") : "Adicionar número"}
      </button>
    </div>
  );
}
