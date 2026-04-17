// src/components/onboarding/onboarding-wizard.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { LanguagePicker, LanguageChoice } from "@/components/shared/language-picker";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CircleCheck,
  Cpu,
  FileText,
  Globe,
  Heart,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  ShoppingCart,
  Smartphone,
  Target,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type TemplateId =
  | ""
  | "form_lp"
  | "whatsapp_direct"
  | "quiz_external"
  | "social_dm"
  | "lp_followup"
  | "manual_outbound";

type GoalId = "" | "close_sale" | "schedule_meeting" | "qualify_transfer" | "collect_send";

type ChannelId = "WHATSAPP" | "EMAIL" | "SMS";

type ToneId =
  | "professional_friendly"
  | "consultative"
  | "empathetic"
  | "energetic"
  | "concise";

interface Persona {
  template: TemplateId;
  goal: GoalId;
  primaryChannel: ChannelId;
  secondaryChannel: ChannelId | "";
  aiName: string;
  aiRole: string;
  tone: ToneId;
  businessName: string;
}

const DEFAULT_PERSONA: Persona = {
  template: "",
  goal: "",
  primaryChannel: "WHATSAPP",
  secondaryChannel: "",
  aiName: "",
  aiRole: "",
  tone: "professional_friendly",
  businessName: "",
};

// ══════════════════════════════════════════════════════════════
// WIZARD
// ══════════════════════════════════════════════════════════════

interface Props {
  userName: string;
  accountName: string;
  initialPersona: {
    pipelineTemplate: string;
    pipelineGoal: string;
    pipelinePrimaryChannel: string;
    aiName: string;
    aiRole: string;
    tone: string;
  };
}

export function OnboardingWizard({ userName, accountName, initialPersona }: Props) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<Persona>({
    ...DEFAULT_PERSONA,
    template: (initialPersona.pipelineTemplate as TemplateId) || "",
    goal: (initialPersona.pipelineGoal as GoalId) || "",
    primaryChannel:
      (initialPersona.pipelinePrimaryChannel as ChannelId) || "WHATSAPP",
    aiName: initialPersona.aiName || "",
    aiRole: initialPersona.aiRole || "",
    tone: (initialPersona.tone as ToneId) || "professional_friendly",
    businessName: accountName.endsWith("'s Workspace") ? "" : accountName,
  });
  const [submitting, setSubmitting] = useState(false);

  const steps = ["welcome", "template", "goal", "channel", "persona", "done"];
  const totalSteps = steps.length;
  const canAdvance = useMemo(() => {
    if (step === 1 && !persona.template) return false;
    if (step === 2 && !persona.goal) return false;
    if (step === 3 && !persona.primaryChannel) return false;
    if (step === 4 && !persona.aiName.trim()) return false;
    return true;
  }, [step, persona]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: persona.template,
          goal: persona.goal,
          primaryChannel: persona.primaryChannel,
          secondaryChannel: persona.secondaryChannel,
          aiName: persona.aiName.trim(),
          aiRole: persona.aiRole.trim() || undefined,
          tone: persona.tone,
          businessName: persona.businessName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("bad_response");
      setStep(totalSteps - 1);
    } catch {
      setSubmitting(false);
      // stay on same step; UI shows error toast via alert-like banner
    }
  }

  async function skip() {
    setSubmitting(true);
    await fetch("/api/onboarding/skip", { method: "POST" });
    router.replace(`/${locale}`);
  }

  function finish() {
    router.replace(`/${locale}/campaigns`);
  }

  // ── HEADER (progress + top bar) ──
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
            <Image
              src="/logo.png"
              alt="Marketing Digital AI"
              width={28}
              height={28}
              className="rounded-lg object-contain"
            />
          </div>
          <span className="font-display text-[13px] font-semibold text-foreground truncate">
            {t("brand")}
          </span>
        </div>

        <ProgressDots current={step} total={totalSteps} />

        <div className="flex items-center gap-1.5 shrink-0">
          <LanguagePicker align="end" compact />
          {step > 0 && step < totalSteps - 1 && (
            <button
              onClick={skip}
              disabled={submitting}
              className="text-[11.5px] text-muted-foreground hover:text-foreground transition-colors px-2 h-8"
            >
              {t("skip")}
            </button>
          )}
        </div>
      </header>

      {/* ── STEPS ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {step === 0 && (
            <Welcome userName={userName} onStart={() => setStep(1)} />
          )}
          {step === 1 && (
            <TemplateStep
              value={persona.template}
              onChange={(v) =>
                setPersona((p) => ({
                  ...p,
                  template: v,
                  // reset downstream that is no longer coherent
                  goal: "",
                }))
              }
            />
          )}
          {step === 2 && (
            <GoalStep
              value={persona.goal}
              onChange={(v) => setPersona((p) => ({ ...p, goal: v }))}
            />
          )}
          {step === 3 && (
            <ChannelStep
              primary={persona.primaryChannel}
              secondary={persona.secondaryChannel}
              onChangePrimary={(v) =>
                setPersona((p) => ({
                  ...p,
                  primaryChannel: v,
                  secondaryChannel:
                    p.secondaryChannel === v ? "" : p.secondaryChannel,
                }))
              }
              onChangeSecondary={(v) =>
                setPersona((p) => ({ ...p, secondaryChannel: v }))
              }
            />
          )}
          {step === 4 && (
            <PersonaStep
              persona={persona}
              onChange={(patch) => setPersona((p) => ({ ...p, ...patch }))}
            />
          )}
          {step === 5 && <Done onFinish={finish} />}
        </div>
      </main>

      {/* ── NAV FOOTER ── */}
      {step > 0 && step < totalSteps - 1 && (
        <footer className="px-6 py-4 border-t border-border flex items-center justify-between bg-card/40">
          <button
            onClick={() => setStep(step - 1)}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("back")}
          </button>
          <button
            onClick={() => (step === totalSteps - 2 ? submit() : setStep(step + 1))}
            disabled={!canAdvance || submitting}
            className={cn(
              "inline-flex items-center gap-1.5 px-5 h-10 rounded-lg text-[13px] font-semibold transition-all",
              canAdvance && !submitting
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("saving")}
              </>
            ) : step === totalSteps - 2 ? (
              <>
                {t("finish")}
                <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                {t("next")}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </footer>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PROGRESS DOTS
// ══════════════════════════════════════════════════════════════

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current
              ? "w-6 bg-primary"
              : i < current
                ? "w-1.5 bg-primary/70"
                : "w-1.5 bg-muted"
          )}
        />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// STEP 0: WELCOME
// ══════════════════════════════════════════════════════════════

function Welcome({ userName, onStart }: { userName: string; onStart: () => void }) {
  const t = useTranslations("onboarding.welcome");
  return (
    <div className="text-center animate-fade-in-up">
      {/* Tech badge instead of sparkle / confetti */}
      <div className="relative w-14 h-14 mx-auto mb-6">
        <div className="absolute inset-0 rounded-2xl border border-border bg-card grid place-items-center">
          <Cpu className="w-6 h-6 text-primary" />
        </div>
        <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/20 animate-pulse" />
      </div>

      <h1 className="font-display text-[30px] sm:text-[34px] font-semibold tracking-tight text-foreground mb-3 leading-tight">
        {t("title", { name: userName })}
      </h1>
      <p className="text-[14.5px] text-muted-foreground max-w-md mx-auto leading-relaxed mb-8">
        {t("subtitle")}
      </p>

      {/* Language picker — shown in all 3 languages so anyone can pick theirs */}
      <div className="mb-10">
        <p className="text-[11.5px] font-medium text-muted-foreground mb-3 leading-relaxed">
          {t("langQuestionPt")} · {t("langQuestionEn")} · {t("langQuestionEs")}
        </p>
        <LanguageChoice />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-10">
        {[
          { icon: Target, key: "origin" },
          { icon: Zap, key: "goal" },
          { icon: Heart, key: "persona" },
        ].map((f) => (
          <div
            key={f.key}
            className="rounded-xl border border-border bg-card px-4 py-3 text-left"
          >
            <f.icon className="w-4 h-4 text-primary mb-1.5" />
            <p className="font-display text-[12px] font-semibold text-foreground">
              {t(`features.${f.key}.title`)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {t(`features.${f.key}.desc`)}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-primary text-primary-foreground text-[13.5px] font-semibold hover:opacity-90 transition-all"
      >
        {t("cta")}
        <ArrowRight className="w-4 h-4" />
      </button>
      <p className="text-[11px] text-muted-foreground mt-4">
        {t("duration")}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// STEP 1: TEMPLATE
// ══════════════════════════════════════════════════════════════

const TEMPLATE_OPTIONS: { id: Exclude<TemplateId, "">; icon: React.ComponentType<{ className?: string }>; badge: "proactive" | "reactive"; k: string }[] = [
  { id: "form_lp", icon: FileText, badge: "proactive", k: "formProactive" },
  { id: "whatsapp_direct", icon: Phone, badge: "reactive", k: "whatsappReactive" },
  { id: "quiz_external", icon: Globe, badge: "proactive", k: "quizProactive" },
  { id: "social_dm", icon: Instagram, badge: "reactive", k: "socialReactive" },
  { id: "lp_followup", icon: Mail, badge: "proactive", k: "emailNurture" },
  { id: "manual_outbound", icon: Users, badge: "proactive", k: "manualOutbound" },
];

function TemplateStep({
  value,
  onChange,
}: {
  value: TemplateId;
  onChange: (v: TemplateId) => void;
}) {
  const t = useTranslations("onboarding.template");
  const ttpl = useTranslations("pipeline.tpl");
  return (
    <StepContainer title={t("title")} subtitle={t("subtitle")} icon={Target}>
      <div className="grid sm:grid-cols-2 gap-3">
        {TEMPLATE_OPTIONS.map((opt, idx) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={cn(
                "text-left p-4 rounded-xl border-2 transition-all animate-fade-in-up",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/30"
              )}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-start justify-between mb-2">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg grid place-items-center transition-colors",
                    selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  <opt.icon className="w-4.5 h-4.5" />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
                    opt.badge === "proactive"
                      ? "bg-primary/10 text-primary"
                      : "bg-blue-500/10 text-blue-500"
                  )}
                >
                  {opt.badge === "proactive"
                    ? ttpl("proactive")
                    : ttpl("reactive")}
                </span>
              </div>
              <h3 className="font-display text-[14px] font-semibold text-foreground mb-1">
                {ttpl(`${opt.k}.title`)}
              </h3>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                {ttpl(`${opt.k}.desc`)}
              </p>
            </button>
          );
        })}
      </div>
    </StepContainer>
  );
}

// ══════════════════════════════════════════════════════════════
// STEP 2: GOAL
// ══════════════════════════════════════════════════════════════

const GOAL_OPTIONS: { id: Exclude<GoalId, "">; icon: React.ComponentType<{ className?: string }>; k: string }[] = [
  { id: "close_sale", icon: ShoppingCart, k: "closeSale" },
  { id: "schedule_meeting", icon: Calendar, k: "scheduleMeeting" },
  { id: "qualify_transfer", icon: UserCheck, k: "qualifyTransfer" },
  { id: "collect_send", icon: FileText, k: "collectSend" },
];

function GoalStep({
  value,
  onChange,
}: {
  value: GoalId;
  onChange: (v: GoalId) => void;
}) {
  const t = useTranslations("onboarding.goal");
  const tgoal = useTranslations("pipeline.goal");
  return (
    <StepContainer title={t("title")} subtitle={t("subtitle")} icon={Zap}>
      <div className="grid sm:grid-cols-2 gap-3">
        {GOAL_OPTIONS.map((opt, idx) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={cn(
                "text-left p-4 rounded-xl border-2 transition-all animate-fade-in-up",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/30"
              )}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg grid place-items-center mb-3 transition-colors",
                  selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <opt.icon className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-display text-[14px] font-semibold text-foreground mb-1">
                {tgoal(`${opt.k}.title`)}
              </h3>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                {tgoal(`${opt.k}.desc`)}
              </p>
            </button>
          );
        })}
      </div>
    </StepContainer>
  );
}

// ══════════════════════════════════════════════════════════════
// STEP 3: CHANNEL
// ══════════════════════════════════════════════════════════════

const CHANNELS: { id: ChannelId; icon: React.ComponentType<{ className?: string }>; label: string; color: string }[] = [
  { id: "WHATSAPP", icon: Phone, label: "WhatsApp", color: "bg-[#25D366]" },
  { id: "EMAIL", icon: Mail, label: "Email", color: "bg-blue-500" },
  { id: "SMS", icon: Smartphone, label: "SMS", color: "bg-violet-500" },
];

function ChannelStep({
  primary,
  secondary,
  onChangePrimary,
  onChangeSecondary,
}: {
  primary: ChannelId;
  secondary: ChannelId | "";
  onChangePrimary: (v: ChannelId) => void;
  onChangeSecondary: (v: ChannelId | "") => void;
}) {
  const t = useTranslations("onboarding.channel");
  const tc = useTranslations("common");
  return (
    <StepContainer title={t("title")} subtitle={t("subtitle")} icon={MessageCircle}>
      <div className="space-y-5">
        <div>
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
            {t("primary")}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {CHANNELS.map((ch) => {
              const sel = primary === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => onChangePrimary(ch.id)}
                  className={cn(
                    "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
                    sel
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-lg grid place-items-center", ch.color)}>
                    <ch.icon className="w-4.5 h-4.5 text-white" />
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
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
            {t("secondary")}{" "}
            <span className="normal-case tracking-normal font-normal text-muted-foreground/70">
              — {tc("optional")}
            </span>
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => onChangeSecondary("")}
              className={cn(
                "p-3 rounded-xl border-2 transition-all text-[12px] font-medium",
                secondary === ""
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-primary/30 text-muted-foreground hover:bg-muted/30"
              )}
            >
              {t("none")}
            </button>
            {CHANNELS.filter((c) => c.id !== primary).map((ch) => {
              const sel = secondary === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => onChangeSecondary(ch.id)}
                  className={cn(
                    "p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-[12px] font-medium",
                    sel
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
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
    </StepContainer>
  );
}

// ══════════════════════════════════════════════════════════════
// STEP 4: PERSONA
// ══════════════════════════════════════════════════════════════

const PRESETS: { id: string; k: string; aiName: string; aiRole: string; tone: ToneId }[] = [
  { id: "sofia", k: "sofia", aiName: "Sofia", aiRole: "Consultora de vendas", tone: "professional_friendly" },
  { id: "marcos", k: "marcos", aiName: "Marcos", aiRole: "Consultor especialista", tone: "consultative" },
  { id: "julia", k: "julia", aiName: "Júlia", aiRole: "Atendente empática", tone: "empathetic" },
  { id: "gabriel", k: "gabriel", aiName: "Gabriel", aiRole: "Agente de agendamento", tone: "energetic" },
  { id: "ana", k: "ana", aiName: "Ana", aiRole: "Atendente ágil", tone: "concise" },
];

function PersonaStep({
  persona,
  onChange,
}: {
  persona: Persona;
  onChange: (patch: Partial<Persona>) => void;
}) {
  const t = useTranslations("onboarding.persona");
  const tpre = useTranslations("onboarding.personaPresets");

  const activePreset = PRESETS.find(
    (p) => p.aiName === persona.aiName && p.tone === persona.tone
  )?.id;

  return (
    <StepContainer title={t("title")} subtitle={t("subtitle")} icon={Heart}>
      <div className="space-y-5">
        <div>
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
            {t("presets")}
          </h3>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {PRESETS.map((preset, idx) => {
              const sel = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() =>
                    onChange({
                      aiName: preset.aiName,
                      aiRole: preset.aiRole,
                      tone: preset.tone,
                    })
                  }
                  className={cn(
                    "text-left p-3 rounded-xl border-2 transition-all animate-fade-in-up",
                    sel
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  )}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-muted grid place-items-center text-[12px] font-bold text-foreground">
                      {preset.aiName[0]}
                    </div>
                    <div>
                      <p className="font-display text-[13px] font-semibold text-foreground">
                        {preset.aiName}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {tpre(`${preset.k}.role`)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {tpre(`${preset.k}.pitch`)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("customize")}
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t("aiName")}>
              <input
                value={persona.aiName}
                onChange={(e) => onChange({ aiName: e.target.value })}
                placeholder="Sofia"
                className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
              />
            </Field>
            <Field label={t("aiRole")}>
              <input
                value={persona.aiRole}
                onChange={(e) => onChange({ aiRole: e.target.value })}
                placeholder={t("aiRolePlaceholder")}
                className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
              />
            </Field>
          </div>
          <Field label={t("businessName")}>
            <input
              value={persona.businessName}
              onChange={(e) => onChange({ businessName: e.target.value })}
              placeholder={t("businessNamePlaceholder")}
              className="w-full h-10 px-3.5 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring/30"
            />
          </Field>
        </div>
      </div>
    </StepContainer>
  );
}

// ══════════════════════════════════════════════════════════════
// STEP 5: DONE
// ══════════════════════════════════════════════════════════════

function Done({ onFinish }: { onFinish: () => void }) {
  const t = useTranslations("onboarding.done");
  return (
    <div className="text-center animate-fade-in-up">
      {/* Sober tech check — no confetti */}
      <div className="relative w-14 h-14 mx-auto mb-6">
        <div className="absolute inset-0 rounded-2xl border border-primary/30 bg-primary/10 grid place-items-center">
          <CircleCheck className="w-6 h-6 text-primary" strokeWidth={2} />
        </div>
        <div className="absolute -inset-1 rounded-[20px] ring-1 ring-primary/20" />
      </div>
      <h1 className="font-display text-[30px] sm:text-[34px] font-semibold tracking-tight text-foreground mb-3 leading-tight">
        {t("title")}
      </h1>
      <p className="text-[14.5px] text-muted-foreground max-w-md mx-auto leading-relaxed mb-8">
        {t("subtitle")}
      </p>

      <div className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10 text-left">
        <NextAction icon={Target} titleKey="campaigns" />
        <NextAction icon={MessageCircle} titleKey="channels" />
      </div>

      <button
        onClick={onFinish}
        className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-primary text-primary-foreground text-[13.5px] font-semibold hover:opacity-90 transition-all"
      >
        {t("cta")}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function NextAction({
  icon: Icon,
  titleKey,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
}) {
  const t = useTranslations("onboarding.done.nextActions");
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="w-4 h-4 text-primary mb-2" />
      <p className="font-display text-[12.5px] font-semibold text-foreground">
        {t(`${titleKey}.title`)}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
        {t(`${titleKey}.desc`)}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SHARED
// ══════════════════════════════════════════════════════════════

function StepContainer({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in-up">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center mx-auto mb-4">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground mb-1.5">
          {title}
        </h1>
        <p className="text-[13.5px] text-muted-foreground max-w-md mx-auto">
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
