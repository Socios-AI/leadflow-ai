// src/app/[locale]/(dashboard)/leads/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search, Users, Brain, Phone, Mail, X, Download,
  Loader2, ChevronRight, Clock, Target, Headphones,
  TrendingUp, Hash, Copy, Check, RefreshCw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══ TYPES ═══ */
interface Lead {
  id: string; name: string | null; email: string | null; phone: string | null;
  status: string; source: string; countryCode: string; score: number; tags: string[];
  campaignName: string | null; createdAt: string; lastContactAt: string | null;
  conversationId: string | null; channel: string | null; hasActiveConversation: boolean; isAIActive: boolean;
  firstContactFailed?: boolean;
  firstContactFailReason?: "no_whatsapp" | "instance_offline" | "other" | null;
}

/* ═══ STATUS COLORS (mapped to the new .pill-* utilities in globals.css) ═══ */
const STATUS_PILL: Record<string, string> = {
  NEW: "pill-new",
  CONTACTED: "pill-contacted",
  IN_CONVERSATION: "pill-in-conv",
  QUALIFIED: "pill-qualified",
  CONVERTED: "pill-converted",
  LOST: "pill-lost",
  UNRESPONSIVE: "pill-unresp",
};
const STATUS_DOT: Record<string, string> = {
  NEW: "bg-blue-400",
  CONTACTED: "bg-amber-400",
  IN_CONVERSATION: "bg-violet-400",
  QUALIFIED: "bg-cyan-400",
  CONVERTED: "bg-emerald-400",
  LOST: "bg-rose-400",
  UNRESPONSIVE: "bg-muted-foreground",
};

function ini(n: string | null) {
  if (!n) return "??";
  return n.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

/* ═══ PAGE ═══ */
export default function LeadsPage() {
  const t = useTranslations("leads");
  const ts = useTranslations("status");
  const tsr = useTranslations("source");
  const tc = useTranslations("common");
  const locale = useLocale();

  function ago(d: string | null): string {
    if (!d) return ",";
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return t("time.now");
    if (m < 60) return `${m}${t("time.min")}`;
    if (m < 1440) return `${Math.floor(m / 60)}${t("time.hour")}`;
    return `${Math.floor(m / 1440)}${t("time.day")}`;
  }

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [detail, setDetail] = useState<Lead | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingBulk, setRetryingBulk] = useState(false);
  const [retryToast, setRetryToast] = useState<string | null>(null);

  const reloadLeads = useCallback(async () => {
    try {
      const r = await fetch("/api/leads");
      const d = r.ok ? await r.json() : [];
      setLeads(Array.isArray(d) ? d : []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    reloadLeads().finally(() => setLoading(false));
  }, [reloadLeads]);

  const failedCount = useMemo(
    () => leads.filter((l) => l.firstContactFailed).length,
    [leads]
  );

  async function retryOne(lead: Lead) {
    if (!confirm(t("retryOneConfirm", { name: lead.name || tc("noName") }))) return;
    setRetryingId(lead.id);
    setRetryToast(null);
    try {
      const r = await fetch(`/api/leads/${lead.id}/retry-first-contact`, {
        method: "POST",
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setRetryToast(t("retryOneOk"));
        await reloadLeads();
        setDetail((cur) =>
          cur && cur.id === lead.id ? { ...cur, firstContactFailed: false } : cur
        );
      } else if (r.status === 409) {
        setRetryToast(t("retryAlreadySent"));
      } else {
        setRetryToast(d.error || t("retryError"));
      }
    } catch {
      setRetryToast(t("retryError"));
    } finally {
      setRetryingId(null);
      setTimeout(() => setRetryToast(null), 5000);
    }
  }

  async function retryAllFailed() {
    if (failedCount === 0) return;
    if (!confirm(t("retryAllConfirm", { count: failedCount }))) return;
    setRetryingBulk(true);
    setRetryToast(null);
    try {
      const r = await fetch("/api/leads/retry-failed-first-contacts", {
        method: "POST",
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setRetryToast(t("retryAllOk", { count: d.retried ?? 0 }));
        await reloadLeads();
      } else {
        setRetryToast(d.error || t("retryError"));
      }
    } catch {
      setRetryToast(t("retryError"));
    } finally {
      setRetryingBulk(false);
      setTimeout(() => setRetryToast(null), 6000);
    }
  }

  const filtered = useMemo(() => {
    return leads.filter(l => {
      const q = search.toLowerCase();
      const ok = !q ||
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q));
      return ok &&
        (statusFilter === "ALL" || l.status === statusFilter) &&
        (sourceFilter === "ALL" || l.source === sourceFilter);
    });
  }, [leads, search, statusFilter, sourceFilter]);

  const statuses = [...new Set(leads.map(l => l.status))];
  const sources = [...new Set(leads.map(l => l.source))];
  const total = leads.length;
  const active = leads.filter(l => l.hasActiveConversation).length;
  const converted = leads.filter(l => l.status === "CONVERTED").length;
  const rate = total > 0 ? Math.round((converted / total) * 100) : 0;

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1400);
    } catch {
      // silent
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight">
              {t("title")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1 font-dm-sans">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {failedCount > 0 && (
              <button
                onClick={retryAllFailed}
                disabled={retryingBulk}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-[12.5px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-all cursor-pointer disabled:opacity-60"
              >
                {retryingBulk ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {t("retryAllButton", { count: failedCount })}
              </button>
            )}
            <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-[12.5px] font-medium text-muted-foreground bg-muted/60 border border-border hover:bg-muted hover:text-foreground transition-all cursor-pointer">
              <Download className="w-3.5 h-3.5" />
              {t("exportCSV")}
            </button>
          </div>
        </div>

        {retryToast && (
          <div className="px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-[12.5px] text-foreground font-dm-sans">
            {retryToast}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: t("totalLeads"), value: total, icon: Users, ring: "bg-blue-500/15 text-blue-400", border: "shadow-elevated" },
            { label: t("inService"), value: active, icon: Headphones, ring: "bg-amber-500/15 text-amber-400", border: "shadow-elevated" },
            { label: t("converted"), value: converted, icon: TrendingUp, ring: "bg-emerald-500/15 text-emerald-400", border: "shadow-elevated" },
            { label: t("conversionRate"), value: `${rate}%`, icon: Target, ring: "bg-primary/15 text-primary", border: "shadow-elevated" },
          ].map(s => (
            <div
              key={s.label}
              className={cn(
                "card-interactive rounded-2xl bg-card p-4 flex items-center gap-3",
                s.border
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", s.ring)}>
                <s.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="kpi-number text-[22px] font-semibold text-foreground leading-none">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-dm-sans mt-1">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="input-refined pl-9 h-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input-refined h-10 cursor-pointer max-w-[180px] text-muted-foreground"
          >
            <option value="ALL">{t("allStatus")}</option>
            {statuses.map(s => <option key={s} value={s}>{ts(s)}</option>)}
          </select>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="input-refined h-10 cursor-pointer max-w-[180px] text-muted-foreground"
          >
            <option value="ALL">{t("allSources")}</option>
            {sources.map(s => <option key={s} value={s}>{tsr(s)}</option>)}
          </select>
          {(search || statusFilter !== "ALL" || sourceFilter !== "ALL") && (
            <button
              onClick={() => { setSearch(""); setStatusFilter("ALL"); setSourceFilter("ALL"); }}
              className="h-10 px-3 rounded-xl text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer font-dm-sans inline-flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" />{t("clear")}
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-elevated">
          <div className="hidden lg:grid grid-cols-[2.5fr_1.5fr_1fr_0.8fr_0.6fr_60px] gap-3 px-5 py-3 border-b border-border bg-muted/40">
            {[t("lead"), t("campaignSource"), "Status", t("lastContact"), t("score"), ""].map(h => (
              <span key={h} className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.12em] font-dm-sans">{h}</span>
            ))}
          </div>

          {loading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="skeleton h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-line w-44" />
                    <div className="skeleton-line w-32 opacity-70" />
                  </div>
                  <div className="skeleton-line w-20 hidden lg:block" />
                  <div className="skeleton-line w-16 hidden lg:block" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-[14px] font-semibold text-foreground">{t("noLeads")}</p>
              <p className="text-[12px] text-muted-foreground mt-1 font-dm-sans max-w-xs">{search ? t("tryOtherTerm") : t("noLeadsDesc")}</p>
            </div>
          ) : (
            <div>
              {filtered.map((lead) => {
                const pill = STATUS_PILL[lead.status] || STATUS_PILL.NEW;
                const dot = STATUS_DOT[lead.status] || STATUS_DOT.NEW;
                return (
                  <button
                    key={lead.id}
                    onClick={() => setDetail(lead)}
                    className="row-interactive w-full grid grid-cols-1 lg:grid-cols-[2.5fr_1.5fr_1fr_0.8fr_0.6fr_60px] gap-3 px-5 py-3 border-b border-border/30 cursor-pointer text-left items-center"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center ring-1 ring-border/50">
                          <span className="text-[11px] font-bold text-muted-foreground">{ini(lead.name)}</span>
                        </div>
                        {lead.hasActiveConversation && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-emerald-400 shadow-sm" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium text-foreground truncate">{lead.name || tc("noName")}</p>
                          {lead.countryCode && (
                            <span className="text-[10px] font-mono text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/60 leading-none">
                              {lead.countryCode}
                            </span>
                          )}
                          {lead.isAIActive && <Brain className="w-3 h-3 text-primary shrink-0" />}
                        </div>
                        <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">{lead.email || lead.phone || t("noContact")}</p>
                      </div>
                    </div>
                    <div className="hidden lg:block min-w-0">
                      <p className="text-[12.5px] text-foreground truncate">{lead.campaignName || ","}</p>
                      <p className="text-[10.5px] text-muted-foreground mt-0.5">{tsr(lead.source)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("pill", pill)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
                        {ts(lead.status)}
                      </span>
                      {lead.firstContactFailed && (
                        <span
                          title={
                            lead.firstContactFailReason === "no_whatsapp"
                              ? t("noWhatsappTip")
                              : lead.firstContactFailReason === "instance_offline"
                                ? t("instanceOfflineTip")
                                : t("firstContactFailedTip")
                          }
                          className={cn(
                            "inline-flex items-center justify-center w-5 h-5 rounded-md",
                            lead.firstContactFailReason === "no_whatsapp"
                              ? "bg-rose-500/15 text-rose-500"
                              : "bg-amber-500/15 text-amber-500"
                          )}
                        >
                          <AlertTriangle className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="hidden lg:flex items-center gap-1 text-[11.5px] text-muted-foreground">
                      <Clock className="w-3 h-3 opacity-60" />{ago(lead.lastContactAt || lead.createdAt)}
                    </div>
                    <div className="hidden lg:flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted/80 rounded-full overflow-hidden max-w-[60px]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${lead.score}%`,
                            background: lead.score >= 80
                              ? "hsl(var(--primary))"
                              : lead.score >= 50 ? "#fbbf24" : "#f87171",
                          }}
                        />
                      </div>
                      <span className="text-[11.5px] text-muted-foreground font-medium tabular-nums">{lead.score}</span>
                    </div>
                    <div className="hidden lg:flex justify-end">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!loading && (
          <p className="text-[11px] text-muted-foreground/60 text-center font-dm-sans">
            {filtered.length} {t("ofTotal")} {total} leads
          </p>
        )}
      </div>

      {/* ═══ DRAWER ═══ */}
      {detail && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 animate-fade-in"
            onClick={() => setDetail(null)}
          />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-[460px] bg-card border-l border-border/80 z-50 overflow-y-auto shadow-floating animate-in slide-in-from-right duration-300">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center">
                    <span className="text-[14px] font-bold text-primary">{ini(detail.name)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-[17px] font-semibold text-foreground tracking-tight">{detail.name || tc("noName")}</h2>
                      {detail.countryCode && (
                        <span className="text-[10px] font-mono text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/60 leading-none">
                          {detail.countryCode}
                        </span>
                      )}
                    </div>
                    <span className={cn("pill mt-1.5", STATUS_PILL[detail.status] || STATUS_PILL.NEW)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[detail.status] || STATUS_DOT.NEW)} />
                      {ts(detail.status)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="eyebrow">{t("contact")}</h3>
                <div className="space-y-1.5">
                  {detail.email && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 border border-border/40">
                      <Mail className="w-4 h-4 text-muted-foreground/70" />
                      <span className="text-[13px] text-foreground font-dm-sans">{detail.email}</span>
                    </div>
                  )}
                  {detail.phone && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 border border-border/40">
                      <Phone className="w-4 h-4 text-muted-foreground/70" />
                      <span className="text-[13px] text-foreground font-dm-sans">{detail.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="eyebrow">{t("details")}</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: t("campaign"), value: detail.campaignName || "," },
                    { label: t("source"), value: tsr(detail.source) },
                    { label: t("country"), value: detail.countryCode },
                    { label: t("score"), value: `${detail.score}/100` },
                    { label: t("channel"), value: detail.channel || "," },
                    { label: t("arrivedAt"), value: new Date(detail.createdAt).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) },
                    { label: t("lastContact"), value: detail.lastContactAt ? ago(detail.lastContactAt) : "," },
                    { label: t("aiActive"), value: detail.isAIActive ? t("yes") : t("no") },
                  ].map(item => (
                    <div key={item.label} className="px-3 py-2.5 rounded-xl bg-muted/40 border border-border/40">
                      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.12em] font-semibold">{item.label}</p>
                      <p className="text-[13px] text-foreground mt-1 font-dm-sans">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="eyebrow">{t("qualificationScore")}</h3>
                <div className="px-4 py-3.5 rounded-xl bg-muted/40 border border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-muted-foreground font-dm-sans">{t("conversionProbability")}</span>
                    <span
                      className="kpi-number text-[18px] font-semibold"
                      style={{
                        color: detail.score >= 80
                          ? "hsl(var(--primary))"
                          : detail.score >= 50 ? "#fbbf24" : "#f87171",
                      }}
                    >
                      {detail.score}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${detail.score}%`,
                        background: detail.score >= 80
                          ? "hsl(var(--primary))"
                          : detail.score >= 50 ? "#fbbf24" : "#f87171",
                      }}
                    />
                  </div>
                </div>
              </div>

              {detail.tags.length > 0 && (
                <div className="space-y-2">
                  <h3 className="eyebrow">{t("tags")}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map(tag => (
                      <span key={tag} className="text-[11px] font-medium px-2 py-1 rounded-md bg-muted/60 text-muted-foreground border border-border/60">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => copyId(detail.id)}
                className="group w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                  <span className="text-[10.5px] text-muted-foreground/60 font-mono truncate">{detail.id}</span>
                </div>
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />}
              </button>

              {detail.firstContactFailed && (
                <div className="space-y-2">
                  {detail.firstContactFailReason === "no_whatsapp" ? (
                    <div className="px-3 py-2.5 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-[11.5px] text-rose-500 font-dm-sans flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{t("noWhatsappDesc")}</span>
                    </div>
                  ) : detail.firstContactFailReason === "instance_offline" ? (
                    <div className="px-3 py-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 text-[11.5px] text-amber-500 font-dm-sans flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{t("instanceOfflineDesc")}</span>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 text-[11.5px] text-amber-500 font-dm-sans flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{t("firstContactFailedDesc")}</span>
                    </div>
                  )}
                  {detail.firstContactFailReason !== "no_whatsapp" && (
                    <button
                      onClick={() => retryOne(detail)}
                      disabled={retryingId === detail.id}
                      className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-amber-500/40 text-amber-500 text-[13px] font-semibold hover:bg-amber-500/10 transition-colors disabled:opacity-60"
                    >
                      {retryingId === detail.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {t("retryFirstContact")}
                    </button>
                  )}
                </div>
              )}

              {detail.conversationId && (
                <a
                  href="/conversations"
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-xl btn-brand text-[13px] font-semibold active:scale-[0.99] transition-transform"
                >
                  <Headphones className="w-4 h-4" />
                  {t("viewConversation")}
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
