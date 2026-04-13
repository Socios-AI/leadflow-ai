// src/app/[locale]/(dashboard)/leads/leads-content.tsx
"use client";

import React, { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Users,
  Search,
  Clock,
  Phone,
  Mail,
  Tag,
  ChevronRight,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadItem } from "./page";

interface LeadsContentProps {
  leads: LeadItem[];
}

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  CONTACTED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  IN_CONVERSATION: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  QUALIFIED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  CONVERTED: "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20",
  LOST: "bg-red-500/10 text-red-500 border-red-500/20",
  UNRESPONSIVE: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const STATUSES = [
  "ALL",
  "NEW",
  "CONTACTED",
  "IN_CONVERSATION",
  "QUALIFIED",
  "CONVERTED",
  "LOST",
  "UNRESPONSIVE",
] as const;

export function LeadsContent({ leads }: LeadsContentProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        !search ||
        lead.name?.toLowerCase().includes(search.toLowerCase()) ||
        lead.email?.toLowerCase().includes(search.toLowerCase()) ||
        lead.phone?.includes(search);

      const matchStatus =
        statusFilter === "ALL" || lead.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [leads, search, statusFilter]);

  // Count per status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: leads.length };
    leads.forEach((l) => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    return counts;
  }, [leads]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          {t("leads.title")}
        </h1>
        <p className="font-body text-sm text-[var(--text-secondary)] mt-1">
          {t("leads.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search") + "..."}
            className="pl-9 font-body"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium font-body whitespace-nowrap transition-colors border",
                statusFilter === status
                  ? "bg-[var(--brand)] text-black border-[var(--brand)]"
                  : "bg-transparent text-[var(--text-secondary)] border-[hsl(var(--border))] hover:border-[var(--brand)]/50"
              )}
            >
              {status === "ALL" ? "All" : t(`leads.status.${status}`)}
              <span className="ml-1 opacity-60">
                {statusCounts[status] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Leads list */}
      {filtered.length > 0 ? (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="divide-y divide-[hsl(var(--border))]">
            {filtered.map((lead, i) => (
              <Link
                key={lead.id}
                href={`/${locale}/leads/${lead.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-[hsl(var(--muted))]/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold font-body text-[hsl(var(--muted-foreground))]">
                      {getInitials(lead.name)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium leading-none truncate">
                      {lead.name || t("leads.noName")}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {lead.phone && (
                        <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.email && (
                        <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                      )}
                      {lead.campaignName && (
                        <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {lead.campaignName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Score */}
                  {lead.score > 0 && (
                    <div className="w-8 h-8 rounded-full border-2 border-[var(--brand)]/30 flex items-center justify-center">
                      <span className="font-body text-[10px] font-semibold text-[var(--brand)]">
                        {lead.score}
                      </span>
                    </div>
                  )}

                  {/* Status */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold font-body border ${
                      STATUS_STYLE[lead.status] || STATUS_STYLE.NEW
                    }`}
                  >
                    {t(`leads.status.${lead.status}`)}
                  </span>

                  {/* Time */}
                  <span className="font-body text-[11px] text-[var(--text-secondary)] flex items-center gap-1 min-w-[60px] justify-end">
                    <Clock className="w-3 h-3" />
                    {formatRelative(lead.createdAt)}
                  </span>

                  <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[var(--brand)] transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded-xl bg-[hsl(var(--muted))] flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
          </div>
          <p className="font-display font-medium text-base">
            {t("leads.noLeads")}
          </p>
          <p className="font-body text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {t("leads.noLeadsDescription")}
          </p>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string | null): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatRelative(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
  if (diffMin < 10080) return `${Math.floor(diffMin / 1440)}d`;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}