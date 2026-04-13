// src/app/[locale]/(dashboard)/campaigns/campaigns-content.tsx
"use client";

import React, { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Users,
  TrendingUp,
  FileText,
  Image,
  Video,
  Type,
  Clock,
  ChevronRight,
  Megaphone,
} from "lucide-react";
import type { CampaignItem } from "./page";

interface CampaignsContentProps {
  campaigns: CampaignItem[];
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  PAUSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  COMPLETED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  DRAFT: "bg-gray-500/10 text-[hsl(var(--muted-foreground))] border-gray-500/20",
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  VIDEO: Video,
  IMAGE: Image,
  TEXT: Type,
  DIGITAL: Megaphone,
};

export function CampaignsContent({ campaigns }: CampaignsContentProps) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-2xl tracking-tight">
            {t("campaigns.title")}
          </h1>
          <p className="font-body text-sm text-[var(--text-secondary)] mt-1">
            {t("campaigns.subtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/campaigns/new`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--brand)] text-black font-body font-medium text-sm hover:bg-[var(--brand-dim)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("campaigns.addCampaign")}
        </Link>
      </div>

      {/* Campaign Cards */}
      {campaigns.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {campaigns.map((campaign) => {
            const TypeIcon = TYPE_ICON[campaign.type] || Megaphone;
            const convRate =
              campaign.totalLeads > 0
                ? Math.round((campaign.convertedLeads / campaign.totalLeads) * 100)
                : 0;

            return (
              <Link
                key={campaign.id}
                href={`/${locale}/campaigns/${campaign.id}`}
                className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 hover:border-[var(--brand)]/30 transition-all duration-300"
              >
                {/* Top row: type icon + status */}
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded-lg bg-[hsl(var(--muted))] flex items-center justify-center">
                    <TypeIcon className="w-[18px] h-[18px] text-[hsl(var(--muted-foreground))]" />
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold font-body border ${
                      STATUS_STYLE[campaign.status] || STATUS_STYLE.DRAFT
                    }`}
                  >
                    {t(`campaigns.status${campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}`)}
                  </span>
                </div>

                {/* Name */}
                <h3 className="font-display font-medium text-base leading-tight group-hover:text-[var(--brand)] transition-colors">
                  {campaign.name}
                </h3>
                {campaign.description && (
                  <p className="font-body text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                    {campaign.description}
                  </p>
                )}

                {/* Stats row */}
                <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Leads
                    </span>
                    <span className="font-body text-sm font-semibold">
                      {campaign.totalLeads}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {t("campaigns.convertedLeads")}
                    </span>
                    <span className="font-body text-sm font-semibold">
                      {campaign.convertedLeads}
                      {convRate > 0 && (
                        <span className="text-[var(--brand)] ml-1 text-xs">
                          ({convRate}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      {campaign.mediaFormat || campaign.type}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold font-body border ${
                        campaign.hasTranscription
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-gray-500/10 text-[hsl(var(--muted-foreground))] border-gray-500/20"
                      }`}
                    >
                      {campaign.hasTranscription
                        ? t("campaigns.transcriptionReady")
                        : t("campaigns.noTranscription")}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[hsl(var(--border))]">
                  <span className="font-body text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[var(--brand)] transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded-xl bg-[hsl(var(--muted))] flex items-center justify-center mx-auto mb-4">
            <Megaphone className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
          </div>
          <p className="font-display font-medium text-base">
            {t("campaigns.noCampaigns")}
          </p>
          <p className="font-body text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {t("campaigns.noCampaignsDescription")}
          </p>
          <Link
            href={`/${locale}/campaigns/new`}
            className="inline-flex items-center gap-2 px-4 py-2.5 mt-5 rounded-lg bg-[var(--brand)] text-black font-body font-medium text-sm hover:bg-[var(--brand-dim)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("campaigns.addCampaign")}
          </Link>
        </div>
      )}
    </div>
  );
}