// src/app/[locale]/(dashboard)/settings/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  Settings,
  Copy,
  Check,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Zap,
  Globe,
  Shield,
  Bell,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  webhookUrl: string;
  metaWebhookUrl?: string;
  isActive: boolean;
  createdAt: string;
}

/* ═══════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════ */
export default function SettingsPage() {
  const locale = useLocale();
  const [tab, setTab] = useState<"webhooks" | "general" | "notifications">("webhooks");
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Load webhooks
  useEffect(() => {
    fetch("/api/webhooks/manage")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WebhookItem[]) => setWebhooks(Array.isArray(data) ? data : []))
      .catch(() => setWebhooks([]))
      .finally(() => setLoading(false));
  }, []);

  // Copy
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  // Create webhook
  const createWebhook = useCallback(async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/webhooks/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks((prev) => [data, ...prev]);
        setNewName("");
      }
    } catch {}
    setCreating(false);
  }, [newName, creating]);

  // Delete webhook
  const deleteWebhook = useCallback(async (id: string) => {
    try {
      await fetch(`/api/webhooks/manage?id=${id}`, { method: "DELETE" });
    } catch {}
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copy(text, id)}
      className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors cursor-pointer shrink-0"
    >
      {copiedKey === id ? (
        <Check className="w-3.5 h-3.5 text-(--chip-brand-text)" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );

  const tabs = [
    { key: "webhooks" as const, label: "Webhooks", icon: Zap },
    { key: "general" as const, label: "Geral", icon: Settings },
    { key: "notifications" as const, label: "Notificações", icon: Bell },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-semibold text-2xl tracking-tight">Configurações</h1>
        <p className="font-body text-sm text-muted-foreground mt-1">Gerencie integrações e preferências</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                tab === t.key ? "btn-brand" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══ Webhooks ═══ */}
      {tab === "webhooks" && (
        <div className="space-y-5">
          {/* How it works */}
          <div className="glass-card p-5 border-l-2 border-l-(--chip-brand-text)">
            <h3 className="font-display text-sm font-semibold mb-1">Como capturar leads</h3>
            <p className="font-body text-xs text-muted-foreground leading-relaxed">
              Copie a URL do webhook e cole na configuração da sua plataforma de ads (Meta Business, Google Ads, Zapier, Make, ou landing page).
              Quando um lead chegar, o sistema captura automaticamente e a IA inicia o atendimento.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["Meta Lead Ads", "Google Ads", "Zapier", "Make", "Landing Pages", "API"].map((p) => (
                <span key={p} className="chip chip-brand">{p}</span>
              ))}
            </div>
          </div>

          {/* Create */}
          <div className="glass-card p-5">
            <h3 className="font-display text-sm font-semibold mb-3">Criar Webhook</h3>
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createWebhook()}
                placeholder="Nome (ex: Meta Ads Brasil)"
                className="flex-1 h-10 px-4 rounded-xl bg-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-body"
              />
              <button
                onClick={createWebhook}
                disabled={creating || !newName.trim()}
                className="flex items-center gap-2 px-4 h-10 rounded-xl btn-brand text-xs font-semibold disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar
              </button>
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-body">Nenhum webhook criado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="glass-card p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display text-sm font-semibold">{wh.url}</h4>
                        {wh.isActive && <span className="chip chip-recover">Ativo</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-body">
                        Criado em {new Date(wh.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteWebhook(wh.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors cursor-pointer rounded-lg hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* URL */}
                  <div className="space-y-1 mb-3">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Webhook URL</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-[11px] font-mono truncate text-(--chip-brand-text)">
                        {wh.webhookUrl}
                      </code>
                      <CopyBtn text={wh.webhookUrl} id={`url-${wh.id}`} />
                    </div>
                  </div>

                  {/* Secret */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Secret (Header: x-webhook-secret)
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-[11px] font-mono truncate">
                        {showSecrets[wh.id] ? wh.secret : "•".repeat(32)}
                      </code>
                      <button
                        onClick={() => setShowSecrets((p) => ({ ...p, [wh.id]: !p[wh.id] }))}
                        className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        {showSecrets[wh.id] ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      <CopyBtn text={wh.secret} id={`secret-${wh.id}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Integration guide */}
          <div className="glass-card p-5">
            <h3 className="font-display text-sm font-semibold mb-3">Guia de Integração</h3>
            <div className="space-y-2">
              {[
                { platform: "Meta Lead Ads", hint: "Business Settings → Webhook URL → Cole a URL" },
                { platform: "Google Ads", hint: "Extensions → Lead Form → Webhook → POST na URL" },
                { platform: "Zapier / Make", hint: "Trigger → Action: Webhook POST → JSON com name, email, phone" },
                { platform: "Landing Page", hint: "Form action POST na URL com campos name, email, phone" },
              ].map((item) => (
                <div key={item.platform} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                  <Globe className="w-4 h-4 text-(--chip-brand-text) mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">{item.platform}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-body">{item.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ General ═══ */}
      {tab === "general" && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="font-display text-sm font-semibold">Informações da Conta</h3>
          {["Nome da Empresa", "Email Principal", "Timezone", "Idioma Padrão da IA"].map((label) => (
            <div key={label}>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 tracking-wide uppercase">{label}</label>
              <input className="w-full h-10 px-4 rounded-xl bg-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-body" />
            </div>
          ))}
          <button className="btn-brand px-6 py-2.5 rounded-xl text-xs font-semibold">Salvar</button>
        </div>
      )}

      {/* ═══ Notifications ═══ */}
      {tab === "notifications" && (
        <div className="glass-card p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold">Notificações</h3>
          {[
            { label: "Novo lead capturado", desc: "Quando um lead chegar via webhook" },
            { label: "IA escalou conversa", desc: "Quando a IA escalar para humano" },
            { label: "Lead convertido", desc: "Quando um lead for convertido" },
            { label: "Relatório diário", desc: "Resumo diário por email" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border">
              <div>
                <p className="text-xs font-medium">{item.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-body">{item.desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-muted-foreground after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-primary-foreground" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}