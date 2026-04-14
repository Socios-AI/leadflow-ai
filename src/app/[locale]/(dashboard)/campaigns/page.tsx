// src/app/[locale]/(dashboard)/campaigns/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Plus, Target, Users, TrendingUp, Clock, ChevronRight,
  Globe, Loader2, Video, Image, Type, CheckCircle,
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
  VIDEO: Video, IMAGE: Image, TEXT: Type, DIGITAL: Target,
};

const FLAGS: Record<string, string> = {
  BR: "🇧🇷", US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸",
  CZ: "🇨🇿", AT: "🇦🇹", CH: "🇨🇭", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴", PT: "🇵🇹",
  IT: "🇮🇹", NL: "🇳🇱", JP: "🇯🇵", AU: "🇦🇺", CA: "🇨🇦",
};

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  PAUSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  COMPLETED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  DRAFT: "bg-muted text-muted-foreground border-border",
};

export default function CampaignsPage() {
  const t = useTranslations("campaigns");
  const locale = useLocale();
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
    const key = `status.${status}` as any;
    try { return t(key); } catch { return status; }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 font-dm-sans">{t("subtitle")}</p>
        </div>
        <Link href="/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-brand text-sm font-semibold">
          <Plus className="w-4 h-4" />{t("addCampaign")}
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Target className="w-6 h-6 text-muted-foreground/40" />
          </div>
          <p className="font-space-grotesk text-base font-semibold text-foreground">{t("noCampaigns")}</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto font-dm-sans">{t("noCampaignsDescription")}</p>
          <Link href="/campaigns/new" className="inline-flex items-center gap-2 px-5 py-2.5 mt-5 rounded-xl btn-brand text-sm font-semibold">
            <Plus className="w-4 h-4" />{t("registerCampaign")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const Ic = TYPE_ICON[c.type] || Target;
            const rate = c.totalLeads > 0 ? Math.round((c.convertedLeads / c.totalLeads) * 100) : 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                    <Ic className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    {c.hasTranscription && (
                      <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" />{t("aiAnalyzed")}
                      </span>
                    )}
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", STATUS_CLS[c.status] || STATUS_CLS.DRAFT)}>
                      {statusLabel(c.status)}
                    </span>
                  </div>
                </div>

                <h3 className="font-space-grotesk font-semibold text-[15px] text-foreground leading-tight group-hover:text-primary transition-colors">{c.name}</h3>
                {c.description && <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2 font-dm-sans">{c.description}</p>}

                {c.countries && c.countries.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-3">
                    <Globe className="w-3 h-3 text-muted-foreground/50" />
                    <div className="flex gap-0.5">
                      {c.countries.map((code) => <span key={code} className="text-[13px]" title={code}>{FLAGS[code] || code}</span>)}
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 font-dm-sans"><Users className="w-3.5 h-3.5" />{t("leads")}</span>
                    <span className="text-[13px] font-semibold text-foreground">{c.totalLeads}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 font-dm-sans"><TrendingUp className="w-3.5 h-3.5" />{t("converted")}</span>
                    <span className="text-[13px] font-semibold text-foreground">
                      {c.convertedLeads}
                      {rate > 0 && <span className="text-primary ml-1 text-[11px]">({rate}%)</span>}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-dm-sans">
                    <Clock className="w-3 h-3" />{new Date(c.createdAt).toLocaleDateString(locale)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}