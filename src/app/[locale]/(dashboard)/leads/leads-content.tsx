// src/app/[locale]/(dashboard)/leads/leads-content.tsx
"use client";

import React, { useState, useMemo } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import {
  Search,
  Plus,
  Eye,
  Users,
  Brain,
  Phone,
  Mail,
  X,
  Download,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadItem } from "./page";

/* ═══════════════════════════════════════════
   MAPS
   ═══════════════════════════════════════════ */
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  NEW: { label: "Novo", cls: "chip-brand" },
  CONTACTED: { label: "Contatado", cls: "chip-brand" },
  IN_CONVERSATION: { label: "Em conversa", cls: "chip-recover" },
  QUALIFIED: { label: "Qualificado", cls: "chip-recover" },
  CONVERTED: { label: "Convertido", cls: "chip-recover" },
  LOST: { label: "Perdido", cls: "chip-danger" },
  UNRESPONSIVE: { label: "Sem resposta", cls: "chip-danger" },
};

const FLAG: Record<string, string> = {
  BR: "🇧🇷", US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷",
  ES: "🇪🇸", CZ: "🇨🇿", AT: "🇦🇹", CH: "🇨🇭", MX: "🇲🇽",
  AR: "🇦🇷", CO: "🇨🇴", PT: "🇵🇹",
};

function initials(name: string | null): string {
  if (!name) return "??";
  return name.split(" ").filter(Boolean).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

function relTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff}min`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}d`;
}

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */
export function LeadsContent({ leads }: { leads: LeadItem[] }) {
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return leads.filter((l: LeadItem) => {
      const s = search.toLowerCase();
      const matchSearch = !s ||
        (l.name && l.name.toLowerCase().includes(s)) ||
        (l.email && l.email.toLowerCase().includes(s)) ||
        (l.phone && l.phone.includes(s));
      const matchStatus = statusFilter === "ALL" || l.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [leads, search, statusFilter]);

  const selected = selectedId ? leads.find((l: LeadItem) => l.id === selectedId) : null;
  const statuses = [...new Set(leads.map((l: LeadItem) => l.status))];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-semibold text-2xl tracking-tight">Leads</h1>
          <p className="font-body text-sm text-muted-foreground mt-1">{filtered.length} leads</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground bg-muted border border-border hover:bg-accent transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold btn-brand">
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou telefone..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-body"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-xl bg-muted border border-border text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer font-body"
        >
          <option value="ALL">Todos os status</option>
          {statuses.map((s: string) => (
            <option key={s} value={s}>{STATUS_MAP[s]?.label || s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 px-5 py-3 border-b border-border bg-muted/30">
          {["Lead", "Campanha", "Status", "Score", ""].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</span>
          ))}
        </div>

        <div className="divide-y divide-border/50">
          {filtered.map((lead: LeadItem) => {
            const st = STATUS_MAP[lead.status] || STATUS_MAP.NEW;
            return (
              <div
                key={lead.id}
                className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors items-center"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-semibold text-muted-foreground">{initials(lead.name)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{lead.name || "Sem nome"}</p>
                      <span className="text-xs">{FLAG[lead.countryCode] || ""}</span>
                      {lead.isAIActive && <Brain className="w-3 h-3 text-(--chip-brand-text) shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{lead.email || lead.phone}</p>
                  </div>
                </div>

                <div className="hidden md:block">
                  <p className="text-xs text-muted-foreground truncate">{lead.campaignName || "—"}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{lead.source} · {relTime(lead.createdAt)}</p>
                </div>

                <div><span className={`chip ${st.cls}`}>{st.label}</span></div>

                <div className="hidden md:block">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${lead.score}%`,
                          background: lead.score >= 80 ? "#B9F495" : lead.score >= 50 ? "#fbbf24" : "#f87171",
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium">{lead.score}</span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link
                    href={lead.hasActiveConversation ? `/${locale}/conversations` : `/${locale}/leads/${lead.id}`}
                    className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground font-body">Nenhum lead encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}