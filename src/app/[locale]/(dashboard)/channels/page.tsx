// src/app/dashboard/channels/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Phone,
  Mail,
  Smartphone,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Save,
  Zap,
  Globe,
  Shield,
} from "lucide-react";

function cn(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

interface ChannelConfig {
  whatsapp: {
    enabled: boolean;
    instanceName: string;
    evolutionApiUrl: string;
    evolutionApiKey: string;
    connected: boolean;
  };
  email: {
    enabled: boolean;
    resendApiKey: string;
    fromEmail: string;
    fromName: string;
    connected: boolean;
  };
  sms: {
    enabled: boolean;
    twilioSid: string;
    twilioToken: string;
    twilioPhone: string;
    connected: boolean;
  };
}

const DEFAULT_CONFIG: ChannelConfig = {
  whatsapp: { enabled: false, instanceName: "", evolutionApiUrl: "", evolutionApiKey: "", connected: false },
  email: { enabled: false, resendApiKey: "", fromEmail: "", fromName: "", connected: false },
  sms: { enabled: false, twilioSid: "", twilioToken: "", twilioPhone: "", connected: false },
};

export default function ChannelsPage() {
  const [config, setConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setConfig(data))
      .catch(() => {});
  }, []);

  async function saveChannel(channel: string) {
    setSaving(channel);
    try {
      await fetch("/api/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, config: (config as any)[channel] }),
      });
    } catch {}
    setSaving(null);
  }

  async function testConnection(channel: string) {
    setTesting(channel);
    setTestResult((prev) => ({ ...prev, [channel]: { ok: false, msg: "" } }));
    try {
      const res = await fetch("/api/channels/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, config: (config as any)[channel] }),
      });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [channel]: { ok: res.ok, msg: data.message || (res.ok ? "Conexão OK!" : "Falha na conexão") } }));
    } catch {
      setTestResult((prev) => ({ ...prev, [channel]: { ok: false, msg: "Erro ao testar — verifique as credenciais" } }));
    }
    setTesting(null);
  }

  function toggleKey(key: string) {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function SecretField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
    const visible = showKeys[id];
    return (
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">{label}</label>
        <div className="relative">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-10 px-4 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body"
          />
          <button onClick={() => toggleKey(id)} type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body"
        />
      </div>
    );
  }

  const channels = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      description: "Conecte via Evolution API para enviar e receber mensagens",
      icon: Phone,
      color: "text-emerald-400",
      bgColor: "bg-emerald-400/10",
      borderColor: "border-emerald-400/20",
      fields: (
        <div className="space-y-3 mt-4 animate-up">
          <TextField label="Nome da Instância" value={config.whatsapp.instanceName} onChange={(v) => setConfig((p) => ({ ...p, whatsapp: { ...p.whatsapp, instanceName: v } }))} placeholder="minha-instancia" />
          <TextField label="Evolution API URL" value={config.whatsapp.evolutionApiUrl} onChange={(v) => setConfig((p) => ({ ...p, whatsapp: { ...p.whatsapp, evolutionApiUrl: v } }))} placeholder="https://api.evolution.com" />
          <SecretField id="wpp-key" label="Evolution API Key" value={config.whatsapp.evolutionApiKey} onChange={(v) => setConfig((p) => ({ ...p, whatsapp: { ...p.whatsapp, evolutionApiKey: v } }))} placeholder="sua-api-key" />
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      description: "Configure o envio de emails via Resend",
      icon: Mail,
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
      borderColor: "border-blue-400/20",
      fields: (
        <div className="space-y-3 mt-4 animate-up">
          <SecretField id="email-key" label="Resend API Key" value={config.email.resendApiKey} onChange={(v) => setConfig((p) => ({ ...p, email: { ...p.email, resendApiKey: v } }))} placeholder="re_xxxxxxxxxxxx" />
          <TextField label="Email de Envio" value={config.email.fromEmail} onChange={(v) => setConfig((p) => ({ ...p, email: { ...p.email, fromEmail: v } }))} placeholder="contato@empresa.com" />
          <TextField label="Nome do Remetente" value={config.email.fromName} onChange={(v) => setConfig((p) => ({ ...p, email: { ...p.email, fromName: v } }))} placeholder="Sua Empresa" />
        </div>
      ),
    },
    {
      key: "sms",
      label: "SMS",
      description: "Configure o envio de SMS via Twilio",
      icon: Smartphone,
      color: "text-amber-400",
      bgColor: "bg-amber-400/10",
      borderColor: "border-amber-400/20",
      fields: (
        <div className="space-y-3 mt-4 animate-up">
          <SecretField id="twilio-sid" label="Twilio Account SID" value={config.sms.twilioSid} onChange={(v) => setConfig((p) => ({ ...p, sms: { ...p.sms, twilioSid: v } }))} placeholder="ACxxxxxxxxxxxxxxxx" />
          <SecretField id="twilio-token" label="Twilio Auth Token" value={config.sms.twilioToken} onChange={(v) => setConfig((p) => ({ ...p, sms: { ...p.sms, twilioToken: v } }))} placeholder="seu-token" />
          <TextField label="Número Twilio" value={config.sms.twilioPhone} onChange={(v) => setConfig((p) => ({ ...p, sms: { ...p.sms, twilioPhone: v } }))} placeholder="+15551234567" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight font-display">Canais</h1>
        <p className="text-sm text-zinc-500 mt-1 font-body">Configure seus canais de comunicação com leads</p>
      </div>

      {/* Channel cards */}
      <div className="space-y-4 stagger">
        {channels.map((ch) => {
          const Icon = ch.icon;
          const enabled = (config as any)[ch.key]?.enabled;
          const connected = (config as any)[ch.key]?.connected;
          const result = testResult[ch.key];

          return (
            <div key={ch.key} className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 transition-all hover:border-white/[0.1]">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", ch.bgColor)}>
                    <Icon className={cn("w-5 h-5", ch.color)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-white font-display">{ch.label}</h3>
                      {connected && (
                        <span className="chip chip-success">
                          <CheckCircle className="w-3 h-3" />
                          Conectado
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-500 mt-0.5 font-body">{ch.description}</p>
                  </div>
                </div>

                {/* Toggle */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      setConfig((p) => ({
                        ...p,
                        [ch.key]: { ...(p as any)[ch.key], enabled: e.target.checked },
                      }));
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/[0.08] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-zinc-400 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B9F495] peer-checked:after:bg-black" />
                </label>
              </div>

              {/* Config fields (shown when enabled) */}
              {enabled && (
                <>
                  {ch.fields}

                  {/* Test result */}
                  {result && (
                    <div className={cn(
                      "flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-[12px] font-medium animate-fade-in",
                      result.ok ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20" : "bg-red-400/10 text-red-400 border border-red-400/20"
                    )}>
                      {result.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {result.msg}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => testConnection(ch.key)}
                      disabled={testing === ch.key}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium text-zinc-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {testing === ch.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Testar Conexão
                    </button>
                    <button
                      onClick={() => saveChannel(ch.key)}
                      disabled={saving === ch.key}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold btn-brand cursor-pointer disabled:opacity-50"
                    >
                      {saving === ch.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Salvar
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Info banner */}
      <div className="rounded-2xl border border-[rgba(185,244,149,0.12)] bg-[rgba(185,244,149,0.03)] p-5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#B9F495] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[13px] font-semibold text-white font-display">Segurança das Credenciais</h3>
            <p className="text-[12px] text-zinc-400 mt-1 leading-relaxed font-body">
              Todas as chaves de API e tokens são criptografados com AES-256 antes de serem armazenados.
              Nunca compartilhamos suas credenciais com terceiros. A comunicação com os provedores é feita
              diretamente do seu servidor via HTTPS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}