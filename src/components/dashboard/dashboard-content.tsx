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
  ArrowRight,
  Bot,
  Brain,
  CalendarClock,
  ChevronRight,
  Flame,
  Headphones,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plug,
  Plus,
  Rocket,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-500",
  CONTACTED: "bg-sky-500/10 text-sky-500",
  IN_CONVERSATION: "bg-amber-500/10 text-amber-500",
  QUALIFIED: "bg-emerald-500/10 text-emerald-500",
  CONVERTED: "bg-primary/15 text-foreground",
  LOST: "bg-red-500/10 text-red-500",
  UNRESPONSIVE: "bg-muted text-muted-foreground",
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
  userName,
}: {
  initialData: DashboardOverview;
  userName?: string;
}) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const ts = useTranslations("status");

  const [data, setData] = useState<DashboardOverview>(initialData);

  // Silent polling — the dashboard refreshes itself without surfacing a
  // "last updated" indicator. A professional product just stays current.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
        if (!res.ok) return;
        const fresh = (await res.json()) as DashboardOverview;
        if (!cancelled) setData(fresh);
      } catch {
        /* silent */
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const {
    kpis,
    goal,
    leadsByDay14d,
    recentLeads,
    campaigns,
    channelDistribution,
    activity,
  } = data;

  const isEmpty =
    kpis.totalLeads === 0 &&
    kpis.activeConversations === 0 &&
    kpis.messagesThisMonth === 0;

  return (
    <div className="space-y-8">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={userName}
      />

      {isEmpty ? (
        <WelcomeScreen t={t} />
      ) : (
        <>
          {/* Hero KPI + Goal */}
          <PrimarySection goal={goal} kpis={kpis} t={t} />

          {/* Lead chart (stand alone, big) */}
          <LeadsChart data={leadsByDay14d} />

          {/* Two columns */}
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <RecentLeadsCard
              leads={recentLeads}
              t={t}
              tc={tc}
              ts={ts}
              className="lg:col-span-3"
            />
            <ActivityCard items={activity} className="lg:col-span-2" />
          </section>

          {/* Channels + Campaigns */}
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <ChannelsCard
              channels={channelDistribution}
              t={t}
              className="lg:col-span-2"
            />
            <CampaignsCard
              campaigns={campaigns}
              t={t}
              tc={tc}
              className="lg:col-span-3"
            />
          </section>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// HEADER
// ══════════════════════════════════════════════

function Header({
  subtitle,
  userName,
}: {
  // `title` is intentionally unused, the greeting acts as the page title now.
  title?: string;
  subtitle: string;
  userName?: string;
}) {
  const greeting = useGreeting();
  const firstName = (userName || "").trim().split(/\s+/)[0] || "";
  const tCampaigns = useTranslations("campaigns");
  const today = useMemo(() => {
    try {
      return new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
    } catch {
      return "";
    }
  }, []);
  return (
    <header className="relative flex items-end justify-between gap-6 flex-wrap pb-2">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/75">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_hsl(142_70%_45%_/_0.18)]" />
          {today}
        </div>
        <h1 className="font-display text-[28px] sm:text-[34px] font-semibold tracking-tight text-foreground leading-[1.05]">
          {greeting}
          {firstName && (
            <>
              ,{" "}
              <span className="bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
                {firstName}
              </span>
            </>
          )}
        </h1>
        <p className="text-[13.5px] text-muted-foreground max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      </div>
      <div className="hidden md:flex items-center gap-2 shrink-0">
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl btn-brand text-[12.5px] font-semibold active:scale-[0.98] transition-transform"
        >
          <Plus className="w-4 h-4" />
          {tCampaigns("addCampaign")}
        </Link>
      </div>
    </header>
  );
}

function useGreeting() {
  const t = useTranslations("dashboard.greeting");
  const [g, setG] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 5) setG(t("lateNight"));
    else if (h < 12) setG(t("morning"));
    else if (h < 18) setG(t("afternoon"));
    else setG(t("evening"));
  }, [t]);
  return g;
}

// ══════════════════════════════════════════════
// PRIMARY SECTION — Goal + KPI strip
// ══════════════════════════════════════════════

function PrimarySection({
  goal,
  kpis,
  t,
}: {
  goal: GoalProgress;
  kpis: DashboardOverview["kpis"];
  t: ReturnType<typeof useTranslations>;
}) {
  const tGoal = useTranslations("dashboard.goalHero");
  const tBase = useTranslations();

  const hasGoal = !goal.isEmpty && !!goal.labelKey;
  const percent = Math.min(100, Math.max(0, goal.percent));

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-6 sm:p-7 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-10">
        {/* Goal hero */}
        <div className="flex items-center gap-5">
          {hasGoal ? (
            <Donut value={percent} />
          ) : (
            <div className="w-[88px] h-[88px] rounded-full border-2 border-dashed border-border grid place-items-center shrink-0">
              <Target className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {hasGoal ? tGoal("eyebrow") : tGoal("eyebrowEmpty")}
            </p>
            {hasGoal ? (
              <>
                <h2 className="font-display text-[19px] sm:text-[22px] font-semibold text-foreground tracking-tight leading-tight">
                  {tBase(`pipeline.goal.${goal.labelKey}.title` as never)}
                </h2>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="font-display text-[32px] font-semibold text-foreground tabular-nums leading-none">
                    <CountUp value={percent} decimals={1} suffix="%" />
                  </span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    {goal.achieved}/{goal.total}
                  </span>
                </div>
                <Link
                  href="/pipeline"
                  className="text-[11.5px] text-primary font-medium hover:underline inline-flex items-center gap-0.5 mt-2"
                >
                  {tGoal("editFunnel")}
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </>
            ) : (
              <>
                <h2 className="font-display text-[19px] sm:text-[22px] font-semibold text-foreground tracking-tight leading-tight">
                  {tGoal("emptyTitle")}
                </h2>
                <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-md">
                  {tGoal("emptyDesc")}
                </p>
                <Link
                  href="/pipeline"
                  className="inline-flex items-center gap-1.5 mt-3 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90"
                >
                  {tGoal("emptyCta")}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </>
            )}
          </div>
        </div>

        {/* KPI strip, vertical on mobile, 2x2 on desktop */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:border-l lg:border-border lg:pl-10">
          <Stat
            value={kpis.totalLeads}
            label={t("stats.totalLeads")}
            icon={Users}
          />
          <Stat
            value={kpis.activeConversations}
            label={t("stats.activeConversations")}
            icon={Headphones}
          />
          <Stat
            value={kpis.conversionRate}
            label={t("stats.conversionRate")}
            icon={TrendingUp}
            isPercent
          />
          <Stat
            value={kpis.aiResponseRate}
            label={t("stats.aiRate")}
            icon={Brain}
            isPercent
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  icon: Icon,
  isPercent,
}: {
  value: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isPercent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="font-display text-[26px] sm:text-[28px] font-semibold text-foreground tabular-nums leading-none">
        <CountUp value={value} decimals={isPercent ? 1 : 0} suffix={isPercent ? "%" : ""} />
      </p>
    </div>
  );
}

function Donut({ value }: { value: number }) {
  return (
    <div
      className="relative w-[88px] h-[88px] rounded-full grid place-items-center shrink-0"
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${value}%, hsl(var(--muted)) 0)`,
      }}
    >
      <div className="absolute inset-1 rounded-full bg-card grid place-items-center">
        <Target className="w-5 h-5 text-primary" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// LEADS CHART
// ══════════════════════════════════════════════

function LeadsChart({ data }: { data: SparklinePoint[] }) {
  const total = data.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));

  const W = 1200;
  const H = 200;
  const pad = { top: 20, right: 16, bottom: 28, left: 16 };
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

  const labels = points
    .map((p, i) => ({ p, show: i === 0 || i === points.length - 1 || i % 3 === 0 }))
    .filter((x) => x.show);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <header className="flex items-end justify-between mb-5">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Últimos 14 dias
          </p>
          <h2 className="font-display text-[19px] font-semibold text-foreground tracking-tight">
            {total} {total === 1 ? "lead capturado" : "leads capturados"}
          </h2>
        </div>
        <span className="text-[10.5px] text-muted-foreground tabular-nums">
          pico {max}
        </span>
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[200px]"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="leadsArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={pad.top + innerH / 2}
            y2={pad.top + innerH / 2}
            stroke="hsl(var(--border))"
            strokeDasharray="2 6"
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
            className="animate-draw"
          />

          {points.map((p, i) =>
            p.count > 0 ? (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3}
                fill="hsl(var(--card))"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
              />
            ) : null
          )}

          {labels.map((l, i) => (
            <text
              key={i}
              x={l.p.x}
              y={H - 6}
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
              textAnchor="middle"
            >
              {formatDayShort(l.p.date)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════
// RECENT LEADS
// ══════════════════════════════════════════════

function RecentLeadsCard({
  leads,
  t,
  tc,
  ts,
  className,
}: {
  leads: DashboardOverview["recentLeads"];
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  ts: ReturnType<typeof useTranslations>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card overflow-hidden", className)}>
      <header className="px-5 pt-5 pb-3 flex items-end justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Captação
          </p>
          <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
            {t("recentLeads.title")}
          </h2>
        </div>
        <Link
          href="/leads"
          className="text-[11.5px] text-primary font-medium hover:underline inline-flex items-center gap-0.5"
        >
          {t("recentLeads.viewAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {leads.length === 0 ? (
        <Empty
          icon={Users}
          title={t("recentLeads.empty")}
          hint="Configure uma campanha para começar a receber leads aqui."
        />
      ) : (
        <ul className="divide-y divide-border/40">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="row-interactive px-5 py-3 flex items-center gap-3 cursor-pointer animate-fade-in-up"
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
              <Pill cls={STATUS_STYLE[lead.status] || STATUS_STYLE.NEW}>
                {ts(lead.status)}
              </Pill>
              <span className="text-[10.5px] text-muted-foreground/70 shrink-0 tabular-nums w-9 text-right">
                {formatRelative(lead.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// ACTIVITY FEED
// ══════════════════════════════════════════════

function ActivityCard({
  items,
  className,
}: {
  items: ActivityItem[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card overflow-hidden", className)}>
      <header className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Tempo real
            </p>
            <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
              Atividade
            </h2>
          </div>
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="relative w-1.5 h-1.5 rounded-full bg-primary text-primary pulse-ring" />
            ao vivo
          </span>
        </div>
      </header>
      {items.length === 0 ? (
        <Empty
          icon={Activity}
          title="Sem atividade ainda"
          hint="Os eventos da IA aparecem aqui assim que o primeiro lead chegar."
          compact
        />
      ) : (
        <ol className="relative px-5 pb-5 pt-2">
          <span className="absolute left-[33px] top-3 bottom-3 w-px bg-border/60" />
          {items.map((item, idx) => {
            const Icon = EVENT_ICON[item.event] || Activity;
            const latest = idx === 0;
            return (
              <li
                key={item.id}
                className="relative flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/30 transition-colors cursor-default animate-slide-in-right"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div
                  className={cn(
                    "relative w-7 h-7 rounded-full grid place-items-center shrink-0 z-10 mt-0.5 ring-1 transition-all",
                    latest
                      ? "bg-primary/15 text-primary ring-primary/30"
                      : "bg-muted text-muted-foreground ring-border/30"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {latest && (
                    <span className="absolute inset-0 rounded-full bg-primary/30 pulse-ring" />
                  )}
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
        </ol>
      )}
    </div>
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
      return "Reunião agendada no calendário";
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
// CHANNELS + CAMPAIGNS
// ══════════════════════════════════════════════

function ChannelsCard({
  channels,
  t,
  className,
}: {
  channels: DashboardOverview["channelDistribution"];
  t: ReturnType<typeof useTranslations>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <header className="mb-5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Distribuição
        </p>
        <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
          {t("channels.title")}
        </h2>
      </header>
      {channels.length === 0 ? (
        <Empty
          icon={MessageCircle}
          title={t("channels.empty")}
          hint="Conecte WhatsApp ou Email para começar."
          compact
        />
      ) : (
        <ul className="space-y-3">
          {channels.map((ch) => {
            const Icon = CHANNEL_ICON[ch.channel] || MessageCircle;
            return (
              <li key={ch.channel} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted grid place-items-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12.5px] font-medium text-foreground">
                      {ch.channel}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {ch.count} · {ch.percentage}%
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
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
  );
}

function CampaignsCard({
  campaigns,
  t,
  tc,
  className,
}: {
  campaigns: DashboardOverview["campaigns"];
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <header className="flex items-end justify-between mb-5">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Campanhas
          </p>
          <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
            Performance
          </h2>
        </div>
        <Link
          href="/campaigns"
          className="text-[11.5px] text-primary font-medium hover:underline inline-flex items-center gap-0.5"
        >
          {tc("viewAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </header>
      {campaigns.length === 0 ? (
        <Empty
          icon={Target}
          title={t("campaigns.empty")}
          hint="Crie uma campanha para medir conversões aqui."
          compact
        />
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
            >
              <div className="w-1 h-9 rounded-full bg-primary/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">
                  {c.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {c.totalLeads} leads · {c.convertedLeads} {t("campaigns.converted")}
                </p>
              </div>
              <ConversionBadge rate={c.conversionRate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// EMPTY / WELCOME
// ══════════════════════════════════════════════

function WelcomeScreen({ t }: { t: ReturnType<typeof useTranslations> }) {
  const steps = [
    {
      icon: Brain,
      titleKey: "empty.step1Title",
      descKey: "empty.step1Desc",
      ctaKey: "empty.step1Cta",
      href: "/pipeline",
      tone: "from-violet-500/15 to-violet-500/5 text-violet-400 ring-violet-500/20",
    },
    {
      icon: Plug,
      titleKey: "empty.step2Title",
      descKey: "empty.step2Desc",
      ctaKey: "empty.step2Cta",
      href: "/channels/whatsapp",
      tone: "from-emerald-500/15 to-emerald-500/5 text-emerald-400 ring-emerald-500/20",
    },
    {
      icon: Target,
      titleKey: "empty.step3Title",
      descKey: "empty.step3Desc",
      ctaKey: "empty.step3Cta",
      href: "/campaigns",
      tone: "from-primary/20 to-primary/5 text-primary ring-primary/25",
    },
  ];

  return (
    <section className="space-y-6">
      {/* Hero: refined, premium feel, no centered card-in-a-page */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-primary/[0.07] blur-[100px]" />
          <div className="absolute -bottom-32 -left-20 w-[360px] h-[360px] rounded-full bg-primary/[0.04] blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.6) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse at top right, black 30%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-primary/12 border border-primary/25 text-primary text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-5">
              <Rocket className="w-3 h-3" />
              {t("empty.eyebrow") /* falls back gracefully if key missing */}
            </div>
            <h2 className="font-display text-[26px] sm:text-[34px] font-semibold tracking-tight text-foreground leading-[1.1]">
              {t("empty.heroTitle")}
            </h2>
            <p className="text-[14px] text-muted-foreground mt-3 max-w-xl leading-relaxed">
              {t("empty.heroSubtitle")}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 text-[10.5px] font-medium text-muted-foreground/70">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <span>3 passos &middot; ~5 min</span>
          </div>
        </div>
      </div>

      {/* Steps: connected, numbered, with progress rail */}
      <div className="relative">
        <div
          aria-hidden
          className="hidden md:block absolute top-[34px] left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-border to-transparent"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {steps.map((s, i) => (
            <Link
              key={s.titleKey}
              href={s.href}
              prefetch
              className="group card-interactive relative rounded-2xl bg-card p-5 shadow-elevated block"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl grid place-items-center bg-gradient-to-br ring-1 transition-transform group-hover:scale-105",
                    s.tone
                  )}
                >
                  <s.icon className="w-5 h-5" />
                </div>
                <span className="font-display text-[28px] font-semibold tabular-nums text-muted-foreground/15 leading-none">
                  0{i + 1}
                </span>
              </div>
              <h3 className="font-display text-[15px] font-semibold text-foreground tracking-tight mb-1.5 group-hover:text-primary transition-colors">
                {t(s.titleKey)}
              </h3>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-4">
                {t(s.descKey)}
              </p>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
                {t(s.ctaKey)}
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════
// PRIMITIVES
// ══════════════════════════════════════════════

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wide",
        cls
      )}
    >
      {children}
    </span>
  );
}

function ConversionBadge({ rate }: { rate: number }) {
  const good = rate >= 10;
  const ok = rate > 0 && rate < 10;
  return (
    <span
      className={cn(
        "text-[12.5px] font-semibold tabular-nums px-2.5 py-1 rounded-md shrink-0",
        good
          ? "bg-emerald-500/10 text-emerald-500"
          : ok
            ? "bg-amber-500/10 text-amber-500"
            : "bg-muted text-muted-foreground"
      )}
    >
      {rate}%
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??";
  const hue = hashHue(name);
  return (
    <div
      className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold ring-1 ring-border/60"
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 25% / 0.5), hsl(${(hue + 40) % 360}, 60%, 18% / 0.5))`,
        color: `hsl(${hue}, 70%, 75%)`,
      }}
    >
      {initials}
    </div>
  );
}

function Empty({
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
    <div className={cn("text-center", compact ? "py-8" : "py-12 px-5")}>
      <div className="w-10 h-10 rounded-xl bg-muted grid place-items-center mx-auto mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-medium text-foreground mb-1">{title}</p>
      {hint && (
        <p className="text-[11.5px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

function CountUp({
  value,
  duration = 700,
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
      const e = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - e, 3);
      setDisplay(from + (to - from) * eased);
      if (e < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
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

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

// (kept for type compatibility with older imports — Zap unused but harmless)
void Zap;
