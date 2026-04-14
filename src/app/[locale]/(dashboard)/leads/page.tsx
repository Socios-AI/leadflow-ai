// src/app/[locale]/(dashboard)/leads/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search, Users, Brain, Phone, Mail, X, Download,
  Loader2, ChevronRight, Clock, Target, Headphones,
  TrendingUp, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══ TYPES ═══ */
interface Lead {
  id: string; name: string | null; email: string | null; phone: string | null;
  status: string; source: string; countryCode: string; score: number; tags: string[];
  campaignName: string | null; createdAt: string; lastContactAt: string | null;
  conversationId: string | null; channel: string | null; hasActiveConversation: boolean; isAIActive: boolean;
}

/* ═══ CONFIG ═══ */
const STATUS_CLS: Record<string, { cls: string; dot: string }> = {
  NEW:             { cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",    dot: "bg-blue-400" },
  CONTACTED:       { cls: "bg-sky-500/10 text-sky-400 border-sky-500/20",      dot: "bg-sky-400" },
  IN_CONVERSATION: { cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  QUALIFIED:       { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  CONVERTED:       { cls: "bg-primary/10 text-primary border-primary/20",      dot: "bg-primary" },
  LOST:            { cls: "bg-red-500/10 text-red-400 border-red-500/20",      dot: "bg-red-400" },
  UNRESPONSIVE:    { cls: "bg-muted text-muted-foreground border-border",      dot: "bg-muted-foreground" },
};

const FLAG: Record<string, string> = {
  BR: "🇧🇷", US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸", CZ: "🇨🇿",
  AT: "🇦🇹", CH: "🇨🇭", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴", PT: "🇵🇹", IT: "🇮🇹",
  NL: "🇳🇱", JP: "🇯🇵", AU: "🇦🇺", CA: "🇨🇦",
};

function ini(n: string | null) { if (!n) return "??"; return n.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2); }

/* ═══ PAGE ═══ */
export default function LeadsPage() {
  const t = useTranslations("leads");
  const ts = useTranslations("status");
  const tsr = useTranslations("source");
  const tc = useTranslations("common");
  const locale = useLocale();

  function ago(d: string | null): string {
    if (!d) return "—";
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

  useEffect(() => {
    fetch("/api/leads").then(r => r.ok ? r.json() : []).then(d => setLeads(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return leads.filter(l => {
      const q = search.toLowerCase();
      const ok = !q || (l.name && l.name.toLowerCase().includes(q)) || (l.email && l.email.toLowerCase().includes(q)) || (l.phone && l.phone.includes(q));
      return ok && (statusFilter === "ALL" || l.status === statusFilter) && (sourceFilter === "ALL" || l.source === sourceFilter);
    });
  }, [leads, search, statusFilter, sourceFilter]);

  const statuses = [...new Set(leads.map(l => l.status))];
  const sources = [...new Set(leads.map(l => l.source))];
  const total = leads.length;
  const active = leads.filter(l => l.hasActiveConversation).length;
  const converted = leads.filter(l => l.status === "CONVERTED").length;
  const rate = total > 0 ? Math.round((converted / total) * 100) : 0;

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>;

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-dm-sans">{t("subtitle")}</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium text-muted-foreground bg-muted border border-border hover:bg-accent transition-colors cursor-pointer font-dm-sans">
            <Download className="w-3.5 h-3.5" />{t("exportCSV")}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: t("totalLeads"), value: total, icon: Users, accent: "text-foreground" },
            { label: t("inService"), value: active, icon: Headphones, accent: "text-amber-400" },
            { label: t("converted"), value: converted, icon: TrendingUp, accent: "text-emerald-400" },
            { label: t("conversionRate"), value: `${rate}%`, icon: Target, accent: "text-primary" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><s.icon className={cn("w-4 h-4", s.accent)} /></div>
              <div>
                <p className="font-space-grotesk text-lg font-bold text-foreground leading-none">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-dm-sans mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("searchPlaceholder")}
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 transition-all font-dm-sans" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg bg-muted border border-transparent text-[12px] text-muted-foreground focus:outline-none cursor-pointer font-dm-sans">
            <option value="ALL">{t("allStatus")}</option>
            {statuses.map(s => <option key={s} value={s}>{ts(s)}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            className="h-9 px-3 rounded-lg bg-muted border border-transparent text-[12px] text-muted-foreground focus:outline-none cursor-pointer font-dm-sans">
            <option value="ALL">{t("allSources")}</option>
            {sources.map(s => <option key={s} value={s}>{tsr(s)}</option>)}
          </select>
          {(search || statusFilter !== "ALL" || sourceFilter !== "ALL") && (
            <button onClick={() => { setSearch(""); setStatusFilter("ALL"); setSourceFilter("ALL"); }}
              className="h-9 px-3 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer font-dm-sans flex items-center gap-1">
              <X className="w-3 h-3" />{t("clear")}
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="hidden lg:grid grid-cols-[2.5fr_1.5fr_1fr_0.8fr_0.6fr_60px] gap-3 px-5 py-2.5 border-b border-border bg-muted/30">
            {[t("lead"), t("campaignSource"), "Status", t("lastContact"), t("score"), ""].map(h => (
              <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-dm-sans">{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-[14px] font-medium text-foreground">{t("noLeads")}</p>
              <p className="text-[12px] text-muted-foreground mt-1 font-dm-sans">{search ? t("tryOtherTerm") : t("noLeadsDesc")}</p>
            </div>
          ) : (
            <div>
              {filtered.map((lead) => {
                const st = STATUS_CLS[lead.status] || STATUS_CLS.NEW;
                return (
                  <button key={lead.id} onClick={() => setDetail(lead)}
                    className="w-full grid grid-cols-1 lg:grid-cols-[2.5fr_1.5fr_1fr_0.8fr_0.6fr_60px] gap-3 px-5 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer text-left items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-[11px] font-bold text-muted-foreground">{ini(lead.name)}</span>
                        </div>
                        {lead.hasActiveConversation && <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card", st.dot)} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium text-foreground truncate">{lead.name || tc("noName")}</p>
                          {FLAG[lead.countryCode] && <span className="text-[12px]">{FLAG[lead.countryCode]}</span>}
                          {lead.isAIActive && <Brain className="w-3 h-3 text-primary shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{lead.email || lead.phone || t("noContact")}</p>
                      </div>
                    </div>
                    <div className="hidden lg:block min-w-0">
                      <p className="text-[12px] text-foreground truncate">{lead.campaignName || "—"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{tsr(lead.source)}</p>
                    </div>
                    <div>
                      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border", st.cls)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />{ts(lead.status)}
                      </span>
                    </div>
                    <div className="hidden lg:flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="w-3 h-3" />{ago(lead.lastContactAt || lead.createdAt)}
                    </div>
                    <div className="hidden lg:flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[50px]">
                        <div className="h-full rounded-full transition-all" style={{ width: `${lead.score}%`, background: lead.score >= 80 ? "hsl(var(--primary))" : lead.score >= 50 ? "#fbbf24" : "#f87171" }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground font-medium tabular-nums">{lead.score}</span>
                    </div>
                    <div className="hidden lg:flex justify-end"><ChevronRight className="w-4 h-4 text-muted-foreground/30" /></div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/50 text-center font-dm-sans">
          {filtered.length} {t("ofTotal")} {total} leads
        </p>
      </div>

      {/* ═══ DRAWER ═══ */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setDetail(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-[460px] bg-card border-l border-border z-50 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[14px] font-bold text-primary">{ini(detail.name)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-space-grotesk text-[16px] font-bold text-foreground">{detail.name || tc("noName")}</h2>
                      {FLAG[detail.countryCode] && <span className="text-[14px]">{FLAG[detail.countryCode]}</span>}
                    </div>
                    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border mt-1", (STATUS_CLS[detail.status] || STATUS_CLS.NEW).cls)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", (STATUS_CLS[detail.status] || STATUS_CLS.NEW).dot)} />{ts(detail.status)}
                    </span>
                  </div>
                </div>
                <button onClick={() => setDetail(null)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted cursor-pointer transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("contact")}</h3>
                <div className="space-y-1.5">
                  {detail.email && <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50"><Mail className="w-4 h-4 text-muted-foreground/60" /><span className="text-[13px] text-foreground font-dm-sans">{detail.email}</span></div>}
                  {detail.phone && <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50"><Phone className="w-4 h-4 text-muted-foreground/60" /><span className="text-[13px] text-foreground font-dm-sans">{detail.phone}</span></div>}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("details")}</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: t("campaign"), value: detail.campaignName || "—" },
                    { label: t("source"), value: tsr(detail.source) },
                    { label: t("country"), value: `${FLAG[detail.countryCode] || ""} ${detail.countryCode}` },
                    { label: t("score"), value: `${detail.score}/100` },
                    { label: t("channel"), value: detail.channel || "—" },
                    { label: t("arrivedAt"), value: new Date(detail.createdAt).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) },
                    { label: t("lastContact"), value: detail.lastContactAt ? ago(detail.lastContactAt) : "—" },
                    { label: t("aiActive"), value: detail.isAIActive ? t("yes") : t("no") },
                  ].map(item => (
                    <div key={item.label} className="px-3 py-2.5 rounded-xl bg-muted/50">
                      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{item.label}</p>
                      <p className="text-[13px] text-foreground mt-0.5 font-dm-sans">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("qualificationScore")}</h3>
                <div className="px-3 py-3 rounded-xl bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-muted-foreground font-dm-sans">{t("conversionProbability")}</span>
                    <span className="font-space-grotesk text-[16px] font-bold" style={{ color: detail.score >= 80 ? "hsl(var(--primary))" : detail.score >= 50 ? "#fbbf24" : "#f87171" }}>{detail.score}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${detail.score}%`, background: detail.score >= 80 ? "hsl(var(--primary))" : detail.score >= 50 ? "#fbbf24" : "#f87171" }} />
                  </div>
                </div>
              </div>

              {detail.tags.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("tags")}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map(tag => <span key={tag} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">{tag}</span>)}
                  </div>
                </div>
              )}

              <div className="px-3 py-2.5 rounded-xl bg-muted/30 flex items-center gap-2">
                <Hash className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground/50 font-mono">{detail.id}</span>
              </div>

              {detail.conversationId && (
                <a href="/conversations" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-brand text-[13px] font-semibold">
                  <Headphones className="w-4 h-4" />{t("viewConversation")}
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}