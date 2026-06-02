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
  Plus,
  Save,
  ShoppingCart,
  Smartphone,
  Zap as PipelineEyebrow,
  Target,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

interface FollowUp {
  id: string;
  channel: Channel;
  delayHours: number;
  instruction: string;
}

/**
 * Closing strategy: how the AI behaves at the moment of conversion. The
 * old system only stored a high-level `goal` ("close_sale", etc.) and let
 * the LLM improvise. This is too generic — operators want concrete
 * behavior (send THIS link, ping THIS person, ask THESE questions). Four
 * modes cover the spectrum:
 *
 *  - direct_link    : AI sends a configured URL when the lead is ready.
 *  - qualify_first  : AI MUST get answers to N questions BEFORE closing.
 *  - team_handoff   : AI captures info, notifies a human, optionally waits.
 *  - auto           : AI decides between link and handoff based on context.
 */
type ClosingStrategy = "direct_link" | "qualify_first" | "team_handoff" | "auto";

interface PipelineConfig {
  template: string;
  goal: string;
  firstContact: string;
  // Multi-channel: AI sends through every channel listed, in order.
  channels: Channel[];
  // Hard language override: "auto" lets the AI guess from the lead's text;
  // anything else FORCES that language no matter what the lead writes in.
  language: string;
  firstMessageInstruction: string;
  firstMessageVariability: "instruction" | "exact";
  followUps: FollowUp[];
  transferPhone: string;
  transferMessage: string;
  calendarEnabled: boolean;
  calendarEmail: string;
  humanApproval: boolean;
  webhookId: string;
  // ── Closing strategy fields ──
  closingStrategy: ClosingStrategy;
  /** URL the AI sends when closing via link (Stripe checkout, Calendly, etc) */
  closingLink: string;
  /** Message that accompanies the link */
  closingMessage: string;
  /** Questions the AI MUST get answered before any closing action */
  qualifyingQuestions: string[];
  /** Fields the AI must capture (sent to team in handoff payload) */
  requiredInfo: string[];
  /** Email of the team member to notify on handoff */
  handoffEmail: string;
  /** Optional webhook (Slack/Discord/Make) to fire on handoff */
  handoffWebhook: string;
  /** Message AI sends to the lead while a handoff is in flight */
  handoffWaitMessage: string;
}

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "auto", label: "Auto (detect from lead)" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt", label: "Português (Portugal)" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "nl", label: "Nederlands" },
  { code: "ja", label: "日本語" },
];

const DEFAULT_CONFIG: PipelineConfig = {
  template: "",
  goal: "",
  firstContact: "immediate",
  channels: ["WHATSAPP"],
  language: "auto",
  firstMessageInstruction: "",
  firstMessageVariability: "instruction",
  followUps: [
    {
      id: "fu-default-1",
      channel: "WHATSAPP",
      delayHours: 24,
      instruction:
        "Lembre o lead do que foi enviado antes, sem repetir o texto. Chame pelo nome. Faca uma pergunta nova que avance o entendimento da necessidade dele.",
    },
  ],
  transferPhone: "",
  transferMessage: "",
  calendarEnabled: false,
  calendarEmail: "",
  humanApproval: false,
  webhookId: "",
  closingStrategy: "auto",
  closingLink: "",
  closingMessage: "",
  qualifyingQuestions: [],
  requiredInfo: [],
  handoffEmail: "",
  handoffWebhook: "",
  handoffWaitMessage: "",
};

function newFollowUpId(): string {
  return `fu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
      channels: ["WHATSAPP"],
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
    channel: config.channels.length > 0,
    firstMessage: !!config.firstMessageInstruction.trim(),
    followUps: config.followUps.length >= 0, // optional, always "done"
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
      <header className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-elevated mb-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -top-24 -right-16 w-[320px] h-[320px] rounded-full bg-primary/[0.07] blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.6) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage:
                "radial-gradient(ellipse at top right, black 25%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative p-6 sm:p-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-primary/12 border border-primary/25 text-primary text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-3">
              <PipelineEyebrow className="w-3 h-3" />
              {t("eyebrow")}
            </div>
            <h1 className="font-display text-[26px] sm:text-[30px] font-semibold tracking-tight text-foreground leading-tight">
              {t("title")}
            </h1>
            <p className="text-[13.5px] text-muted-foreground mt-2 max-w-xl leading-relaxed">
              {t("subtitle")}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-[13px] font-semibold btn-brand active:scale-[0.98] transition-transform disabled:opacity-50"
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
      </header>

      <div className="grid xl:grid-cols-[220px_1fr] gap-8">
        {/* ═══ STEPPER (sticky side nav) ═══ */}
        <aside className="hidden xl:block">
          <div className="sticky top-4 rounded-2xl border border-border bg-card p-3 shadow-elevated">
            <p className="eyebrow mb-3 px-2">{t("stepperTitle")}</p>
            <div className="relative">
              <span
                aria-hidden
                className="absolute left-[18px] top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-border to-transparent"
              />
              {stepsForNav.map((s, i) => (
                <a
                  key={s.id}
                  href={`#step-${s.id}`}
                  className="relative flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/40 text-[12.5px] text-foreground transition-colors group"
                >
                  <span
                    className={cn(
                      "relative z-10 w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0 transition-all border",
                      s.done
                        ? "bg-primary text-primary-foreground border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]"
                        : "bg-card text-muted-foreground border-border group-hover:border-primary/40"
                    )}
                  >
                    {s.done ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className={cn("font-medium", !s.done && "text-muted-foreground")}>
                    {s.label}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </aside>

        {/* ═══ CONTENT ═══ */}
        <div className="space-y-6 min-w-0">
          {/* LANGUAGE LOCK
              Cravado em cima de tudo. Quando setado != "auto", a engine
              ignora o que o lead escrever e responde sempre nesse idioma. */}
          <section
            id="step-language"
            className="rounded-2xl border border-border bg-card p-5 shadow-elevated"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 ring-1 ring-amber-500/25 grid place-items-center text-amber-400 shrink-0">
                <Globe className="w-[18px] h-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
                  {t("language.title")}
                </h2>
                <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
                  {t("language.desc")}
                </p>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const sel = config.language === lang.code;
                    return (
                      <button
                        key={lang.code}
                        onClick={() =>
                          setConfig((p) => ({ ...p, language: lang.code }))
                        }
                        data-selected={sel}
                        className="selectable-card text-left text-[12.5px] font-semibold py-2.5 px-3"
                      >
                        {lang.label}
                      </button>
                    );
                  })}
                </div>
                {config.language !== "auto" && (
                  <p className="text-[11.5px] text-amber-400 mt-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {t("language.lockedHint", {
                      lang:
                        LANGUAGE_OPTIONS.find((l) => l.code === config.language)
                          ?.label || config.language,
                    })}
                  </p>
                )}
              </div>
            </div>
          </section>

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
                    data-selected={sel}
                    className="selectable-card animate-fade-in-up"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="flex items-start gap-3 mb-3 pr-7">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl grid place-items-center shrink-0 ring-1 transition-all",
                          sel
                            ? "bg-primary/20 text-primary ring-primary/30"
                            : "bg-muted text-muted-foreground ring-border/40"
                        )}
                      >
                        <tpl.icon className="w-[18px] h-[18px]" />
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-md border self-start",
                          tpl.proactive
                            ? "bg-primary/10 text-primary border-primary/25"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/25"
                        )}
                      >
                        {tpl.proactive ? t("tpl.proactive") : t("tpl.reactive")}
                      </span>
                    </div>
                    <h3 className="font-display text-[14px] font-semibold text-foreground mb-1.5">
                      {t(`tpl.${tpl.k}.title`)}
                    </h3>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
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
                      data-selected={sel}
                      className="selectable-card animate-fade-in-up"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl grid place-items-center mb-3 ring-1 transition-all",
                          sel
                            ? "bg-primary/20 text-primary ring-primary/30"
                            : "bg-muted text-muted-foreground ring-border/40"
                        )}
                      >
                        <g.icon className="w-[18px] h-[18px]" />
                      </div>
                      <h3 className="font-display text-[14px] font-semibold text-foreground mb-1.5">
                        {t(`goal.${g.k}.title`)}
                      </h3>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
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
                      data-selected={sel}
                      className="selectable-card text-center"
                    >
                      <Clock
                        className={cn(
                          "w-4 h-4 mx-auto mb-2",
                          sel ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <p className="font-display text-[13px] font-semibold text-foreground">
                        {t(`timing.${tm.labelK}`)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t(`timing.${tm.subK}`)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </StepCard>
          )}

          {/* STEP: CHANNELS (multi-select) */}
          {config.template && config.goal && (
            <StepCard
              id="step-channel"
              step={isProactive ? 4 : 3}
              title={t("step4.title")}
              desc={t("step4.desc")}
            >
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2.5 block">
                  {t("step4.channelsLabel")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {CHANNELS.map((ch) => {
                    const sel = config.channels.includes(ch.id);
                    const onlyOne = config.channels.length === 1 && sel;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setConfig((p) => {
                            if (sel) {
                              // never empty
                              if (p.channels.length <= 1) return p;
                              return {
                                ...p,
                                channels: p.channels.filter((c) => c !== ch.id),
                              };
                            }
                            return { ...p, channels: [...p.channels, ch.id] };
                          });
                        }}
                        data-selected={sel}
                        title={onlyOne ? t("step4.atLeastOne") : ""}
                        className="selectable-card flex items-center gap-3"
                      >
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl grid place-items-center shrink-0 shadow-sm ring-1 ring-white/10",
                            ch.bg
                          )}
                        >
                          <ch.icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground leading-none">
                            {ch.label}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground mt-1 leading-none">
                            {sel ? t("step4.willSend") : t("step4.tapToAdd")}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11.5px] text-muted-foreground/80 mt-3 leading-relaxed">
                  {t("step4.hint")}
                </p>
              </div>
            </StepCard>
          )}

          {/* STEP: FIRST MESSAGE (instruction or exact) */}
          {config.template && config.goal && (
            <StepCard
              id="step-first-message"
              step={isProactive ? 5 : 4}
              title={t("firstMessage.title")}
              desc={t("firstMessage.desc")}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      setConfig((p) => ({ ...p, firstMessageVariability: "instruction" }))
                    }
                    data-selected={config.firstMessageVariability === "instruction"}
                    className="selectable-card"
                  >
                    <p className="text-[13px] font-semibold text-foreground">
                      {t("firstMessage.modeInstruction")}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                      {t("firstMessage.modeInstructionDesc")}
                    </p>
                  </button>
                  <button
                    onClick={() =>
                      setConfig((p) => ({ ...p, firstMessageVariability: "exact" }))
                    }
                    data-selected={config.firstMessageVariability === "exact"}
                    className="selectable-card"
                  >
                    <p className="text-[13px] font-semibold text-foreground">
                      {t("firstMessage.modeExact")}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                      {t("firstMessage.modeExactDesc")}
                    </p>
                  </button>
                </div>
                <Field
                  label={
                    config.firstMessageVariability === "exact"
                      ? t("firstMessage.exactLabel")
                      : t("firstMessage.instructionLabel")
                  }
                >
                  <textarea
                    value={config.firstMessageInstruction}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        firstMessageInstruction: e.target.value.slice(0, 2000),
                      }))
                    }
                    rows={5}
                    placeholder={
                      config.firstMessageVariability === "exact"
                        ? t("firstMessage.exactPlaceholder")
                        : t("firstMessage.instructionPlaceholder")
                    }
                    className="w-full px-3.5 py-3 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:border-ring/40 focus:bg-background focus:shadow-[0_0_0_4px_hsl(var(--ring)/0.1)] leading-relaxed font-dm-sans transition-all"
                  />
                </Field>
                <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed">
                  {config.firstMessageVariability === "exact"
                    ? t("firstMessage.exactHint")
                    : t("firstMessage.instructionHint")}
                </p>
              </div>
            </StepCard>
          )}

          {/* STEP: FOLLOW-UP CADENCE */}
          {config.template && config.goal && (
            <StepCard
              id="step-followups"
              step={isProactive ? 6 : 5}
              title={t("followUps.title")}
              desc={t("followUps.desc")}
            >
              <div className="space-y-3">
                {config.followUps.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
                    <p className="text-[12.5px] text-muted-foreground">
                      {t("followUps.empty")}
                    </p>
                  </div>
                ) : (
                  config.followUps.map((fu, idx) => (
                    <div
                      key={fu.id}
                      className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-elevated"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary grid place-items-center text-[11px] font-bold ring-1 ring-primary/25">
                            {idx + 1}
                          </span>
                          <span className="text-[13px] font-semibold text-foreground">
                            {t("followUps.itemTitle", { n: idx + 1 })}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            setConfig((p) => ({
                              ...p,
                              followUps: p.followUps.filter((f) => f.id !== fu.id),
                            }))
                          }
                          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        >
                          {t("followUps.remove")}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                        <div>
                          <label className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">
                            {t("followUps.channelLabel")}
                          </label>
                          <div className="flex gap-1.5 flex-wrap">
                            {CHANNELS.map((ch) => {
                              const sel = fu.channel === ch.id;
                              return (
                                <button
                                  key={ch.id}
                                  onClick={() =>
                                    setConfig((p) => ({
                                      ...p,
                                      followUps: p.followUps.map((f) =>
                                        f.id === fu.id ? { ...f, channel: ch.id } : f
                                      ),
                                    }))
                                  }
                                  data-selected={sel}
                                  className="selectable-card flex items-center gap-2 px-3 py-2 text-[12px] font-semibold"
                                >
                                  <ch.icon className="w-3.5 h-3.5" />
                                  {ch.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">
                            {t("followUps.delayLabel")}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={720}
                              value={fu.delayHours}
                              onChange={(e) => {
                                const n = Math.max(
                                  1,
                                  Math.min(720, Number(e.target.value) || 1)
                                );
                                setConfig((p) => ({
                                  ...p,
                                  followUps: p.followUps.map((f) =>
                                    f.id === fu.id ? { ...f, delayHours: n } : f
                                  ),
                                }));
                              }}
                              className="w-20 h-10 px-3 rounded-xl bg-muted border border-transparent text-[13px] text-foreground tabular-nums focus:outline-none focus:border-ring/40 focus:bg-background"
                            />
                            <span className="text-[12px] text-muted-foreground">
                              {fu.delayHours === 1
                                ? t("followUps.hour")
                                : t("followUps.hours")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">
                          {t("followUps.instructionLabel")}
                        </label>
                        <textarea
                          value={fu.instruction}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              followUps: p.followUps.map((f) =>
                                f.id === fu.id
                                  ? { ...f, instruction: e.target.value.slice(0, 1000) }
                                  : f
                              ),
                            }))
                          }
                          rows={3}
                          placeholder={t("followUps.instructionPlaceholder")}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-muted border border-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:border-ring/40 focus:bg-background leading-relaxed font-dm-sans"
                        />
                      </div>
                    </div>
                  ))
                )}
                <button
                  onClick={() =>
                    setConfig((p) => ({
                      ...p,
                      followUps: [
                        ...p.followUps,
                        {
                          id: newFollowUpId(),
                          channel: p.channels[0] || "WHATSAPP",
                          delayHours:
                            p.followUps.length > 0
                              ? p.followUps[p.followUps.length - 1].delayHours
                              : 24,
                          instruction: "",
                        },
                      ],
                    }))
                  }
                  disabled={config.followUps.length >= 10}
                  className="w-full h-11 rounded-xl border border-dashed border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + {t("followUps.add")}
                </button>
                {config.followUps.length >= 10 && (
                  <p className="text-[10.5px] text-muted-foreground/60 text-center">
                    {t("followUps.cap")}
                  </p>
                )}
              </div>
            </StepCard>
          )}

          {/* STEP: CLOSING STRATEGY — applies to every goal */}
          {config.goal && (
            <StepCard
              id="step-closing"
              step={isProactive ? 7 : 6}
              title={t("stepClosing.title")}
              desc={t("stepClosing.desc")}
            >
              <div className="space-y-5">
                {/* Mode selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: "auto", k: "modeAuto" },
                    { id: "direct_link", k: "modeDirectLink" },
                    { id: "qualify_first", k: "modeQualifyFirst" },
                    { id: "team_handoff", k: "modeTeamHandoff" },
                  ].map((m) => {
                    const active = config.closingStrategy === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() =>
                          setConfig((p) => ({
                            ...p,
                            closingStrategy: m.id as ClosingStrategy,
                          }))
                        }
                        className={cn(
                          "text-left p-3.5 rounded-xl border transition-colors cursor-pointer",
                          active
                            ? "border-primary bg-primary/[0.06]"
                            : "border-border bg-card hover:bg-muted/40"
                        )}
                      >
                        <p className={cn(
                          "text-[13px] font-semibold",
                          active ? "text-foreground" : "text-foreground/85"
                        )}>
                          {t(`stepClosing.${m.k}Title`)}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug">
                          {t(`stepClosing.${m.k}Desc`)}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Qualifying questions: shown unless mode is direct_link */}
                {config.closingStrategy !== "direct_link" && (
                  <Field
                    label={t("stepClosing.qualifyingQuestionsLabel")}
                    hint={t("stepClosing.qualifyingQuestionsHint")}
                  >
                    <StringList
                      items={config.qualifyingQuestions}
                      onChange={(items) =>
                        setConfig((p) => ({ ...p, qualifyingQuestions: items }))
                      }
                      placeholder={t("stepClosing.qualifyingQuestionsPlaceholder")}
                    />
                  </Field>
                )}

                {/* Required info to capture: shown when handoff is involved */}
                {(config.closingStrategy === "team_handoff" ||
                  config.closingStrategy === "auto") && (
                  <Field
                    label={t("stepClosing.requiredInfoLabel")}
                    hint={t("stepClosing.requiredInfoHint")}
                  >
                    <StringList
                      items={config.requiredInfo}
                      onChange={(items) =>
                        setConfig((p) => ({ ...p, requiredInfo: items }))
                      }
                      placeholder={t("stepClosing.requiredInfoPlaceholder")}
                    />
                  </Field>
                )}

                {/* Closing link: shown when link is involved */}
                {(config.closingStrategy === "direct_link" ||
                  config.closingStrategy === "qualify_first" ||
                  config.closingStrategy === "auto") && (
                  <>
                    <Field
                      label={t("stepClosing.linkLabel")}
                      hint={t("stepClosing.linkHint")}
                    >
                      <input
                        type="url"
                        value={config.closingLink}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, closingLink: e.target.value }))
                        }
                        placeholder="https://buy.stripe.com/xxx ou https://calendly.com/voce/30min"
                        className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
                      />
                    </Field>
                    <Field label={t("stepClosing.closingMessageLabel")}>
                      <textarea
                        value={config.closingMessage}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, closingMessage: e.target.value }))
                        }
                        rows={2}
                        placeholder={t("stepClosing.closingMessagePlaceholder")}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:border-ring/30 leading-relaxed"
                      />
                    </Field>
                  </>
                )}

                {/* Handoff settings: shown when handoff is involved */}
                {(config.closingStrategy === "team_handoff" ||
                  config.closingStrategy === "auto") && (
                  <>
                    <Field
                      label={`${t("stepClosing.handoffEmailLabel")} ${config.closingStrategy === "team_handoff" ? "*" : ""}`}
                      hint={t("stepClosing.handoffEmailHint")}
                    >
                      <input
                        type="email"
                        value={config.handoffEmail}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, handoffEmail: e.target.value }))
                        }
                        placeholder="vendas@suaempresa.com"
                        className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
                      />
                    </Field>
                    <Field
                      label={t("stepClosing.handoffWebhookLabel")}
                      hint={t("stepClosing.handoffWebhookHint")}
                    >
                      <input
                        type="url"
                        value={config.handoffWebhook}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, handoffWebhook: e.target.value }))
                        }
                        placeholder="https://hooks.slack.com/services/..."
                        className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
                      />
                    </Field>
                    <Field label={t("stepClosing.handoffWaitMessageLabel")}>
                      <textarea
                        value={config.handoffWaitMessage}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, handoffWaitMessage: e.target.value }))
                        }
                        rows={2}
                        placeholder={t("stepClosing.handoffWaitMessagePlaceholder")}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:border-ring/30 leading-relaxed"
                      />
                    </Field>
                  </>
                )}
              </div>
            </StepCard>
          )}

          {/* STEP: TRANSFER */}
          {needsTransfer && (
            <StepCard
              id="step-transfer"
              step={isProactive ? 8 : 7}
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
              step={isProactive ? 8 : 7}
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

          {/* STEP: WEBHOOK (simplified). Steps before webhook:
                proactive: 1..6 base, +1 closing (always when goal set),
                  +1 if transfer/calendar => 7 or 8 base, webhook = 8 or 9
                reactive: 1..5 base, +1 closing, +1 if t/c => 6 or 7 base,
                  webhook = 7 or 8 */}
          {needsWebhook && config.goal && (
            <StepCard
              id="step-webhook"
              step={
                isProactive
                  ? needsTransfer || needsCalendar
                    ? 9
                    : 8
                  : needsTransfer || needsCalendar
                    ? 8
                    : 7
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
                  href="/help/webhooks"
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
              {/* Follow-up cadence moved to its own dedicated step above.
                  This advanced area now hosts only orthogonal flags. */}
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
            className="w-full h-12 rounded-xl btn-brand text-[14px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
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
      className="rounded-2xl border border-border bg-card p-6 scroll-mt-4 animate-fade-in-up shadow-elevated"
    >
      <header className="flex items-start gap-3.5 mb-6 pb-5 border-b border-border/50">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 grid place-items-center font-display text-[14px] font-bold text-primary shadow-sm">
            {step}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-[16px] font-semibold text-foreground tracking-tight">
            {title}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{desc}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * Editable list of short strings. Used for qualifyingQuestions and
 * requiredInfo on the closing step. Operator adds/removes items, types
 * inline, no separate modal. Hard cap at 20 to keep the prompt readable.
 */
function StringList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const tc = useTranslations("common");
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[10.5px] font-bold grid place-items-center shrink-0">
            {i + 1}
          </span>
          <input
            value={it}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 h-9 px-3 rounded-lg bg-muted border border-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-muted-foreground/50 hover:text-rose-500 transition-colors shrink-0 h-9 w-9 grid place-items-center rounded-lg hover:bg-rose-500/10"
            aria-label={tc("remove")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {items.length < 20 && (
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {tc("add")}
        </button>
      )}
    </div>
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
      data-on={checked}
      className="toggle-switch"
    />
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
          {t("step4.channelsLabel")}:{" "}
          <strong className="text-foreground">
            {config.channels.join(" + ") || "—"}
          </strong>
        </span>
        {config.followUps.length > 0 && (
          <span>
            {t("followUps.title")}:{" "}
            <strong className="text-foreground">{config.followUps.length}</strong>
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
