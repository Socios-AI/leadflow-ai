// src/app/[locale]/(dashboard)/campaigns/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Target, Users, TrendingUp, Clock,
  Globe, Video, Image, Type, CheckCircle, GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  platform: string | null;
  mediaUrl: string | null;
  mediaFormat: string | null;
  hasTranscription: boolean;
  totalLeads: number;
  convertedLeads: number;
  createdAt: string;
  countries?: string[];
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  VIDEO: Video,
  IMAGE: Image,
  TEXT: Type,
  DIGITAL: Target,
};

const TYPE_RING: Record<string, string> = {
  VIDEO: "bg-rose-500/15 text-rose-400",
  IMAGE: "bg-blue-500/15 text-blue-400",
  TEXT: "bg-amber-500/15 text-amber-400",
  DIGITAL: "bg-primary/15 text-foreground",
};

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  PAUSED: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  COMPLETED: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  DRAFT: "bg-muted/60 text-muted-foreground border-border",
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-emerald-400",
  PAUSED: "bg-amber-400",
  COMPLETED: "bg-blue-400",
  DRAFT: "bg-muted-foreground",
};

export default function CampaignsPage() {
  const t = useTranslations("campaigns");
  const locale = useLocale();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCampaigns(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function statusLabel(status: string): string {
    const key = `status.${status}` as Parameters<typeof t>[0];
    try {
      return t(key);
    } catch {
      return status;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-1 font-dm-sans">{t("subtitle")}</p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl btn-brand text-[13px] font-semibold active:scale-[0.98] transition-transform"
        >
          <Plus className="w-4 h-4" />
          {t("addCampaign")}
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-5 space-y-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="skeleton w-9 h-9 rounded-lg" />
                <div className="skeleton-line w-16" />
              </div>
              <div className="space-y-2">
                <div className="skeleton-line w-40" />
                <div className="skeleton-line w-56 opacity-70" />
              </div>
              <div className="pt-3 border-t border-border space-y-2">
                <div className="skeleton-line w-full" />
                <div className="skeleton-line w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-elevated">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center mx-auto mb-5 ring-1 ring-border/40 animate-float">
            <Target className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="font-display text-[16px] font-semibold text-foreground">{t("noCampaigns")}</p>
          <p className="text-[13px] text-muted-foreground mt-2 max-w-md mx-auto font-dm-sans leading-relaxed">
            {t("noCampaignsDescription")}
          </p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 h-10 px-5 mt-6 rounded-xl btn-brand text-[13px] font-semibold active:scale-[0.98] transition-transform"
          >
            <Plus className="w-4 h-4" />
            {t("registerCampaign")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const Ic = TYPE_ICON[c.type] || Target;
            const ring = TYPE_RING[c.type] || TYPE_RING.DIGITAL;
            const rate = c.totalLeads > 0 ? Math.round((c.convertedLeads / c.totalLeads) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="group card-interactive rounded-2xl bg-card p-5 shadow-elevated flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-sm", ring)}>
                    <Ic className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {c.hasTranscription && (
                      <span className="flex items-center gap-1 text-[9.5px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" />
                        {t("aiAnalyzed")}
                      </span>
                    )}
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border tracking-wide",
                      STATUS_CLS[c.status] || STATUS_CLS.DRAFT
                    )}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[c.status] || STATUS_DOT.DRAFT)} />
                      {statusLabel(c.status)}
                    </span>
                  </div>
                </div>

                <h3 className="font-display font-semibold text-[15px] text-foreground leading-snug group-hover:text-primary transition-colors">
                  {c.name}
                </h3>
                {c.description && (
                  <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2 font-dm-sans leading-relaxed">
                    {c.description}
                  </p>
                )}

                {c.countries && c.countries.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-3">
                    <Globe className="w-3 h-3 text-muted-foreground/50" />
                    <div className="flex flex-wrap gap-1">
                      {c.countries.map((code) => (
                        <span
                          key={code}
                          className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground border border-border/40"
                          title={code}
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <div className="grid grid-cols-2 gap-3 px-3 py-3 rounded-xl bg-muted/30 border border-border/40">
                    <div>
                      <div className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.12em] font-semibold flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {t("leads")}
                      </div>
                      <div className="kpi-number text-[18px] font-semibold text-foreground mt-1">{c.totalLeads}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.12em] font-semibold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {t("converted")}
                      </div>
                      <div className="kpi-number text-[18px] font-semibold text-foreground mt-1">
                        {c.convertedLeads}
                        {rate > 0 && <span className="text-primary ml-1 text-[11px] font-medium">({rate}%)</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-dm-sans">
                    <Clock className="w-3 h-3 opacity-60" />
                    {new Date(c.createdAt).toLocaleDateString(locale)}
                  </span>
                  {/* Configure THIS campaign's funnel. stopPropagation +
                      preventDefault so it doesn't follow the card's link. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/pipeline?campaignId=${c.id}`);
                    }}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Configurar funil
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
