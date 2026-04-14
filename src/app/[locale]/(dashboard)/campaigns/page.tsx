// src/app/dashboard/campaigns/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Megaphone,
  Globe,
  Users,
  TrendingUp,
  MoreHorizontal,
  Pause,
  Play,
  Eye,
  Trash2,
  BarChart3,
} from "lucide-react";

// ══════════════════════════════════════
// TYPES
// ══════════════════════════════════════
interface Campaign {
  id: string;
  name: string;
  platform: string;
  countries: string[];
  status: string;
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
  aiActive: boolean;
  createdAt: string;
}

// ══════════════════════════════════════
// MOCK DATA
// ══════════════════════════════════════
const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "1", name: "Black Friday 2024", platform: "Meta Ads", countries: ["BR"], status: "ACTIVE", totalLeads: 342, convertedLeads: 78, conversionRate: 22.8, aiActive: true, createdAt: "2024-11-20" },
  { id: "2", name: "UK Expansion", platform: "Google Ads", countries: ["GB", "DE", "CZ"], status: "ACTIVE", totalLeads: 156, convertedLeads: 41, conversionRate: 26.3, aiActive: true, createdAt: "2024-12-01" },
  { id: "3", name: "DACH Market Entry", platform: "Meta Ads", countries: ["DE", "AT", "CH"], status: "ACTIVE", totalLeads: 89, convertedLeads: 19, conversionRate: 21.3, aiActive: true, createdAt: "2024-12-15" },
  { id: "4", name: "Lançamento Premium", platform: "Meta Ads", countries: ["BR"], status: "PAUSED", totalLeads: 567, convertedLeads: 134, conversionRate: 23.6, aiActive: false, createdAt: "2024-10-01" },
  { id: "5", name: "LatAm Outreach", platform: "Google Ads", countries: ["MX", "AR", "CO"], status: "DRAFT", totalLeads: 0, convertedLeads: 0, conversionRate: 0, aiActive: false, createdAt: "2025-01-10" },
  { id: "6", name: "SaaS Launch", platform: "Landing Page", countries: ["BR", "US"], status: "COMPLETED", totalLeads: 1203, convertedLeads: 312, conversionRate: 25.9, aiActive: false, createdAt: "2024-08-15" },
];

const STATUS_CONFIG: Record<string, { label: string; chipClass: string }> = {
  ACTIVE: { label: "Ativa", chipClass: "chip-success" },
  PAUSED: { label: "Pausada", chipClass: "chip-warning" },
  DRAFT: { label: "Rascunho", chipClass: "chip-info" },
  COMPLETED: { label: "Concluída", chipClass: "chip-brand" },
};

const COUNTRY_FLAG: Record<string, string> = {
  BR: "🇧🇷", US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸",
  CZ: "🇨🇿", AT: "🇦🇹", CH: "🇨🇭", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴", PT: "🇵🇹",
};

function cn(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

// ══════════════════════════════════════
// PAGE
// ══════════════════════════════════════
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState(MOCK_CAMPAIGNS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data?.campaigns && setCampaigns(data.campaigns))
      .catch(() => {});
  }, []);

  const filtered = campaigns.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalLeads = campaigns.reduce((sum, c) => sum + c.totalLeads, 0);
  const totalConverted = campaigns.reduce((sum, c) => sum + c.convertedLeads, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight font-display">Campanhas</h1>
          <p className="text-sm text-zinc-500 mt-1 font-body">Gerencie suas campanhas de marketing</p>
        </div>
        <a
          href="/dashboard/campaigns/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold btn-brand cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Campanha
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
        {[
          { label: "Campanhas Ativas", value: activeCampaigns, icon: Megaphone, variant: "brand" },
          { label: "Total de Leads", value: totalLeads.toLocaleString("pt-BR"), icon: Users, variant: "info" },
          { label: "Leads Convertidos", value: totalConverted.toLocaleString("pt-BR"), icon: TrendingUp, variant: "warning" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`stats-card stats-card-${card.variant} p-5`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white font-display">{card.value}</p>
                  <p className="text-[12px] text-zinc-500 font-body">{card.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campanha..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body"
          />
        </div>

        <div className="flex gap-1.5">
          {["ALL", "ACTIVE", "PAUSED", "DRAFT", "COMPLETED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer",
                s === statusFilter
                  ? "bg-[#B9F495] text-black border-[#B9F495]"
                  : "bg-transparent text-zinc-500 border-white/[0.06] hover:border-[#B9F495]/30"
              )}
            >
              {s === "ALL" ? "Todas" : STATUS_CONFIG[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
        {filtered.map((campaign) => {
          const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.DRAFT;
          return (
            <div
              key={campaign.id}
              className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 hover:border-white/[0.1] transition-all group"
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-[15px] font-semibold text-white font-display truncate">{campaign.name}</h3>
                    <span className={`chip ${status.chipClass}`}>{status.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-body">
                    <span>{campaign.platform}</span>
                    <span className="text-zinc-700">·</span>
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span className="flex gap-0.5">
                        {campaign.countries.map((c) => (
                          <span key={c} title={c}>{COUNTRY_FLAG[c] || c}</span>
                        ))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI indicator */}
                {campaign.aiActive && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(185,244,149,0.08)] border border-[rgba(185,244,149,0.15)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#B9F495] animate-pulse-dot" />
                    <span className="text-[10px] font-medium text-[#B9F495]">IA Ativa</span>
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[18px] font-bold text-white font-display">{campaign.totalLeads}</p>
                  <p className="text-[10px] text-zinc-500 font-body">Leads</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[18px] font-bold text-white font-display">{campaign.convertedLeads}</p>
                  <p className="text-[10px] text-zinc-500 font-body">Convertidos</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[18px] font-bold text-[#B9F495] font-display">{campaign.conversionRate}%</p>
                  <p className="text-[10px] text-zinc-500 font-body">Conversão</p>
                </div>
              </div>

              {/* Conversion bar */}
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#B9F495] to-[#8ee060] transition-all duration-500"
                  style={{ width: `${Math.min(campaign.conversionRate * 3, 100)}%` }}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <a
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-medium text-zinc-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Detalhes
                </a>
                <a
                  href={`/dashboard/leads?campaign=${campaign.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-medium text-zinc-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  Ver Leads
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 text-zinc-700" />
          </div>
          <p className="text-sm text-zinc-400 font-body">Nenhuma campanha encontrada</p>
          <p className="text-[12px] text-zinc-600 mt-1 font-body">Crie sua primeira campanha para começar</p>
        </div>
      )}
    </div>
  );
}