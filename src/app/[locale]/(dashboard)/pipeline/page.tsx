// src/app/[locale]/(dashboard)/pipeline/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Instagram,
  Loader2,
  Mail,
  Phone,
  Save,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Target,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

interface PipelineConfig {
  template: string;
  goal: string;
  firstContact: string;
  primaryChannel: string;
  secondaryChannel: string;
  transferPhone: string;
  transferMessage: string;
  calendarEnabled: boolean;
  calendarEmail: string;
  followUpEnabled: boolean;
  followUpAttempts: number;
  followUpInterval: number;
  humanApproval: boolean;
  webhookId: string;
}

const DEFAULT_CONFIG: PipelineConfig = {
  template: "",
  goal: "",
  firstContact: "immediate",
  primaryChannel: "WHATSAPP",
  secondaryChannel: "",
  transferPhone: "",
  transferMessage: "",
  calendarEnabled: false,
  calendarEmail: "",
  followUpEnabled: true,
  followUpAttempts: 3,
  followUpInterval: 24,
  humanApproval: false,
  webhookId: "",
};

type TemplateId =
  | "form_lp"
  | "whatsapp_direct"
  | "quiz_external"
  | "social_dm"
  | "lp_followup"
  | "manual_outbound";

const PROACTIVE_TEMPLATES: TemplateId[] = [
  "form_lp",
  "quiz_external",
  "lp_followup",
  "manual_outbound",
];
const NEEDS_WEBHOOK_TEMPLATES: TemplateId[] = [
  "form_lp",
  "quiz_external",
  "lp_followup",
];

const TEMPLATE_OPTIONS: {
  id: TemplateId;
  icon: React.ComponentType<{ className?: string }>;
  k: string;
  proactive: boolean;
}[] = [
  { id: "form_lp", icon: FileText, k: "formProactive", proactive: true },
  { id: "whatsapp_direct", icon: Phone, k: "whatsappReactive", proactive: false },
  { id: "quiz_external", icon: Globe, k: "quizProactive", proactive: true },
  { id: "social_dm", icon: Instagram, k: "socialReactive", proactive: false },
  { id: "lp_followup", icon: Mail, k: "emailNurture", proactive: true },
  { id: "manual_outbound", icon: Users, k: "manualOutbound", proactive: true },
];

const GOAL_OPTIONS: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  k: string;
}[] = [
  { id: "close_sale", icon: ShoppingCart, k: "closeSale" },
  { id: "schedule_meeting", icon: Calendar, k: "scheduleMeeting" },
  { id: "qualify_transfer", icon: UserCheck, k: "qualifyTransfer" },
  { id: "collect_send", icon: FileText, k: "collectSend" },
];

const CHANNELS: {
  id: "WHATSAPP" | "EMAIL" | "SMS";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  bg: string;
}[] = [
  { id: "WHATSAPP", icon: Phone, label: "WhatsApp", bg: "bg-[#25D366]" },
  { id: "EMAIL", icon: Mail, label: "Email", bg: "bg-blue-500" },
  { id: "SMS", icon: Smartphone, label: "SMS", bg: "bg-violet-500" },
];

const TIMING_OPTIONS = [
  { id: "immediate", labelK: "immediate", subK: "immediateSub" },
  { id: "5min", labelK: "delay5", subK: "delay5Sub" },
  { id: "15min", labelK: "delay15", subK: "delay15Sub" },
  { id: "30min", labelK: "delay30", subK: "delay30Sub" },
];

// ══════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════

export default function PipelinePage() {
  const t = useTranslations("pipeline");
  const tc = useTranslations("common");

  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Load existing pipeline ──
  useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig((prev) => ({ ...prev, ...d }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Derived ──
  const isProactive = PROACTIVE_TEMPLATES.includes(config.template as TemplateId);
  const needsTransfer = config.goal === "qualify_transfer";
  const needsCalendar = config.goal === "schedule_meeting";
  const needsWebhook = NEEDS_WEBHOOK_TEMPLATES.includes(
    config.template as TemplateId
  );

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/webhooks/leads${config.webhookId ? `?key=${config.webhookId}` : ""}`;
  }, [config.webhookId]);

  // ── Toast ──
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Template change: RESET everything downstream that depends on it ──
  function changeTemplate(newTemplate: TemplateId) {
    if (newTemplate === config.template) return;
    setConfig((prev) => ({
      ...prev,
      template: newTemplate,
      // Downstream reset
      goal: "",
      firstContact: "immediate",
      primaryChannel: "WHATSAPP",
      secondaryChannel: "",
      transferPhone: "",
      transferMessage: "",
      calendarEnabled: false,
      calendarEmail: "",
    }));
  }

  // ── Goal change: reset only fields that depend on goal ──
  function changeGoal(newGoal: string) {
    if (newGoal === config.goal) return;
    setConfig((prev) => ({
      ...prev,
      goal: newGoal,
      transferPhone: newGoal === "qualify_transfer" ? prev.transferPhone : "",
      transferMessage: newGoal === "qualify_transfer" ? prev.transferMessage : "",
      calendarEnabled: newGoal === "schedule_meeting" ? prev.calendarEnabled : false,
      calendarEmail: newGoal === "schedule_meeting" ? prev.calendarEmail : "",
    }));
  }

  // ── Save ──
  async function handleSave() {
    if (!config.template) {
      showToast(t("selectTemplateFirst"), false);
      return;
    }
    if (!config.goal) {
      showToast(t("selectGoalFirst"), false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.webhookId) setConfig((p) => ({ ...p, webhookId: d.webhookId }));
        setSaved(true);
        showToast(t("savedSuccess"), true);
        setTimeout(() => setSaved(false), 3000);
      } else showToast(t("saveError"), false);
    } catch {
      showToast(t("connectionError"), false);
    }
    setSaving(false);
  }

  function copyWebhook() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Compute stepper ──
  const completedSteps: Record<string, boolean> = {
    template: !!config.template,
    goal: !!config.goal,
    timing: !isProactive || !!config.firstContact,
    channel: !!config.primaryChannel,
    extra:
      (!needsTransfer || !!config.transferPhone) &&
      (!needsCalendar || config.calendarEnabled !== undefined) &&
      (!needsWebhook || !!config.webhookId),
  };

  const stepsForNav: { id: string; label: string; done: boolean }[] = [
    { id: "template", label: t("nav.template"), done: completedSteps.template },
    { id: "goal", label: t("nav.goal"), done: completedSteps.goal && completedSteps.template },
  ];
  if (isProactive) {
    stepsForNav.push({
      id: "timing",
      label: t("nav.timing"),
      done: completedSteps.timing && completedSteps.goal,
    });
  }
  stepsForNav.push({
    id: "channel",
    label: t("nav.channel"),
    done: completedSteps.channel && completedSteps.goal,
  });
  if (needsTransfer) {
    stepsForNav.push({
      id: "transfer",
      label: t("nav.transfer"),
      done: !!config.transferPhone,
    });
  }
  if (needsCalendar) {
    stepsForNav.push({
      id: "calendar",
      label: t("nav.calendar"),
      done: config.calendarEnabled,
    });
  }
  if (needsWebhook) {
    stepsForNav.push({
      id: "webhook",
      label: t("nav.webhook"),
      done: !!config.webhookId,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* ═══ TOAST ═══ */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
            toast.ok
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              : "bg-red-500/10 text-red-500 border-red-500/20"
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <header className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {t("eyebrow")}
            </span>
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 max-w-xl">
            {t("subtitle")}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-2 h-10 px-5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50",
            "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              {t("saved")}
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {t("saveConfig")}
            </>
          )}
        </button>
      </header>

      <div className="grid xl:grid-cols-[220px_1fr] gap-8">
        {/* ═══ STEPPER (sticky side nav) ═══ */}
        <aside className="hidden xl:block">
          <div className="sticky top-4 space-y-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-3 px-3">
              {t("stepperTitle")}
            </p>
            {stepsForNav.map((s, i) => (
              <a
                key={s.id}
                href={`#step-${s.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 text-[12.5px] text-foreground transition-colors"
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold shrink-0 transition-colors",
                    s.done
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {s.done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                <span className={cn(!s.done && "text-muted-foreground")}>
                  {s.label}
                </span>
              </a>
            ))}
          </div>
        </aside>

        {/* ═══ CONTENT ═══ */}
        <div className="space-y-6 min-w-0">
          {/* STEP: TEMPLATE */}
          <StepCard
            id="step-template"
            step={1}
            title={t("step1.title")}
            desc={t("step1.desc")}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              {TEMPLATE_OPTIONS.map((tpl, idx) => {
                const sel = config.template === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => changeTemplate(tpl.id)}
                    className={cn(
                      "text-left p-4 rounded-xl border-2 transition-all animate-fade-in-up",
                      sel
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                    )}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="flex items-start justify-between mb-2.5">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg grid place-items-center transition-colors",
                          sel
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <tpl.icon className="w-4.5 h-4.5" />
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
                          tpl.proactive
                            ? "bg-primary/10 text-primary"
                            : "bg-blue-500/10 text-blue-500"
                        )}
                      >
                        {tpl.proactive ? t("tpl.proactive") : t("tpl.reactive")}
                      </span>
                    </div>
                    <h3 className="font-display text-[13.5px] font-semibold text-foreground mb-1">
                      {t(`tpl.${tpl.k}.title`)}
                    </h3>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      {t(`tpl.${tpl.k}.desc`)}
                    </p>
                  </button>
                );
              })}
            </div>
          </StepCard>

          {/* STEP: GOAL */}
          {config.template && (
            <StepCard
              id="step-goal"
              step={2}
              title={t("step2.title")}
              desc={t("step2.desc")}
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {GOAL_OPTIONS.map((g, idx) => {
                  const sel = config.goal === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => changeGoal(g.id)}
                      className={cn(
                        "text-left p-4 rounded-xl border-2 transition-all animate-fade-in-up",
                        sel
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      )}
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg grid place-items-center mb-3 transition-colors",
                          sel
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <g.icon className="w-4.5 h-4.5" />
                      </div>
                      <h3 className="font-display text-[13.5px] font-semibold text-foreground mb-1">
                        {t(`goal.${g.k}.title`)}
                      </h3>
                      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                        {t(`goal.${g.k}.desc`)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </StepCard>
          )}

          {/* STEP: TIMING (only for proactive) */}
          {config.template && config.goal && isProactive && (
            <StepCard
              id="step-timing"
              step={3}
              title={t("step3.title")}
              desc={t("step3.desc")}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {TIMING_OPTIONS.map((tm) => {
                  const sel = config.firstContact === tm.id;
                  return (
                    <button
                      key={tm.id}
                      onClick={() =>
                        setConfig((p) => ({ ...p, firstContact: tm.id }))
                      }
                      className={cn(
                        "p-3.5 rounded-xl border-2 text-center transition-all",
                        sel
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      )}
                    >
                      <Clock
                        className={cn(
                          "w-4 h-4 mx-auto mb-1.5",
                          sel ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <p className="font-display text-[12.5px] font-semibold text-foreground">
                        {t(`timing.${tm.labelK}`)}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground mt-0.5">
                        {t(`timing.${tm.subK}`)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </StepCard>
          )}

          {/* STEP: CHANNEL */}
          {config.template && config.goal && (
            <StepCard
              id="step-channel"
              step={isProactive ? 4 : 3}
              title={t("step4.title")}
              desc={t("step4.desc")}
            >
              <div className="space-y-5">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 block">
                    {t("step4.primary")}
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {CHANNELS.map((ch) => {
                      const sel = config.primaryChannel === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() =>
                            setConfig((p) => ({
                              ...p,
                              primaryChannel: ch.id,
                              secondaryChannel:
                                p.secondaryChannel === ch.id
                                  ? ""
                                  : p.secondaryChannel,
                            }))
                          }
                          className={cn(
                            "flex items-center gap-2.5 p-3.5 rounded-xl border-2 transition-all",
                            sel
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/30 hover:bg-muted/30"
                          )}
                        >
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg grid place-items-center shrink-0",
                              ch.bg
                            )}
                          >
                            <ch.icon className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-[13px] font-semibold text-foreground">
                            {ch.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 block">
                    {t("step4.secondary")}{" "}
                    <span className="normal-case tracking-normal font-normal text-muted-foreground/70">
                      — {tc("optional")}
                    </span>
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    <button
                      onClick={() =>
                        setConfig((p) => ({ ...p, secondaryChannel: "" }))
                      }
                      className={cn(
                        "p-3 rounded-xl border-2 transition-all text-[12px] font-medium",
                        config.secondaryChannel === ""
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border hover:border-primary/30 text-muted-foreground hover:bg-muted/30"
                      )}
                    >
                      {t("step4.none")}
                    </button>
                    {CHANNELS.filter(
                      (c) => c.id !== config.primaryChannel
                    ).map((ch) => {
                      const sel = config.secondaryChannel === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() =>
                            setConfig((p) => ({ ...p, secondaryChannel: ch.id }))
                          }
                          className={cn(
                            "p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-[12px] font-medium",
                            sel
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border hover:border-primary/30 text-muted-foreground hover:bg-muted/30"
                          )}
                        >
                          <ch.icon className="w-4 h-4" />
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </StepCard>
          )}

          {/* STEP: TRANSFER */}
          {needsTransfer && (
            <StepCard
              id="step-transfer"
              step={isProactive ? 5 : 4}
              title={t("step5transfer.title")}
              desc={t("step5transfer.desc")}
            >
              <div className="space-y-4 max-w-md">
                <Field label={`${t("step5transfer.phone")} *`}>
                  <input
                    value={config.transferPhone}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, transferPhone: e.target.value }))
                    }
                    placeholder="+5511999999999"
                    className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
                  />
                </Field>
                <Field label={t("step5transfer.message")}>
                  <textarea
                    value={config.transferMessage}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        transferMessage: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder={t("step5transfer.messagePlaceholder")}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:border-ring/30 leading-relaxed"
                  />
                </Field>
              </div>
            </StepCard>
          )}

          {/* STEP: CALENDAR */}
          {needsCalendar && (
            <StepCard
              id="step-calendar"
              step={isProactive ? 5 : 4}
              title={t("step5calendar.title")}
              desc={t("step5calendar.desc")}
            >
              <div className="space-y-4 max-w-md">
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/40">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">
                      Google Calendar
                    </span>
                  </div>
                  <Toggle
                    checked={config.calendarEnabled}
                    onChange={(v) =>
                      setConfig((p) => ({ ...p, calendarEnabled: v }))
                    }
                  />
                </div>
                {config.calendarEnabled && (
                  <>
                    <Field label={t("step5calendar.email")}>
                      <input
                        value={config.calendarEmail}
                        onChange={(e) =>
                          setConfig((p) => ({
                            ...p,
                            calendarEmail: e.target.value,
                          }))
                        }
                        placeholder="seucalendario@gmail.com"
                        className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
                      />
                    </Field>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      {t("step5calendar.hint")}{" "}
                      <Link
                        href="/settings/integrations"
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        {t("step5calendar.connectHere")}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </StepCard>
          )}

          {/* STEP: WEBHOOK (simplified) */}
          {needsWebhook && config.goal && (
            <StepCard
              id="step-webhook"
              step={
                isProactive
                  ? needsTransfer || needsCalendar
                    ? 6
                    : 5
                  : needsTransfer || needsCalendar
                    ? 5
                    : 4
              }
              title={t("webhook.title")}
              desc={t("webhook.desc")}
            >
              <div className="space-y-4">
                <Field label={t("webhook.url")}>
                  <div className="flex gap-2">
                    <div className="flex-1 h-10 px-3.5 rounded-lg bg-muted flex items-center text-[12px] font-mono text-foreground truncate select-all">
                      {webhookUrl || t("webhook.saveFirst")}
                    </div>
                    <button
                      onClick={copyWebhook}
                      disabled={!config.webhookId}
                      className="h-10 px-3 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {!config.webhookId && (
                    <p className="text-[11px] text-amber-500 mt-1.5">
                      {t("webhook.saveFirst")}
                    </p>
                  )}
                </Field>
                <Link
                  href="/settings/integrations"
                  className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                >
                  {t("webhook.openGuide")}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </StepCard>
          )}

          {/* FUNNEL PREVIEW */}
          {config.template && config.goal && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-primary" />
                <h3 className="font-display text-[13.5px] font-semibold text-foreground">
                  {t("preview.title")}
                </h3>
              </div>
              <FunnelPreview config={config} isProactive={isProactive} />
            </section>
          )}

          {/* ADVANCED */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <span className="text-[13px] font-medium text-foreground">
                {t("advanced.title")}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                showAdvanced && "rotate-180"
              )}
            />
          </button>

          {showAdvanced && (
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/40">
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {t("advanced.followUp")}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    {t("advanced.followUpDesc")}
                  </p>
                </div>
                <Toggle
                  checked={config.followUpEnabled}
                  onChange={(v) =>
                    setConfig((p) => ({ ...p, followUpEnabled: v }))
                  }
                />
              </div>
              {config.followUpEnabled && (
                <div className="grid grid-cols-2 gap-3 ml-3 pl-3 border-l-2 border-border">
                  <Field label={t("advanced.attempts")}>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={config.followUpAttempts}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          followUpAttempts: parseInt(e.target.value) || 3,
                        }))
                      }
                      className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30"
                    />
                  </Field>
                  <Field label={`${t("advanced.interval")} (h)`}>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={config.followUpInterval}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          followUpInterval: parseInt(e.target.value) || 24,
                        }))
                      }
                      className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground focus:outline-none focus:border-ring/30"
                    />
                  </Field>
                </div>
              )}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/40">
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {t("advanced.humanApproval")}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    {t("advanced.humanApprovalDesc")}
                  </p>
                </div>
                <Toggle
                  checked={config.humanApproval}
                  onChange={(v) =>
                    setConfig((p) => ({ ...p, humanApproval: v }))
                  }
                />
              </div>
            </section>
          )}

          {/* BOTTOM SAVE */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {t("saved")}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t("saveConfig")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PIECES
// ══════════════════════════════════════════════════════════════

function StepCard({
  id,
  step,
  title,
  desc,
  children,
}: {
  id?: string;
  step: number;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-border bg-card p-6 scroll-mt-4 animate-fade-in-up"
    >
      <header className="flex items-start gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary grid place-items-center text-[13px] font-bold shrink-0">
          {step}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-[16px] font-semibold text-foreground">
            {title}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-5.5 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
          checked && "translate-x-[18px]"
        )}
      />
    </button>
  );
}

function FunnelPreview({
  config,
  isProactive,
}: {
  config: PipelineConfig;
  isProactive: boolean;
}) {
  const t = useTranslations("pipeline");

  const steps: { label: string; color: string }[] = [];
  steps.push({
    label: t("funnel.leadArrives"),
    color: "bg-muted text-muted-foreground",
  });
  if (isProactive)
    steps.push({
      label: t("funnel.aiContacts"),
      color: "bg-primary/10 text-primary",
    });
  steps.push({
    label: t("funnel.conversation"),
    color: "bg-blue-500/10 text-blue-500",
  });
  steps.push({
    label: t("funnel.qualified"),
    color: "bg-amber-500/10 text-amber-500",
  });
  const g = config.goal;
  if (g === "close_sale")
    steps.push({
      label: t("funnel.saleClosed"),
      color: "bg-emerald-500/10 text-emerald-500",
    });
  else if (g === "schedule_meeting")
    steps.push({
      label: t("funnel.meetingScheduled"),
      color: "bg-emerald-500/10 text-emerald-500",
    });
  else if (g === "qualify_transfer")
    steps.push({
      label: t("funnel.transferred"),
      color: "bg-emerald-500/10 text-emerald-500",
    });
  else
    steps.push({
      label: t("funnel.proposalSent"),
      color: "bg-emerald-500/10 text-emerald-500",
    });

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <span
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0",
                s.color
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        <span>
          {t("step4.primary")}:{" "}
          <strong className="text-foreground">{config.primaryChannel}</strong>
        </span>
        {config.secondaryChannel && (
          <span>
            {t("step4.secondary")}:{" "}
            <strong className="text-foreground">
              {config.secondaryChannel}
            </strong>
          </span>
        )}
        {isProactive && (
          <span>
            {t("previewTiming")}:{" "}
            <strong className="text-foreground">{config.firstContact}</strong>
          </span>
        )}
      </div>
    </>
  );
}
