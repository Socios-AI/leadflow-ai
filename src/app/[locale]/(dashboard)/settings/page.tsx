// src/app/[locale]/(dashboard)/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Building, Users, Shield, Loader2, Save, CheckCircle, Trash2,
  Plus, Mail, Crown, User2, Eye, EyeOff, Key, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AccountData {
  id: string; name: string; slug: string; plan: string;
  timezone: string; locale: string; memberCount: number; memberLimit: number;
}
interface Member { id: string; userId: string; email: string; name: string | null; role: string; createdAt: string; }

const TIMEZONES = [
  "America/Sao_Paulo", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "America/Bogota", "Europe/London", "Europe/Berlin", "Europe/Madrid",
  "Europe/Lisbon", "Europe/Paris", "Europe/Rome", "Asia/Tokyo", "Australia/Sydney",
];

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.ok ? r.json() : null),
      fetch("/api/settings/members").then(r => r.ok ? r.json() : null),
    ]).then(([acc, mem]) => {
      if (acc) setAccount(acc);
      if (mem) setMembers(Array.isArray(mem) ? mem : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSaveAccount() {
    if (!account) return;
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: account.name, timezone: account.timezone, locale: account.locale }),
      });
      if (r.ok) { setSaved(true); showToast(t("accountSaved"), true); setTimeout(() => setSaved(false), 3000); }
      else showToast(t("saveError"), false);
    } catch { showToast(t("connectionError"), false); }
    setSaving(false);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) { showToast(t("enterEmail"), false); return; }
    setInviting(true);
    try {
      const r = await fetch("/api/settings/members", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (r.ok) {
        const newMember = await r.json();
        setMembers(p => [...p, newMember]);
        setInviteEmail(""); showToast(t("memberAdded"), true);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || t("inviteError"), false);
      }
    } catch { showToast(t("connectionError"), false); }
    setInviting(false);
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm(t("removeMemberConfirm"))) return;
    setRemovingId(memberId);
    try {
      const r = await fetch(`/api/settings/members?id=${memberId}`, { method: "DELETE" });
      if (r.ok) { setMembers(p => p.filter(m => m.id !== memberId)); showToast(t("memberRemoved"), true); }
      else showToast(t("removeError"), false);
    } catch { showToast(t("connectionError"), false); }
    setRemovingId(null);
  }

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 6) { showToast(t("passwordMinLength"), false); return; }
    if (newPassword !== confirmPassword) { showToast(t("passwordMismatch"), false); return; }
    setChangingPw(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (r.ok) { showToast(t("passwordChanged"), true); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
      else { const err = await r.json().catch(() => ({})); showToast(err.error || t("passwordError"), false); }
    } catch { showToast(t("connectionError"), false); }
    setChangingPw(false);
  }

  const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
    OWNER: { label: t("roles.owner"), cls: "text-primary bg-primary/10 border-primary/20" },
    ADMIN: { label: t("roles.admin"), cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    MEMBER: { label: t("roles.member"), cls: "text-muted-foreground bg-muted border-border" },
  };

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {toast && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
          toast.ok ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>{toast.msg}</div>
      )}

      <div>
        <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-dm-sans">{t("subtitle")}</p>
      </div>

      {/* ═══ Company Info ═══ */}
      {account && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("companyInfo")}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("companyName")}</label>
              <input value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })}
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30 font-dm-sans" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("plan")}</label>
              <div className="h-10 px-4 rounded-xl bg-muted flex items-center text-[13px] text-foreground font-dm-sans">
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold">{account.plan}</span>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("timezone")}</label>
              <select value={account.timezone} onChange={e => setAccount({ ...account, timezone: e.target.value })}
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none cursor-pointer font-dm-sans">
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("language")}</label>
              <select value={account.locale} onChange={e => setAccount({ ...account, locale: e.target.value })}
                className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none cursor-pointer font-dm-sans">
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>
          <button onClick={handleSaveAccount} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><CheckCircle className="w-4 h-4" />{t("saved")}</> : <><Save className="w-4 h-4" />{tc("save")}</>}
          </button>
        </div>
      )}

      {/* ═══ Team Members ═══ */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("teamMembers")}</h2>
          </div>
          {account && <span className="text-[11px] text-muted-foreground">{members.length}/{account.memberLimit} {t("members")}</span>}
        </div>

        {/* Member list */}
        <div className="space-y-1.5">
          {members.map(m => {
            const role = ROLE_LABELS[m.role] || ROLE_LABELS.MEMBER;
            return (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {m.role === "OWNER" ? <Crown className="w-3.5 h-3.5 text-primary" /> : <User2 className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">{m.name || m.email}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                </div>
                <span className={cn("text-[9px] font-semibold px-2 py-0.5 rounded border shrink-0", role.cls)}>{role.label}</span>
                {m.role !== "OWNER" && (
                  <button onClick={() => handleRemoveMember(m.id)} disabled={removingId === m.id}
                    className="p-1.5 text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/5 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
                    {removingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Invite */}
        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("addMember")}</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder={t("emailPlaceholder")}
                className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans"
                onKeyDown={e => e.key === "Enter" && handleInvite()} />
            </div>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              className="h-10 px-3 rounded-xl bg-muted border border-transparent text-[12px] text-muted-foreground focus:outline-none cursor-pointer font-dm-sans">
              <option value="MEMBER">{t("roles.member")}</option>
              <option value="ADMIN">{t("roles.admin")}</option>
            </select>
            <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
              className="h-10 px-4 rounded-xl btn-brand text-[12px] font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}{t("add")}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Change Password ═══ */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("changePassword")}</h2>
        </div>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("currentPassword")}</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="w-full h-10 px-4 pr-10 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30 font-dm-sans" />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer">
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("newPassword")}</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30 font-dm-sans" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("confirmPassword")}</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30 font-dm-sans" />
          </div>
          <button onClick={handleChangePassword} disabled={changingPw}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50">
            {changingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}{t("updatePassword")}
          </button>
        </div>
      </div>
    </div>
  );
}