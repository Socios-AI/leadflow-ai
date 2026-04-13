// src/components/dashboard/dashboard-content.tsx
"use client";

import React from "react";
import {
  Users,
  MessageSquare,
  Target,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Activity,
  Bot,
  Phone,
  Mail,
  Smartphone,
  Megaphone,
  ArrowUpRight,
  Send,
} from "lucide-react";
import type { DashboardData } from "@/app/[locale]/(dashboard)/page";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface DashboardContentProps {
  data: DashboardData;
}

/* ═══════════════════════════════════════════
   MAPS
   ═══════════════════════════════════════════ */
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NEW: { label: "Novo", className: "chip-brand" },
  CONTACTED: { label: "Contactado", className: "chip-brand" },
  IN_CONVERSATION: { label: "Em conversa", className: "chip-brand" },
  ENGAGED: { label: "Engajado", className: "chip-recover" },
  CONVERTED: { label: "Convertido", className: "chip-recover" },
  QUALIFIED: { label: "Qualificado", className: "chip-recover" },
  LOST: { label: "Perdido", className: "chip-danger" },
  UNRESPONSIVE: { label: "Sem resposta", className: "chip-danger" },
  FOLLOW_UP: { label: "Follow-up", className: "chip-brand" },
};

const CHANNEL_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  WHATSAPP: { icon: Phone, label: "WhatsApp", color: "#22c55e" },
  EMAIL: { icon: Mail, label: "Email", color: "#6366f1" },
  SMS: { icon: Smartphone, label: "SMS", color: "#a855f7" },
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + "k";
  return n.toLocaleString("pt-BR");
}

function fmtDec(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff}min`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function initials(name: string | null): string {
  if (!name) return "??";
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */
function Chip({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || { label: status, className: "chip-brand" };
  return <span className={`chip ${c.className}`}>{c.label}</span>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  change,
  accent = "stats-card-brand",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  change?: number;
  accent?: string;
}) {
  const hasChange = change !== undefined && change !== 0;
  const up = (change ?? 0) >= 0;

  return (
    <div className={`stats-card ${accent} p-5`}>
      <div className="flex items-center justify-between mb-3.5">
        <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-muted-foreground" />
        </div>
        {hasChange && (
          <div
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border ${
              up
                ? "text-[#5eead4] bg-[rgba(20,184,166,0.1)] border-[rgba(20,184,166,0.2)]"
                : "text-[#fca5a5] bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.2)]"
            }`}
          >
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {fmtDec(Math.abs(change!))}%
          </div>
        )}
      </div>
      <div className="font-space-grotesk text-[28px] font-bold text-foreground tracking-tight leading-none">
        {value}
        {suffix && (
          <span className="text-base font-medium text-muted-foreground ml-0.5">{suffix}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export function DashboardContent({ data }: DashboardContentProps) {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral da sua operação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card text-xs font-medium text-muted-foreground">
            <div className={`w-1.5 h-1.5 rounded-full ${data.activeConversations > 0 ? "bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-muted-foreground/30"}`} />
            {data.activeConversations > 0
              ? `${data.activeConversations} conversas ativas`
              : "Nenhuma conversa ativa"}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 stagger-children">
        <StatCard
          icon={Users}
          label="Total de Leads"
          value={fmt(data.totalLeads)}
          change={data.leadsChange}
          accent="stats-card-brand"
        />
        <StatCard
          icon={Send}
          label="Mensagens Este Mês"
          value={fmt(data.messagesThisMonth)}
          change={data.messagesChange}
          accent="stats-card-recover"
        />
        <StatCard
          icon={Target}
          label="Taxa de Conversão"
          value={fmtDec(data.conversionRate)}
          suffix="%"
          accent="stats-card-amber"
        />
        <StatCard
          icon={Zap}
          label="Leads Este Mês"
          value={fmt(data.leadsThisMonth)}
          change={data.leadsChange}
          accent="stats-card-rose"
        />
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3.5">
        {/* Leads Recentes — 3 cols */}
        <div className="xl:col-span-3 glass-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="font-space-grotesk text-sm font-semibold text-foreground">
                Leads Recentes
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Últimas entradas via webhook
              </p>
            </div>
            <button className="flex items-center gap-1 text-[11px] font-semibold text-[var(--chip-brand-text)] hover:underline cursor-pointer transition-colors">
              Ver todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {data.recentLeads.length > 0 ? (
            <div className="divide-y divide-border">
              {data.recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-all duration-200 cursor-pointer group"
                >
                  <div className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0 group-hover:border-[var(--glass-border-hover)] transition-colors">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {initials(lead.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground truncate">
                        {lead.name || lead.phone || lead.email || "—"}
                      </span>
                      <Chip status={lead.status} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                      {lead.phone && <span>{lead.phone}</span>}
                      {lead.phone && lead.source && (
                        <span className="opacity-30">·</span>
                      )}
                      <span>{lead.source}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                      {timeAgo(lead.createdAt)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-[var(--chip-brand-text)] transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhum lead ainda</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto">
                Leads aparecerão aqui quando chegarem via webhook da Meta
              </p>
            </div>
          )}
        </div>

        {/* Coluna direita — 2 cols */}
        <div className="xl:col-span-2 flex flex-col gap-3.5">
          {/* Canais */}
          <div className="glass-card p-5">
            <h2 className="font-space-grotesk text-sm font-semibold text-foreground">
              Canais
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">
              Distribuição de conversas
            </p>

            {data.channelDistribution.length > 0 ? (
              <div className="space-y-3.5">
                {data.channelDistribution.map((ch) => {
                  const cfg = CHANNEL_CONFIG[ch.channel];
                  const Icon = cfg?.icon || MessageSquare;
                  const color = cfg?.color || "#B9F495";
                  return (
                    <div key={ch.channel}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {cfg?.label || ch.channel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">{ch.count}</span>
                          <span className="font-space-grotesk text-sm font-semibold text-foreground">
                            {fmtDec(ch.percentage)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${Math.max(ch.percentage, 2)}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nenhuma conversa registrada
              </p>
            )}
          </div>

          {/* Campanhas */}
          <div className="glass-card overflow-hidden flex-1">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="font-space-grotesk text-sm font-semibold text-foreground">
                Campanhas
              </h2>
              <button className="flex items-center gap-1 text-[11px] font-semibold text-[var(--chip-brand-text)] hover:underline cursor-pointer transition-colors">
                Ver todas <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            {data.campaigns.length > 0 ? (
              <div className="divide-y divide-border">
                {data.campaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-all duration-200 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-[var(--chip-brand-bg)] transition-colors">
                        <Megaphone className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[var(--chip-brand-text)] transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {c.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {c.totalLeads} leads · {c.convertedLeads} convertidos
                        </p>
                      </div>
                    </div>
                    <span className="font-space-grotesk text-sm font-semibold text-[var(--chip-brand-text)] shrink-0 ml-3">
                      {fmtDec(c.conversionRate)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-2">
                  <Megaphone className="w-5 h-5 text-muted-foreground opacity-40" />
                </div>
                <p className="text-xs font-medium text-foreground">Nenhuma campanha</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Crie sua primeira campanha para começar
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 stagger-children">
        <div className="glass-card p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/20 transition-all duration-200">
          <div className="w-9 h-9 rounded-xl bg-[var(--chip-brand-bg)] border border-[var(--chip-brand-border)] flex items-center justify-center">
            <Bot className="w-4 h-4 text-[var(--chip-brand-text)]" />
          </div>
          <div>
            <p className="font-space-grotesk text-lg font-bold text-foreground leading-none">
              {fmtDec(data.aiResponseRate)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Respostas via IA</p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/20 transition-all duration-200">
          <div className="w-9 h-9 rounded-xl bg-[rgba(99,102,241,0.12)] border border-[rgba(99,102,241,0.25)] flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-[#a5b4fc]" />
          </div>
          <div>
            <p className="font-space-grotesk text-lg font-bold text-foreground leading-none">
              {fmt(data.messagesToday)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Mensagens Hoje</p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/20 transition-all duration-200">
          <div className="w-9 h-9 rounded-xl bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)] flex items-center justify-center">
            <Activity className="w-4 h-4 text-[#fbbf24]" />
          </div>
          <div>
            <p className="font-space-grotesk text-lg font-bold text-foreground leading-none">
              {fmt(data.activeChats)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Chats Ativos</p>
          </div>
        </div>
      </div>
    </div>
  );
}