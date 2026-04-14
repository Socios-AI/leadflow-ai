// src/components/dashboard/dashboard-content.tsx
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Users, MessageSquare, TrendingUp, Brain, Phone, Mail,
  Smartphone, Clock, ArrowUpRight, ArrowDownRight, Target,
  Headphones, ChevronRight, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

/* ═══ TYPES ═══ */
export interface DashboardData {
  totalLeads: number;
  leadsThisMonth: number;
  leadsChange: number;
  activeConversations: number;
  conversionRate: number;
  messagesThisMonth: number;
  messagesChange: number;
  aiResponseRate: number;
  avgResponseTime: number;
  conversionAssist: number;
  messagesToday: number;
  activeChats: number;
  recentLeads: { id: string; name: string | null; phone: string | null; email: string | null; status: string; source: string; createdAt: string }[];
  campaigns: { id: string; name: string; totalLeads: number; convertedLeads: number; conversionRate: number }[];
  channelDistribution: { channel: string; count: number; percentage: number }[];
}

/* ═══ HELPERS ═══ */
const STATUS: Record<string, { cls: string }> = {
  NEW: { cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  CONTACTED: { cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  IN_CONVERSATION: { cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  QUALIFIED: { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  CONVERTED: { cls: "bg-primary/10 text-primary border-primary/20" },
  LOST: { cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  UNRESPONSIVE: { cls: "bg-muted text-muted-foreground border-border" },
};

const CH_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  WHATSAPP: Phone, EMAIL: Mail, SMS: Smartphone,
};

function ini(n: string | null) { if (!n) return "??"; return n.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2); }
function ago(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return "now"; if (m < 60) return `${m}min`; if (m < 1440) return `${Math.floor(m / 60)}h`; return `${Math.floor(m / 1440)}d`; }

function ChangeIndicator({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", up ? "text-emerald-400" : "text-red-400")}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value)}%
    </span>
  );
}

/* ═══ COMPONENT ═══ */
export function DashboardContent({ data }: { data: DashboardData }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ts = useTranslations("status");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-dm-sans">{t("subtitle")}</p>
      </div>

      {/* ═══ Stats Grid ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: t("stats.totalLeads"),
            value: data.totalLeads,
            sub: `${data.leadsThisMonth} ${t("stats.thisMonth")}`,
            change: data.leadsChange,
            icon: Users,
            accent: "text-blue-400",
            iconBg: "bg-blue-500/10",
          },
          {
            label: t("stats.activeConversations"),
            value: data.activeConversations,
            sub: `${data.messagesToday} ${t("stats.messagesToday")}`,
            change: null,
            icon: Headphones,
            accent: "text-amber-400",
            iconBg: "bg-amber-500/10",
          },
          {
            label: t("stats.conversionRate"),
            value: `${data.conversionRate}%`,
            sub: `${data.conversionAssist} ${t("stats.converted")}`,
            change: null,
            icon: TrendingUp,
            accent: "text-emerald-400",
            iconBg: "bg-emerald-500/10",
          },
          {
            label: t("stats.aiRate"),
            value: `${data.aiResponseRate}%`,
            sub: `${data.messagesThisMonth} ${t("stats.messages")}`,
            change: data.messagesChange,
            icon: Brain,
            accent: "text-primary",
            iconBg: "bg-primary/10",
          },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/20 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", stat.iconBg)}>
                <stat.icon className={cn("w-4 h-4", stat.accent)} />
              </div>
              {stat.change !== null && <ChangeIndicator value={stat.change} />}
            </div>
            <p className="font-space-grotesk text-2xl font-bold text-foreground leading-none">{stat.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1 font-dm-sans">{stat.label}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-dm-sans">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* ═══ Two columns ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Recent Leads — 3 cols */}
        <div className="xl:col-span-3 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("recentLeads.title")}</h2>
            <Link href="/leads" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5">
              {t("recentLeads.viewAll")}<ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {data.recentLeads.length === 0 ? (
            <div className="px-5 pb-5 py-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground font-dm-sans">{t("recentLeads.empty")}</p>
            </div>
          ) : (
            <div>
              {data.recentLeads.map(lead => {
                const st = STATUS[lead.status] || STATUS.NEW;
                return (
                  <div key={lead.id} className="flex items-center gap-3 px-5 py-3 border-t border-border/30 hover:bg-muted/20 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-muted-foreground">{ini(lead.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{lead.name || lead.phone || lead.email || tc("noName")}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{lead.email || lead.phone}</p>
                    </div>
                    <span className={cn("text-[9px] font-semibold px-2 py-0.5 rounded-md border shrink-0", st.cls)}>
                      {ts(lead.status)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">{ago(lead.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column — 2 cols */}
        <div className="xl:col-span-2 space-y-4">

          {/* Channels */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground mb-4">{t("channels.title")}</h2>
            {data.channelDistribution.length === 0 ? (
              <p className="text-[12px] text-muted-foreground font-dm-sans">{t("channels.empty")}</p>
            ) : (
              <div className="space-y-3">
                {data.channelDistribution.map(ch => {
                  const Icon = CH_ICON[ch.channel] || Phone;
                  return (
                    <div key={ch.channel} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium text-foreground">{ch.channel}</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{ch.count} ({ch.percentage}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ch.percentage}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campaigns */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("campaigns.title")}</h2>
              <Link href="/campaigns" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5">
                {tc("viewAll")}<ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {data.campaigns.length === 0 ? (
              <p className="text-[12px] text-muted-foreground font-dm-sans">{t("campaigns.empty")}</p>
            ) : (
              <div className="space-y-2.5">
                {data.campaigns.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {c.totalLeads} leads · {c.convertedLeads} {t("campaigns.converted")}
                      </p>
                    </div>
                    <span className={cn("text-[12px] font-bold tabular-nums ml-3",
                      c.conversionRate >= 10 ? "text-emerald-400" : c.conversionRate > 0 ? "text-amber-400" : "text-muted-foreground"
                    )}>
                      {c.conversionRate}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}