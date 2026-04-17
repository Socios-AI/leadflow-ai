// src/components/dashboard/dashboard-content.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type {
  DashboardOverview,
  SparklinePoint,
  ActivityItem,
  GoalProgress,
} from "@/lib/dashboard/overview";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Brain,
  CalendarClock,
  ChevronRight,
  Clock,
  Flame,
  Headphones,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

// ══════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════

const POLL_INTERVAL_MS = 30_000;

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  CONTACTED: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  IN_CONVERSATION: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  QUALIFIED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  CONVERTED: "bg-primary/15 text-primary border-primary/30",
  LOST: "bg-red-500/10 text-red-500 border-red-500/20",
  UNRESPONSIVE: "bg-muted text-muted-foreground border-border",
};

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  WHATSAPP: Phone,
  EMAIL: Mail,
  SMS: MessageCircle,
};

const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "lead.first_contact": MessageSquare,
  "lead.converted": Target,
  "lead.escalated": Flame,
  "lead.meeting_scheduled": CalendarClock,
  "lead.meta_leadgen_received": Inbox,
  "ai.responded": Bot,
  "conversation.escalated": Flame,
};

// ══════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════

export function DashboardContent({
  initialData,
}: {
  initialData: DashboardOverview;
}) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ts = useTranslations("status");

  const [data, setData] = useState<DashboardOverview>(initialData);
  const [refreshing, setRefreshing] = useState(false);

  // ── Poll the overview endpoint every 30s (skip when tab is hidden) ──
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        setRefreshing(true);
        const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
        if (!res.ok) return;
        const fresh = (await res.json()) as DashboardOverview;
        if (!cancelled) setData(fresh);
      } catch {
        // silent — next tick will retry
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const { kpis, goal, sparklines, leadsByDay14d, recentLeads, campaigns, channelDistribution, activity } = data;

  const kpiCards = useMemo(
    () => [
      {
        key: "leads",
        label: t("stats.totalLeads"),
        value: kpis.totalLeads,
        format: "int" as const,
        sub: `${kpis.leadsThisMonth} ${t("stats.thisMonth")}`,
        change: kpis.leadsChange,
        icon: Users,
        tone: "indigo" as const,
        series: sparklines.leads7d,
      },
      {
        key: "active",
        label: t("stats.activeConversations"),
        value: kpis.activeConversations,
        format: "int" as const,
        sub: `${kpis.messagesToday} ${t("stats.messagesToday")}`,
        change: null,
        icon: Headphones,
        tone: "amber" as const,
        series: sparklines.messages7d,
      },
      {
        key: "conversion",
        label: t("stats.conversionRate"),
        value: kpis.conversionRate,
        format: "percent" as const,
        sub: `${kpis.convertedTotal} ${t("stats.converted")}`,
        change: null,
        icon: TrendingUp,
        tone: "emerald" as const,
        series: null,
      },
      {
        key: "ai",
        label: t("stats.aiRate"),
        value: kpis.aiResponseRate,
        format: "percent" as const,
        sub: `${kpis.messagesThisMonth} ${t("stats.messages")}`,
        change: kpis.messagesChange,
        icon: Brain,
        tone: "primary" as const,
        series: sparklines.messages7d,
      },
    ],
    [kpis, sparklines, t]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══ HEADER ═══ */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-0.5">
            {t("subtitle")}
          </p>
        </div>
        <LiveIndicator refreshing={refreshing} generatedAt={data.generatedAt} />
      </header>

      {/* ═══ GOAL HERO ═══ */}
      <GoalHeroCard goal={goal} />

      {/* ═══ KPI GRID ═══ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        {kpiCards.map(({ key, ...card }) => (
          <KpiCard key={key} {...card} />
        ))}
      </section>

      {/* ═══ CHART + RESPONSE TIME ═══ */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 stagger-children">
        <LeadsChart data={leadsByDay14d} className="xl:col-span-2" />
        <ResponseTimeCard
          avgSeconds={kpis.avgResponseSeconds}
          activeConversations={kpis.activeConversations}
          messagesToday={kpis.messagesToday}
        />
      </section>

      {/* ═══ TWO COLUMNS ═══ */}
      <section className="grid grid-cols-1 xl:grid-cols-5 gap-4 stagger-children">
        {/* Recent Leads */}
        <div className="xl:col-span-3 rounded-2xl border border-border bg-card overflow-hidden">
          <header className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-[14px] font-semibold text-foreground">
                {t("recentLeads.title")}
              </h2>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Últimos leads capturados pelas suas campanhas
              </p>
            </div>
            <Link
              href="/leads"
              className="text-[11.5px] text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              {t("recentLeads.viewAll")}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </header>

          {recentLeads.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("recentLeads.empty")}
              hint="Configure uma campanha para começar a receber leads aqui."
            />
          ) : (
            <ul className="divide-y divide-border/40">
              {recentLeads.map((lead, idx) => (
                <li
                  key={lead.id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors animate-fade-in-up"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <Avatar name={lead.name || lead.phone || lead.email || "??"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {lead.name || lead.phone || lead.email || tc("noName")}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {lead.email || lead.phone || lead.source.toLowerCase()}
                    </p>
                  </div>
                  <StatusPill status={lead.status} label={ts(lead.status)} />
                  <span className="text-[10.5px] text-muted-foreground/70 shrink-0 tabular-nums w-8 text-right">
                    {formatRelative(lead.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Activity Feed */}
        <div className="xl:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          <header className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[14px] font-semibold text-foreground">
                Atividade em tempo real
              </h2>
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                ao vivo
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              O que a IA e seus leads fizeram nos últimos minutos
            </p>
          </header>
          <ActivityFeed items={activity} />
        </div>
      </section>

      {/* ═══ CHANNELS + CAMPAIGNS ═══ */}
      <section className="grid grid-cols-1 xl:grid-cols-5 gap-4 stagger-children">
        {/* Channels */}
        <div className="xl:col-span-2 rounded-2xl border border-border bg-card p-5">
          <header className="mb-4">
            <h2 className="font-display text-[14px] font-semibold text-foreground">
              {t("channels.title")}
            </h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Como os leads estão conversando com você
            </p>
          </header>
          {channelDistribution.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title={t("channels.empty")}
              hint="Conecte WhatsApp ou Email para começar."
              compact
            />
          ) : (
            <ul className="space-y-3">
              {channelDistribution.map((ch, idx) => {
                const Icon = CHANNEL_ICON[ch.channel] || MessageCircle;
                return (
                  <li
                    key={ch.channel}
                    className="flex items-center gap-3 animate-fade-in-up"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12.5px] font-medium text-foreground">
                          {ch.channel}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          <CountUp value={ch.count} /> · {ch.percentage}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${ch.percentage}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Campaigns */}
        <div className="xl:col-span-3 rounded-2xl border border-border bg-card p-5">
          <header className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-[14px] font-semibold text-foreground">
                {t("campaigns.title")}
              </h2>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Performance das suas campanhas ativas
              </p>
            </div>
            <Link
              href="/campaigns"
              className="text-[11.5px] text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              {tc("viewAll")}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </header>
          {campaigns.length === 0 ? (
            <EmptyState
              icon={Target}
              title={t("campaigns.empty")}
              hint="Crie uma campanha para medir conversões aqui."
              compact
            />
          ) : (
            <ul className="space-y-2">
              {campaigns.map((c, idx) => (
                <li
                  key={c.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors animate-fade-in-up"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="w-1 h-10 rounded-full bg-primary/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {c.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.totalLeads} leads · {c.convertedLeads}{" "}
                      {t("campaigns.converted")}
                    </p>
                  </div>
                  <ConversionBadge rate={c.conversionRate} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════
// GOAL HERO CARD — "Objetivo ativo"
// ══════════════════════════════════════════════

function GoalHeroCard({ goal }: { goal: GoalProgress }) {
  const t = useTranslations();
  const tGoal = useTranslations("dashboard.goalHero");

  // Empty state — no funnel configured yet
  if (goal.isEmpty || !goal.labelKey) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-card p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center shrink-0">
          <Target className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tGoal("eyebrowEmpty")}
          </p>
          <h2 className="font-display text-[18px] font-semibold text-foreground mt-0.5">
            {tGoal("emptyTitle")}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-lg leading-relaxed">
            {tGoal("emptyDesc")}
          </p>
        </div>
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-all shrink-0"
        >
          {tGoal("emptyCta")}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </section>
    );
  }

  const label = t(`pipeline.goal.${goal.labelKey}.title` as never);
  const achievedLabel = tGoal(`metricLabel.${goal.labelKey}` as never);
  const percent = Math.min(100, Math.max(0, goal.percent));
  const performance: "good" | "warn" | "idle" =
    percent >= 20 ? "good" : percent > 0 ? "warn" : "idle";

  return (
    <section className="relative rounded-2xl border border-border bg-card p-6 overflow-hidden">
      {/* Decorative gradient glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row gap-6 md:items-end md:justify-between">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tGoal("eyebrow")}
            </p>
            <h2 className="font-display text-[22px] sm:text-[24px] font-semibold tracking-tight text-foreground mt-0.5 leading-tight">
              {label}
            </h2>
            <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
              {tGoal("progressLine", {
                achieved: goal.achieved,
                total: goal.total,
                metric: achievedLabel,
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-display text-[44px] sm:text-[52px] font-semibold leading-none tabular-nums",
                performance === "good" && "text-primary",
                performance === "warn" && "text-amber-500",
                performance === "idle" && "text-muted-foreground"
              )}
            >
              <CountUp value={percent} decimals={1} suffix="%" duration={1100} />
            </span>
          </div>
          <p className="text-[11px] font-medium text-muted-foreground">
            {tGoal(`performance.${performance}`)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative mt-6">
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000 ease-out",
              performance === "good" && "bg-primary",
              performance === "warn" && "bg-amber-500",
              performance === "idle" && "bg-muted-foreground/40"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10.5px] text-muted-foreground tabular-nums">
            {goal.achieved} / {goal.total}
          </span>
          <Link
            href="/pipeline"
            className="text-[11.5px] text-primary font-medium hover:underline inline-flex items-center gap-0.5"
          >
            {tGoal("editFunnel")}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════
// KPI CARD
// ══════════════════════════════════════════════

type Tone = "indigo" | "amber" | "emerald" | "primary";

const TONE_STYLES: Record<Tone, { bg: string; fg: string; stroke: string }> = {
  indigo: {
    bg: "bg-blue-500/10",
    fg: "text-blue-500",
    stroke: "stroke-blue-500",
  },
  amber: {
    bg: "bg-amber-500/10",
    fg: "text-amber-500",
    stroke: "stroke-amber-500",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    fg: "text-emerald-500",
    stroke: "stroke-emerald-500",
  },
  primary: {
    bg: "bg-primary/10",
    fg: "text-primary",
    stroke: "stroke-primary",
  },
};

function KpiCard({
  label,
  value,
  format,
  sub,
  change,
  icon: Icon,
  tone,
  series,
}: {
  label: string;
  value: number;
  format: "int" | "percent";
  sub: string;
  change: number | null;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  series: SparklinePoint[] | null;
}) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <div className="group relative rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-[0_0_0_1px_rgba(185,244,149,0.05)] transition-all overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn(
            "w-9 h-9 rounded-xl grid place-items-center transition-transform group-hover:scale-110",
            toneStyle.bg
          )}
        >
          <Icon className={cn("w-4 h-4", toneStyle.fg)} />
        </div>
        {change !== null && change !== 0 && <ChangePill value={change} />}
      </div>

      <p className="font-display text-[28px] font-semibold text-foreground leading-none tabular-nums">
        <CountUp
          value={value}
          suffix={format === "percent" ? "%" : ""}
          decimals={format === "percent" ? 1 : 0}
        />
      </p>
      <p className="text-[11.5px] text-foreground/80 mt-1.5 font-medium">{label}</p>
      <p className="text-[10.5px] text-muted-foreground/80 mt-0.5">{sub}</p>

      {series && series.some((s) => s.count > 0) && (
        <Sparkline
          data={series}
          className={cn("absolute bottom-0 left-0 right-0 opacity-60 group-hover:opacity-100 transition-opacity", toneStyle.stroke)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// LEADS CHART (14 days area chart, SVG inline)
// ══════════════════════════════════════════════

function LeadsChart({ data, className }: { data: SparklinePoint[]; className?: string }) {
  const total = data.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));

  const W = 600;
  const H = 140;
  const pad = { top: 16, right: 12, bottom: 24, left: 12 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: pad.left + i * step,
    y: pad.top + innerH - (d.count / max) * innerH,
    count: d.count,
    date: d.date,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x.toFixed(1) ?? 0},${(H - pad.bottom).toFixed(1)} L${points[0]?.x.toFixed(1) ?? 0},${(H - pad.bottom).toFixed(1)} Z`;

  // Day labels every ~3rd tick to avoid clutter
  const labels = points
    .map((p, i) => ({ p, show: i === 0 || i === points.length - 1 || i % 3 === 0 }))
    .filter((x) => x.show);

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-[14px] font-semibold text-foreground">
            Leads nos últimos 14 dias
          </h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            {total} {total === 1 ? "lead" : "leads"} capturados no período
          </p>
        </div>
        <span className="text-[10.5px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
          pico {max}
        </span>
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[160px]"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="leadsArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Subtle grid line at midline */}
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={pad.top + innerH / 2}
            y2={pad.top + innerH / 2}
            stroke="hsl(var(--border))"
            strokeDasharray="3 4"
            strokeWidth={1}
          />

          <path d={areaPath} fill="url(#leadsArea)" />
          <path
            d={linePath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.count > 0 ? 2.5 : 0}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--card))"
              strokeWidth={1.5}
            />
          ))}

          {labels.map((l, i) => (
            <text
              key={i}
              x={l.p.x}
              y={H - 6}
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
              textAnchor="middle"
              className="font-dm-sans"
            >
              {formatDayShort(l.p.date)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// RESPONSE TIME CARD
// ══════════════════════════════════════════════

function ResponseTimeCard({
  avgSeconds,
  activeConversations,
  messagesToday,
}: {
  avgSeconds: number;
  activeConversations: number;
  messagesToday: number;
}) {
  const hasData = avgSeconds > 0;
  const label = hasData ? formatDuration(avgSeconds) : "—";
  const benchmark = avgSeconds > 0 && avgSeconds < 60 ? "instantâneo" : avgSeconds < 300 ? "abaixo de 5 min" : "acima de 5 min";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <header className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-display text-[13px] font-semibold text-foreground">
            Tempo médio de resposta
          </h2>
          <p className="text-[10.5px] text-muted-foreground">últimos 30 dias</p>
        </div>
      </header>

      <div className="flex items-end gap-2 mb-4">
        <span className="font-display text-[36px] font-semibold text-foreground leading-none tabular-nums">
          {label}
        </span>
        {hasData && (
          <span className="text-[11px] text-muted-foreground mb-1.5">
            {benchmark}
          </span>
        )}
      </div>

      <div className="mt-auto space-y-2.5">
        <MiniStat
          icon={Headphones}
          label="Conversas ativas agora"
          value={activeConversations}
        />
        <MiniStat
          icon={MessageCircle}
          label="Mensagens hoje"
          value={messagesToday}
        />
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[12px]">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">
        <CountUp value={value} />
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════
// ACTIVITY FEED
// ══════════════════════════════════════════════

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="px-5 pb-6">
        <EmptyState
          icon={Clock}
          title="Sem atividade ainda"
          hint="Os eventos da IA aparecem aqui assim que o primeiro lead chegar."
          compact
        />
      </div>
    );
  }
  return (
    <ul className="px-5 pb-5 space-y-3.5">
      {items.map((item, idx) => {
        const Icon = EVENT_ICON[item.event] || Activity;
        return (
          <li
            key={item.id}
            className="flex items-start gap-3 animate-fade-in-up"
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            <div className="w-7 h-7 rounded-full bg-muted grid place-items-center shrink-0 mt-0.5">
              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-foreground leading-snug">
                {describeEvent(item)}
              </p>
              <p className="text-[10.5px] text-muted-foreground mt-0.5 tabular-nums">
                {formatRelative(item.createdAt)} atrás
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function describeEvent(item: ActivityItem): string {
  const d = item.data || {};
  switch (item.event) {
    case "lead.first_contact":
      return `IA enviou primeira mensagem ${d.channel ? `via ${String(d.channel).toLowerCase()}` : ""}`;
    case "lead.converted":
      return "Lead convertido";
    case "lead.escalated":
    case "conversation.escalated":
      return "Conversa escalada para humano";
    case "lead.meeting_scheduled":
      return `Reunião agendada no calendário`;
    case "lead.meta_leadgen_received":
      return d.campaignName
        ? `Novo lead da campanha ${String(d.campaignName)}`
        : "Novo lead recebido da Meta";
    case "ai.responded":
      return "IA respondeu uma mensagem";
    default:
      return item.event.replace(/_/g, " ");
  }
}

// ══════════════════════════════════════════════
// REUSABLE BITS
// ══════════════════════════════════════════════

function LiveIndicator({
  refreshing,
  generatedAt,
}: {
  refreshing: boolean;
  generatedAt: string;
}) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          refreshing ? "bg-amber-500" : "bg-primary animate-pulse"
        )}
      />
      <span>
        atualizado {formatRelative(generatedAt)} atrás
      </span>
    </div>
  );
}

function ChangePill({ value }: { value: number }) {
  const up = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md",
        up
          ? "bg-emerald-500/10 text-emerald-500"
          : "bg-red-500/10 text-red-500"
      )}
    >
      {up ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {Math.abs(value)}%
    </span>
  );
}

function ConversionBadge({ rate }: { rate: number }) {
  const good = rate >= 10;
  const ok = rate > 0 && rate < 10;
  return (
    <span
      className={cn(
        "text-[13px] font-semibold tabular-nums px-2.5 py-1 rounded-lg border shrink-0",
        good
          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          : ok
            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
            : "bg-muted text-muted-foreground border-border"
      )}
    >
      {rate}%
    </span>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const cls = STATUS_STYLE[status] || STATUS_STYLE.NEW;
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 uppercase tracking-wide",
        cls
      )}
    >
      {label}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const ini = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";
  const hue = hashHue(name);
  return (
    <div
      className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold text-foreground"
      style={{
        backgroundColor: `hsl(${hue}, 60%, 20% / 0.5)`,
        color: `hsl(${hue}, 70%, 70%)`,
      }}
    >
      {ini}
    </div>
  );
}

function Sparkline({
  data,
  className,
}: {
  data: SparklinePoint[];
  className?: string;
}) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 100;
  const H = 24;
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: i * step,
    y: H - (d.count / max) * H,
  }));
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("w-full h-6", className)}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("text-center", compact ? "py-6" : "py-10 px-5")}>
      <div className="w-10 h-10 rounded-xl bg-muted grid place-items-center mx-auto mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-medium text-foreground mb-1">{title}</p>
      {hint && (
        <p className="text-[11.5px] text-muted-foreground max-w-xs mx-auto">
          {hint}
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// COUNT UP ANIMATION
// ══════════════════════════════════════════════

function CountUp({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prev.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("pt-BR");

  return (
    <>
      {formatted}
      {suffix}
    </>
  );
}

// ══════════════════════════════════════════════
// FORMATTERS
// ══════════════════════════════════════════════

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatDayShort(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s === 0 ? `${m}min` : `${m}min ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
