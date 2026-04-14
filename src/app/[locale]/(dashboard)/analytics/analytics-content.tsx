// src/app/[locale]/(dashboard)/analytics/analytics-content.tsx
"use client";

import React from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  MessageSquare,
  Brain,
  Clock,
  Target,
  Globe,
  Phone,
  Mail,
  Smartphone,
  Megaphone,
} from "lucide-react";
import type { AnalyticsData } from "./page";

interface ChannelMeta {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  color: string;
}

const CHANNEL_META: Record<string, ChannelMeta> = {
  WHATSAPP: { icon: Phone, label: "WhatsApp", color: "#22c55e" },
  EMAIL: { icon: Mail, label: "Email", color: "#6366f1" },
  SMS: { icon: Smartphone, label: "SMS", color: "#a855f7" },
};

function fmtDec(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + "k";
  return n.toLocaleString("pt-BR");
}

export function AnalyticsContent({ data }: { data: AnalyticsData }) {
  const aiRate = data.totalMessages > 0 ? Math.round((data.aiMessages / data.totalMessages) * 1000) / 10 : 0;

  const metrics = [
    { label: "Total de Leads", value: fmt(data.totalLeads), icon: Users, accent: "stats-card-brand" },
    { label: "Conversas", value: fmt(data.totalConversations), icon: MessageSquare, accent: "stats-card-recover" },
    { label: "Taxa de Conversão", value: `${fmtDec(data.conversionRate)}%`, icon: Target, accent: "stats-card-amber" },
    { label: "Mensagens IA", value: `${fmtDec(aiRate)}%`, icon: Brain, accent: "stats-card-rose" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display font-semibold text-2xl tracking-tight">Analytics</h1>
        <p className="font-body text-sm text-muted-foreground mt-1">Performance detalhada do sistema</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger-children">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`stats-card ${m.accent} p-5`}>
              <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center mb-3">
                <Icon className="w-4.5 h-4.5 text-muted-foreground" />
              </div>
              <p className="font-display text-[28px] font-bold tracking-tight leading-none">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium font-body">{m.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Campaign table */}
        <div className="xl:col-span-2 glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <BarChart3 className="w-4 h-4 text-(--chip-brand-text)" />
            <h2 className="font-display text-sm font-semibold">Performance por Campanha</h2>
          </div>

          {data.campaignPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Campanha", "Leads", "Convertidos", "Taxa"].map((h) => (
                      <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3 px-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.campaignPerformance.map((c) => (
                    <tr key={c.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-5 text-xs font-medium">{c.name}</td>
                      <td className="py-3.5 px-5 text-xs text-muted-foreground">{fmt(c.leads)}</td>
                      <td className="py-3.5 px-5 text-xs text-muted-foreground">{c.converted}</td>
                      <td className="py-3.5 px-5">
                        <span className="font-display text-sm font-semibold text-(--chip-brand-text)">{fmtDec(c.rate)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 pb-5 py-12 text-center">
              <Megaphone className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-body">Nenhuma campanha para exibir</p>
            </div>
          )}
        </div>

        {/* Channel breakdown */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <Globe className="w-4 h-4 text-(--chip-brand-text)" />
            <h2 className="font-display text-sm font-semibold">Por Canal</h2>
          </div>

          {data.channelBreakdown.length > 0 ? (
            <div className="px-5 pb-5 space-y-4">
              {data.channelBreakdown.map((ch) => {
                const meta = CHANNEL_META[ch.channel] || CHANNEL_META.WHATSAPP;
                const ChannelIcon = meta.icon;
                return (
                  <div key={ch.channel} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: `${meta.color}15` }}
                        >
                          <ChannelIcon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                        </div>
                        <span className="text-xs font-medium">{meta.label}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{ch.count} · {fmtDec(ch.percentage)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ch.percentage}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 pb-5 py-8 text-center">
              <p className="text-xs text-muted-foreground font-body">Nenhum canal conectado</p>
            </div>
          )}

          {/* AI summary */}
          <div className="px-5 pb-5">
            <div className="p-4 rounded-xl bg-(--chip-brand-bg) border border-(--chip-brand-border)">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-(--chip-brand-text)" />
                <span className="text-xs font-semibold text-(--chip-brand-text)">IA Performance</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="font-display text-lg font-bold leading-none">{fmtDec(aiRate)}%</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Respostas IA</p>
                </div>
                <div>
                  <p className="font-display text-lg font-bold leading-none">{fmtDec(data.avgResponseTime)}s</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Tempo médio</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}