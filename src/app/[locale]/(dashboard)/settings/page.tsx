// src/app/[locale]/(dashboard)/settings/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Plus,
  Shield,
  Zap,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

interface AccountInfo {
  id: string;
  name: string;
  slug: string;
  plan: "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
  timezone: string;
  locale: "pt" | "en" | "es" | "it";
  memberCount: number;
  memberLimit: number;
  createdAt: string;
}

interface ProfileInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  platformRole: "USER" | "SUPER_ADMIN" | "HIPER_ADMIN";
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  isYou: boolean;
}

interface InviteResult {
  ok: true;
  member: Member;
  existed: boolean;
  credentials: { email: string; password: string; loginUrl: string } | null;
  message: string | null;
}

type Tab = "profile" | "workspace" | "team" | "security";

// ══════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("profile");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/settings/members").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (s) {
        setAccount(s.account);
        setProfile(s.profile);
      }
      if (m?.members) setMembers(m.members);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "profile", label: t("tabs.profile"), icon: UserIcon },
    { id: "workspace", label: t("tabs.workspace"), icon: Building2 },
    { id: "team", label: t("tabs.team"), icon: Users },
    { id: "security", label: t("tabs.security"), icon: Shield },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-7">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 max-w-sm px-4 py-3 rounded-lg border text-[12.5px] font-medium shadow-lg flex items-start gap-2 animate-fade-in",
            toast.kind === "ok"
              ? "bg-primary/10 border-primary/20 text-foreground"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          )}
        >
          {toast.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 mb-1.5">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-[28px] sm:text-[32px] font-semibold tracking-tight text-foreground leading-none">
          {t("title")}
        </h1>
        <p className="text-[13.5px] text-muted-foreground mt-2 max-w-xl">
          {t("subtitle")}
        </p>
      </header>

      {/* Tab bar */}
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={cn(
              "relative px-3.5 py-2.5 -mb-px border-b-2 text-[13px] font-medium transition-colors flex items-center gap-2",
              tab === tabItem.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tabItem.icon className="w-3.5 h-3.5" />
            {tabItem.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {tab === "profile" && profile && (
        <ProfileTab
          profile={profile}
          onSave={async (name) => {
            const res = await fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ target: "profile", profileName: name }),
            });
            if (res.ok) {
              setProfile({ ...profile, name });
              showToast(t("profile.saved"));
            } else {
              showToast(t("errors.save"), "err");
            }
          }}
        />
      )}

      {tab === "workspace" && account && (
        <WorkspaceTab
          account={account}
          onSave={async (patch) => {
            const res = await fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ target: "account", ...patch }),
            });
            if (res.ok) {
              const newAccount = { ...account, ...patch };
              setAccount(newAccount);
              showToast(t("workspace.saved"));
              if (patch.locale && patch.locale !== locale) {
                router.push(`/${patch.locale}/settings`);
              }
            } else {
              showToast(t("errors.save"), "err");
            }
          }}
        />
      )}

      {tab === "team" && account && (
        <TeamTab
          members={members}
          account={account}
          locale={locale as "pt" | "en" | "es" | "it"}
          onReload={reload}
          onToast={showToast}
        />
      )}

      {tab === "security" && (
        <SecurityTab
          onChangePassword={async (newPassword) => {
            const res = await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ newPassword }),
            });
            if (res.ok) {
              showToast(t("security.passwordChanged"));
              return true;
            }
            const data = await res.json().catch(() => ({}));
            const code = data.error || "save";
            showToast(t(`errors.${code}` as never) || t("errors.save"), "err");
            return false;
          }}
          onSignOut={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = `/${locale}/login`;
          }}
        />
      )}

      {/* Common: skip the unused-var warning while keeping flexibility */}
      <Hidden hint={tc("optional")} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PROFILE TAB
// ══════════════════════════════════════════════════════════════

function ProfileTab({
  profile,
  onSave,
}: {
  profile: ProfileInfo;
  onSave: (name: string) => Promise<void>;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState(profile.name || "");
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== (profile.name || "").trim() && name.trim().length > 0;
  const initials =
    (profile.name || profile.email)
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??";

  return (
    <Card title={t("profile.title")} subtitle={t("profile.subtitle")}>
      <div className="flex items-center gap-4 pb-6 border-b border-border">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 grid place-items-center text-[18px] font-display font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold text-foreground truncate">
            {profile.name || profile.email.split("@")[0]}
          </p>
          <p className="text-[12.5px] text-muted-foreground truncate">
            {profile.email}
          </p>
          {profile.platformRole !== "USER" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold mt-2",
                profile.platformRole === "HIPER_ADMIN"
                  ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                  : "bg-primary/15 text-primary border border-primary/30"
              )}
            >
              {profile.platformRole === "HIPER_ADMIN" ? (
                <Crown className="w-3 h-3" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              {profile.platformRole.replace("_", " ")}
            </span>
          )}
        </div>
      </div>

      <FormRow label={t("profile.fullName")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("profile.fullNamePlaceholder")}
          className="h-11"
        />
      </FormRow>

      <FormRow label={t("profile.email")} hint={t("profile.emailHint")}>
        <Input
          value={profile.email}
          readOnly
          disabled
          className="h-11 bg-muted/40"
        />
      </FormRow>

      <div className="flex justify-end pt-2">
        <Button
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(name.trim());
            setSaving(false);
          }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
          ) : (
            <Check className="w-4 h-4 mr-1.5" />
          )}
          {t("profile.save")}
        </Button>
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
// WORKSPACE TAB
// ══════════════════════════════════════════════════════════════

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Rome",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

function WorkspaceTab({
  account,
  onSave,
}: {
  account: AccountInfo;
  onSave: (patch: { name?: string; timezone?: string; locale?: "pt" | "en" | "es" | "it" }) => Promise<void>;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState(account.name);
  const [timezone, setTimezone] = useState(account.timezone);
  const [accountLocale, setAccountLocale] = useState(account.locale);
  const [saving, setSaving] = useState(false);

  const dirty =
    name.trim() !== account.name ||
    timezone !== account.timezone ||
    accountLocale !== account.locale;

  return (
    <div className="space-y-4">
      <Card title={t("workspace.title")} subtitle={t("workspace.subtitle")}>
        <FormRow label={t("workspace.name")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Minha Empresa"
            className="h-11"
          />
        </FormRow>

        <FormRow label={t("workspace.slug")} hint={t("workspace.slugHint")}>
          <Input value={account.slug} readOnly disabled className="h-11 bg-muted/40 font-mono text-[12.5px]" />
        </FormRow>

        <div className="grid sm:grid-cols-2 gap-3">
          <FormRow label={t("workspace.timezone")}>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label={t("workspace.language")}>
            <Select
              value={accountLocale}
              onValueChange={(v) => setAccountLocale(v as "pt" | "en" | "es" | "it")}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt">🇧🇷 Português</SelectItem>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="es">🇪🇸 Español</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              await onSave({ name: name.trim(), timezone, locale: accountLocale });
              setSaving(false);
            }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            {t("workspace.save")}
          </Button>
        </div>
      </Card>

      <Card title={t("workspace.planTitle")} subtitle={t("workspace.planSubtitle")}>
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display text-[14px] font-semibold text-foreground">
                {account.plan}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                {account.memberCount}/{account.memberLimit} {t("workspace.usersIn")}
              </p>
            </div>
          </div>
          <span className="text-[10.5px] text-muted-foreground tabular-nums">
            {t("workspace.activeSince", {
              date: new Date(account.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }),
            })}
          </span>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TEAM TAB
// ══════════════════════════════════════════════════════════════

function TeamTab({
  members,
  account,
  locale,
  onReload,
  onToast,
}: {
  members: Member[];
  account: AccountInfo;
  locale: "pt" | "en" | "es" | "it";
  onReload: () => void;
  onToast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const t = useTranslations("settings");
  const [inviteOpen, setInviteOpen] = useState(false);
  const atCap = account.memberCount >= account.memberLimit;

  return (
    <div className="space-y-4">
      <Card
        title={t("team.title")}
        subtitle={t("team.subtitle")}
        action={
          <Button onClick={() => setInviteOpen(true)} disabled={atCap}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t("team.invite")}
          </Button>
        }
      >
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <header className="px-4 py-2.5 flex items-center justify-between border-b border-border bg-muted/30">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {members.length} / {account.memberLimit} {t("team.members")}
            </p>
            {atCap && (
              <span className="text-[10.5px] text-amber-500 font-medium">
                {t("team.atCap")}
              </span>
            )}
          </header>
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} onRemove={onReload} onToast={onToast} />
            ))}
          </ul>
        </div>
      </Card>

      {inviteOpen && (
        <InviteMemberModal
          locale={locale}
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            onReload();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  member,
  onRemove,
  onToast,
}: {
  member: Member;
  onRemove: () => void;
  onToast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);

  const initials =
    (member.name || member.email)
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??";

  async function handleRemove() {
    if (!confirm(t("team.confirmRemove", { name: member.name || member.email }))) return;
    setBusy(true);
    const res = await fetch(`/api/settings/members?id=${member.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onToast(t("team.removed"));
      onRemove();
    } else {
      onToast(t("errors.save"), "err");
    }
    setBusy(false);
  }

  return (
    <li className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
      <div className="w-9 h-9 rounded-full bg-muted grid place-items-center text-[11px] font-semibold text-foreground shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-medium text-foreground truncate">
            {member.name || member.email.split("@")[0]}
          </p>
          {member.isYou && (
            <span className="text-[10px] text-muted-foreground italic">
              ({t("team.you")})
            </span>
          )}
        </div>
        <p className="text-[11.5px] text-muted-foreground truncate">
          {member.email}
        </p>
      </div>
      <RolePill role={member.role} />
      {member.role !== "OWNER" && !member.isYou && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title={t("team.remove")}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </Button>
      )}
    </li>
  );
}

function RolePill({ role }: { role: Member["role"] }) {
  const styles: Record<Member["role"], string> = {
    OWNER: "bg-primary/15 text-primary border-primary/30",
    ADMIN: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    MEMBER: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border shrink-0",
        styles[role]
      )}
    >
      {role}
    </span>
  );
}

// ── Invite modal ─────────────────────────────────────────────

function InviteMemberModal({
  locale,
  onClose,
  onCreated,
}: {
  locale: "pt" | "en" | "es" | "it";
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || undefined,
          role,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data.error || "save";
        setError(t(`errors.${code}` as never) || t("errors.save"));
        return;
      }
      setResult(data);
    } catch {
      setError(t("errors.network"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title={result ? t("team.inviteReadyTitle") : t("team.inviteTitle")}>
      {result ? (
        result.credentials && result.message ? (
          <InviteSuccessBlock result={result} onDone={onCreated} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[13px]">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">
                  {t("team.existingUserAdded")}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {result.member.email}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={onCreated}>{t("team.done")}</Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-[12.5px] text-muted-foreground">
            {t("team.inviteSubtitle")}
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <FormRow label={t("team.inviteName")}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ana Souza"
                className="h-11"
              />
            </FormRow>
            <FormRow label={t("team.inviteEmail")}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@empresa.com"
                className="h-11"
              />
            </FormRow>
          </div>

          <FormRow label={t("team.inviteRole")}>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">
                  {t("team.roleMember")}, {t("team.roleMemberDesc")}
                </SelectItem>
                <SelectItem value="ADMIN">
                  {t("team.roleAdmin")}, {t("team.roleAdminDesc")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-[12.5px] text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              {t("team.cancel")}
            </Button>
            <Button onClick={submit} disabled={submitting || !email.trim()}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="w-4 h-4 mr-1.5" />
              )}
              {t("team.create")}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function InviteSuccessBlock({
  result,
  onDone,
}: {
  result: InviteResult;
  onDone: () => void;
}) {
  const t = useTranslations("settings");
  const [copied, setCopied] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  }

  const creds = result.credentials!;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 text-[12.5px]">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">
            {t("team.inviteReady", { name: result.member.name || result.member.email })}
          </p>
          <p className="text-muted-foreground text-[11.5px] mt-0.5">
            {t("team.credsHint")}
          </p>
        </div>
      </div>

      <CopyRow label={t("team.loginUrl")} value={creds.loginUrl} onCopy={() => copy(creds.loginUrl, "url")} copied={copied === "url"} />
      <CopyRow label={t("team.email")} value={creds.email} onCopy={() => copy(creds.email, "email")} copied={copied === "email"} />

      <div className="space-y-1.5">
        <Label className="text-[11.5px] font-medium text-muted-foreground">
          {t("team.password")}
        </Label>
        <div className="flex gap-2">
          <Input
            value={creds.password}
            type={showPwd ? "text" : "password"}
            readOnly
            className="h-11 font-mono text-[13px]"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setShowPwd((v) => !v)}
          >
            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => copy(creds.password, "pwd")}
          >
            {copied === "pwd" ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11.5px] font-medium text-muted-foreground">
            {t("team.messageToSend")}
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1.5"
            onClick={() => copy(result.message!, "msg")}
          >
            {copied === "msg" ? (
              <>
                <Check className="w-3.5 h-3.5 text-primary" />
                {t("team.copied")}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {t("team.copyAll")}
              </>
            )}
          </Button>
        </div>
        <textarea
          readOnly
          value={result.message!}
          rows={9}
          className="w-full rounded-lg border border-border bg-muted/40 p-3 text-[12.5px] font-mono whitespace-pre-wrap resize-none focus:outline-none focus:border-ring"
        />
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={onDone}>{t("team.done")}</Button>
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11.5px] font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input value={value} readOnly className="h-11 font-mono text-[13px]" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={onCopy}
        >
          {copied ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SECURITY TAB
// ══════════════════════════════════════════════════════════════

function SecurityTab({
  onChangePassword,
  onSignOut,
}: {
  onChangePassword: (newPassword: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
}) {
  const t = useTranslations("settings");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    newPwd.length >= 8 && newPwd === confirmPwd;
  const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;

  async function submit() {
    setError(null);
    if (newPwd.length < 8) {
      setError(t("security.passwordMinLength"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t("security.passwordMismatch"));
      return;
    }
    setSaving(true);
    const ok = await onChangePassword(newPwd);
    if (ok) {
      setNewPwd("");
      setConfirmPwd("");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <Card title={t("security.passwordTitle")} subtitle={t("security.passwordSubtitle")}>
        <FormRow label={t("security.newPassword")} hint={t("security.newPasswordHint")}>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type={showPwd ? "text" : "password"}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              className="h-11 pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </FormRow>

        <FormRow label={t("security.confirmPassword")}>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type={showPwd ? "text" : "password"}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
              className={cn("h-11 pl-9", mismatch && "border-destructive")}
            />
          </div>
          {mismatch && (
            <p className="text-[11px] text-destructive mt-1">
              {t("security.passwordMismatch")}
            </p>
          )}
        </FormRow>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-[12.5px] text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <KeyRound className="w-4 h-4 mr-1.5" />
            )}
            {t("security.updatePassword")}
          </Button>
        </div>
      </Card>

      <Card title={t("security.sessionTitle")} subtitle={t("security.sessionSubtitle")}>
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
          <div>
            <p className="text-[13px] font-medium text-foreground">
              {t("security.signOutCurrent")}
            </p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              {t("security.signOutDesc")}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onSignOut}
            className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            {t("security.signOut")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// BUILDING BLOCKS
// ══════════════════════════════════════════════════════════════

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 py-4 flex items-end justify-between gap-3 border-b border-border">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function FormRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11.5px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80 mt-1">{hint}</p>}
    </div>
  );
}

function ModalShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl animate-fade-in-up">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-[15px] font-semibold text-foreground">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Hidden({ hint }: { hint: string }) {
  // Marker placeholder to silence unused-translator warnings while we
  // keep the translator imported (used by future fields).
  return <span className="sr-only">{hint}</span>;
}

// Keep imports alive even when not all are referenced in every branch
void Mail;
void Globe;
