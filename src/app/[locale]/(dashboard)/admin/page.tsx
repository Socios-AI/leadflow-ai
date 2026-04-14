// src/app/[locale]/(dashboard)/admin/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Shield, Building, Users, Loader2, Plus, Trash2,
  Crown, ChevronRight, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: string; name: string; slug: string; plan: string;
  memberCount: number; memberLimit: number; leadsCount: number;
  createdAt: string; ownerEmail: string | null;
}

const PLANS = ["FREE", "STARTER", "PRO", "ENTERPRISE"];

export default function AdminPage() {
  const t = useTranslations("admin");
  const locale = useLocale();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPlan, setNewPlan] = useState("FREE");
  const [newMemberLimit, setNewMemberLimit] = useState(3);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    fetch("/api/admin/accounts").then(r => r.ok ? r.json() : []).then(d => setAccounts(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim()) { showToast(t("fillRequired"), false); return; }
    setCreating(true);
    try {
      const r = await fetch("/api/admin/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), ownerEmail: newEmail.trim(), plan: newPlan, memberLimit: newMemberLimit }),
      });
      if (r.ok) {
        const acc = await r.json();
        setAccounts(p => [acc, ...p]);
        setNewName(""); setNewEmail(""); setShowCreate(false);
        showToast(t("accountCreated"), true);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || t("createError"), false);
      }
    } catch { showToast(t("connectionError"), false); }
    setCreating(false);
  }

  async function handleDelete(accountId: string) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const r = await fetch(`/api/admin/accounts?id=${accountId}`, { method: "DELETE" });
      if (r.ok) { setAccounts(p => p.filter(a => a.id !== accountId)); showToast(t("accountDeleted"), true); }
      else showToast(t("deleteError"), false);
    } catch { showToast(t("connectionError"), false); }
  }

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || (a.ownerEmail && a.ownerEmail.toLowerCase().includes(q));
  });

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {toast && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
          toast.ok ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>{toast.msg}</div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Shield className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-dm-sans">{t("subtitle")}</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-brand text-[13px] font-semibold">
          <Plus className="w-4 h-4" />{t("createAccount")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t("totalAccounts"), value: accounts.length, icon: Building },
          { label: t("totalUsers"), value: accounts.reduce((s, a) => s + a.memberCount, 0), icon: Users },
          { label: t("totalLeads"), value: accounts.reduce((s, a) => s + a.leadsCount, 0), icon: Crown },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <s.icon className="w-4 h-4 text-muted-foreground mb-2" />
            <p className="font-space-grotesk text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground font-dm-sans">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.02] p-5 space-y-4">
          <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("newAccount")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("companyName")} *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("companyNamePlaceholder")}
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("ownerEmail")} *</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="admin@empresa.com"
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("plan")}</label>
              <select value={newPlan} onChange={e => setNewPlan(e.target.value)}
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none cursor-pointer font-dm-sans">
                {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("userLimit")}</label>
              <input type="number" min="1" max="100" value={newMemberLimit} onChange={e => setNewMemberLimit(parseInt(e.target.value) || 1)}
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30 font-dm-sans" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-border text-[12px] font-medium text-muted-foreground hover:bg-muted cursor-pointer">{t("cancelBtn")}</button>
            <button onClick={handleCreate} disabled={creating}
              className="flex items-center gap-2 px-5 py-2 rounded-xl btn-brand text-[12px] font-semibold disabled:opacity-50">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}{t("create")}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("searchPlaceholder")}
          className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans" />
      </div>

      {/* Accounts list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Building className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">{t("noAccounts")}</p>
          </div>
        ) : filtered.map(acc => (
          <div key={acc.id} className="flex items-center gap-4 px-5 py-4 border-b border-border/30 hover:bg-muted/20 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Building className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-foreground truncate">{acc.name}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{acc.plan}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-dm-sans">
                {acc.ownerEmail || "—"} · {acc.memberCount}/{acc.memberLimit} {t("users")} · {acc.leadsCount} leads · {new Date(acc.createdAt).toLocaleDateString(locale)}
              </p>
            </div>
            <button onClick={() => handleDelete(acc.id)}
              className="p-2 text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/5 rounded-lg cursor-pointer transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}