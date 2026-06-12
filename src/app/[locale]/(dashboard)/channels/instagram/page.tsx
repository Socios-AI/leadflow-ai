// src/app/[locale]/(dashboard)/channels/instagram/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Instagram, Loader2, ArrowLeft, Wifi, WifiOff, Link2, Unplug } from "lucide-react";

interface MetaStatus {
  connected: boolean;
  userName?: string;
  email?: string;
}

export default function InstagramChannelPage() {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/integrations/meta/status");
      const d = r.ok ? await r.json() : { connected: false };
      setStatus(d);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = () => { window.location.href = "/api/integrations/meta/connect"; };

  const disconnect = async () => {
    if (!confirm("Desconectar a conta Meta? O Instagram e os Lead Ads deixam de funcionar.")) return;
    setDisconnecting(true);
    try { await fetch("/api/integrations/meta/disconnect", { method: "POST" }); await load(); }
    finally { setDisconnecting(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  }

  const connected = !!status?.connected;

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4 text-muted-foreground" /></Link>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E1306C] to-[#F77737] flex items-center justify-center"><Instagram className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="font-space-grotesk text-lg font-bold text-foreground tracking-tight">Instagram Direct</h1>
          <p className="text-[11px] text-muted-foreground font-dm-sans">A IA atende as DMs do Instagram.</p>
        </div>
      </div>

      {connected ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto"><Wifi className="w-6 h-6 text-emerald-500" /></div>
          <h2 className="font-space-grotesk text-lg font-bold text-foreground">Conta Meta conectada</h2>
          {status?.userName && <p className="text-[13px] text-foreground font-medium">{status.userName}</p>}
          <p className="text-[12px] text-muted-foreground font-dm-sans max-w-sm mx-auto">
            O Instagram é autorizado junto da conexão Meta (a conta precisa estar vinculada a uma Página do Facebook). O atendimento por DM é ativado assim que o app do Meta tiver a permissão de mensagens do Instagram aprovada.
          </p>
          <button onClick={disconnect} disabled={disconnecting} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-red-500/20 text-[12.5px] font-medium text-red-400 hover:bg-red-500/5 cursor-pointer disabled:opacity-50">
            {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
            Desconectar Meta
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto"><WifiOff className="w-6 h-6 text-muted-foreground/40" /></div>
          <div>
            <h2 className="font-space-grotesk text-[16px] font-bold text-foreground">Instagram não conectado</h2>
            <p className="text-[12px] text-muted-foreground font-dm-sans mt-1 max-w-sm mx-auto">
              Conecte sua conta Meta (Facebook/Instagram) uma única vez. Vincule o Instagram a uma Página do Facebook para a IA poder atender as DMs.
            </p>
          </div>
          <button onClick={connect} className="w-full max-w-xs mx-auto h-11 rounded-xl btn-brand text-[14px] font-semibold flex items-center justify-center gap-2">
            <Link2 className="w-5 h-5" />Conectar Meta / Instagram
          </button>
        </div>
      )}

      <div className="space-y-2">
        {[
          "A IA responde às DMs do Instagram do mesmo jeito que no WhatsApp.",
          "Os leads que chegam por DM entram no mesmo funil e CRM.",
          "A conexão é feita via Meta — suas credenciais nunca passam por aqui.",
        ].map((txt, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border/30 bg-muted/10">
            <Instagram className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            <p className="text-[12px] text-muted-foreground/80 font-dm-sans">{txt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
