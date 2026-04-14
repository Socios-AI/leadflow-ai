// src/app/[locale]/(dashboard)/pipeline/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Brain, Loader2, Save, CheckCircle, Target, Calendar,
  MessageSquare, Phone, FileText, ExternalLink, Instagram,
  Mail, Zap, Clock, ArrowRight, Users, Headphones,
  ChevronDown, Smartphone, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══ TYPES ═══ */
interface PipelineConfig {
  templateId: string;
  goalId: string;
  firstContact: "immediate" | "delay_5" | "delay_15" | "delay_30";
  followUpEnabled: boolean;
  followUpAttempts: number;
  followUpInterval: number;
  requireHumanApproval: boolean;
}

const DEFAULT: PipelineConfig = {
  templateId: "", goalId: "", firstContact: "immediate",
  followUpEnabled: true, followUpAttempts: 3, followUpInterval: 24,
  requireHumanApproval: false,
};

/* ═══ PAGE ═══ */
export default function PipelinePage() {
  const t = useTranslations("pipeline");
  const tc = useTranslations("common");

  const [config, setConfig] = useState<PipelineConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    fetch("/api/pipeline")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setConfig({ ...DEFAULT, ...data }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!config.templateId) { showToast(t("selectTemplateFirst"), false); return; }
    if (!config.goalId) { showToast(t("selectGoalFirst"), false); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/pipeline", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) { setSaved(true); showToast(t("savedSuccess"), true); setTimeout(() => setSaved(false), 3000); }
      else showToast(t("saveError"), false);
    } catch { showToast(t("connectionError"), false); }
    setSaving(false);
  }

  /* ═══ TEMPLATES ═══ */
  const TEMPLATES = [
    {
      id: "form_proactive", icon: FileText, color: "bg-blue-500",
      title: t("tpl.formProactive.title"),
      desc: t("tpl.formProactive.desc"),
      behavior: t("tpl.proactive"),
      tags: [t("tpl.tag.form"), t("tpl.tag.landingPage")],
    },
    {
      id: "whatsapp_reactive", icon: Phone, color: "bg-emerald-500",
      title: t("tpl.whatsappReactive.title"),
      desc: t("tpl.whatsappReactive.desc"),
      behavior: t("tpl.reactive"),
      tags: [t("tpl.tag.whatsapp"), t("tpl.tag.directLink")],
    },
    {
      id: "quiz_proactive", icon: ExternalLink, color: "bg-violet-500",
      title: t("tpl.quizProactive.title"),
      desc: t("tpl.quizProactive.desc"),
      behavior: t("tpl.proactive"),
      tags: ["Typeform", "Google Forms", "Quiz"],
    },
    {
      id: "social_reactive", icon: Instagram, color: "bg-pink-500",
      title: t("tpl.socialReactive.title"),
      desc: t("tpl.socialReactive.desc"),
      behavior: t("tpl.reactive"),
      tags: ["Instagram", "Facebook", "DM"],
    },
    {
      id: "email_nurture", icon: Mail, color: "bg-sky-500",
      title: t("tpl.emailNurture.title"),
      desc: t("tpl.emailNurture.desc"),
      behavior: t("tpl.proactive"),
      tags: [t("tpl.tag.email"), "Follow-up", "Nurture"],
    },
    {
      id: "manual_outbound", icon: Smartphone, color: "bg-amber-500",
      title: t("tpl.manualOutbound.title"),
      desc: t("tpl.manualOutbound.desc"),
      behavior: t("tpl.proactive"),
      tags: [t("tpl.tag.manual"), t("tpl.tag.referral"), "CRM"],
    },
  ];

  /* ═══ GOALS ═══ */
  const GOALS = [
    {
      id: "close_sale", icon: Target, color: "text-emerald-400",
      title: t("goal.closeSale.title"),
      desc: t("goal.closeSale.desc"),
    },
    {
      id: "schedule_meeting", icon: Calendar, color: "text-blue-400",
      title: t("goal.scheduleMeeting.title"),
      desc: t("goal.scheduleMeeting.desc"),
    },
    {
      id: "qualify_transfer", icon: Users, color: "text-amber-400",
      title: t("goal.qualifyTransfer.title"),
      desc: t("goal.qualifyTransfer.desc"),
    },
    {
      id: "collect_send", icon: FileText, color: "text-violet-400",
      title: t("goal.collectSend.title"),
      desc: t("goal.collectSend.desc"),
    },
  ];

  /* ═══ TIMING ═══ */
  const TIMING = [
    { id: "immediate" as const, label: t("timing.immediate"), sub: t("timing.immediateSub") },
    { id: "delay_5" as const, label: t("timing.delay5"), sub: t("timing.delay5Sub") },
    { id: "delay_15" as const, label: t("timing.delay15"), sub: t("timing.delay15Sub") },
    { id: "delay_30" as const, label: t("timing.delay30"), sub: t("timing.delay30Sub") },
  ];

  const selectedTpl = TEMPLATES.find(t => t.id === config.templateId);
  const isProactive = selectedTpl?.behavior === t("tpl.proactive");

  /* ═══ FUNNEL PREVIEW ═══ */
  const funnelStages = React.useMemo(() => {
    if (!config.templateId || !config.goalId) return [];
    const stages: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [];

    if (isProactive) {
      stages.push({ key: "ai_contact", label: t("funnel.aiContacts"), icon: Zap, color: "bg-blue-500" });
    } else {
      stages.push({ key: "lead_arrives", label: t("funnel.leadArrives"), icon: MessageSquare, color: "bg-blue-500" });
    }
    stages.push({ key: "conversation", label: t("funnel.conversation"), icon: Headphones, color: "bg-amber-500" });
    stages.push({ key: "qualified", label: t("funnel.qualified"), icon: Target, color: "bg-emerald-500" });

    if (config.goalId === "close_sale") stages.push({ key: "converted", label: t("funnel.saleClosed"), icon: CheckCircle, color: "bg-primary" });
    else if (config.goalId === "schedule_meeting") stages.push({ key: "scheduled", label: t("funnel.meetingScheduled"), icon: Calendar, color: "bg-primary" });
    else if (config.goalId === "qualify_transfer") stages.push({ key: "transferred", label: t("funnel.transferred"), icon: Users, color: "bg-primary" });
    else stages.push({ key: "sent", label: t("funnel.proposalSent"), icon: Mail, color: "bg-primary" });

    return stages;
  }, [config.templateId, config.goalId, isProactive, t]);

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {toast && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
          toast.ok ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-space-grotesk text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-dm-sans">{t("subtitle")}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><CheckCircle className="w-4 h-4" />{t("saved")}</> : <><Save className="w-4 h-4" />{tc("save")}</>}
        </button>
      </div>

      {/* ═══ STEP 1: Template ═══ */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">1</span>
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("step1.title")}</h2>
          </div>
          <p className="text-[11px] text-muted-foreground font-dm-sans ml-6.5">{t("step1.desc")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map(tpl => {
            const sel = config.templateId === tpl.id;
            const Icon = tpl.icon;
            return (
              <button key={tpl.id} onClick={() => setConfig(p => ({ ...p, templateId: tpl.id }))}
                className={cn("p-4 rounded-xl border-2 text-left cursor-pointer transition-all",
                  sel ? "border-primary bg-primary/[0.04]" : "border-border hover:border-primary/20"
                )}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", tpl.color)}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-tight">{tpl.title}</p>
                    <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 inline-block",
                      tpl.behavior === t("tpl.proactive") ? "text-blue-400 bg-blue-500/10" : "text-emerald-400 bg-emerald-500/10"
                    )}>{tpl.behavior}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed font-dm-sans">{tpl.desc}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tpl.tags.map(tag => <span key={tag} className="text-[9px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">{tag}</span>)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ STEP 2: Goal ═══ */}
      {config.templateId && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">2</span>
              <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("step2.title")}</h2>
            </div>
            <p className="text-[11px] text-muted-foreground font-dm-sans ml-6.5">{t("step2.desc")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GOALS.map(goal => {
              const sel = config.goalId === goal.id;
              const Icon = goal.icon;
              return (
                <button key={goal.id} onClick={() => setConfig(p => ({ ...p, goalId: goal.id }))}
                  className={cn("p-4 rounded-xl border-2 text-left cursor-pointer transition-all",
                    sel ? "border-primary bg-primary/[0.04]" : "border-border hover:border-primary/20"
                  )}>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Icon className={cn("w-5 h-5", goal.color)} />
                    <p className="text-[13px] font-semibold text-foreground">{goal.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed font-dm-sans">{goal.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Timing (only for proactive) ═══ */}
      {config.templateId && config.goalId && isProactive && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">3</span>
              <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("step3.title")}</h2>
            </div>
            <p className="text-[11px] text-muted-foreground font-dm-sans ml-6.5">{t("step3.desc")}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIMING.map(opt => {
              const sel = config.firstContact === opt.id;
              return (
                <button key={opt.id} onClick={() => setConfig(p => ({ ...p, firstContact: opt.id }))}
                  className={cn("p-3 rounded-xl border-2 text-center cursor-pointer transition-all",
                    sel ? "border-primary bg-primary/[0.04]" : "border-border hover:border-primary/20"
                  )}>
                  <p className="text-[13px] font-semibold text-foreground">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Funnel Preview ═══ */}
      {config.templateId && config.goalId && funnelStages.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("preview.title")}</h2>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {funnelStages.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <React.Fragment key={stage.key}>
                  <div className="flex-1 min-w-[120px]">
                    <div className="rounded-xl border border-border p-4 text-center">
                      <div className={cn("w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center", `${stage.color}/10`)}>
                        <Icon className={cn("w-5 h-5", stage.color.replace("bg-", "text-"))} />
                      </div>
                      <p className="text-[12px] font-semibold text-foreground font-dm-sans">{stage.label}</p>
                    </div>
                  </div>
                  {idx < funnelStages.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground/20 shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Advanced ═══ */}
      {config.templateId && config.goalId && (
        <>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-5 py-3 rounded-2xl border border-border bg-card cursor-pointer hover:bg-muted/20 transition-colors">
            <span className="text-[13px] font-medium text-foreground">{t("advanced.title")}</span>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showAdvanced && "rotate-180")} />
          </button>

          {showAdvanced && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              {/* Follow-up */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-foreground">{t("advanced.followUp")}</p>
                  <p className="text-[11px] text-muted-foreground font-dm-sans">{t("advanced.followUpDesc")}</p>
                </div>
                <button onClick={() => setConfig(p => ({ ...p, followUpEnabled: !p.followUpEnabled }))}
                  className={cn("w-11 h-6 rounded-full transition-colors cursor-pointer relative",
                    config.followUpEnabled ? "bg-primary" : "bg-muted"
                  )}>
                  <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    config.followUpEnabled ? "translate-x-5.5" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              {config.followUpEnabled && (
                <div className="grid grid-cols-2 gap-3 ml-0">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("advanced.attempts")}</label>
                    <select value={config.followUpAttempts} onChange={e => setConfig(p => ({ ...p, followUpAttempts: parseInt(e.target.value) }))}
                      className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none cursor-pointer font-dm-sans">
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}x</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("advanced.interval")}</label>
                    <select value={config.followUpInterval} onChange={e => setConfig(p => ({ ...p, followUpInterval: parseInt(e.target.value) }))}
                      className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none cursor-pointer font-dm-sans">
                      {[6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h}h</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Human approval */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <p className="text-[13px] font-medium text-foreground">{t("advanced.humanApproval")}</p>
                  <p className="text-[11px] text-muted-foreground font-dm-sans">{t("advanced.humanApprovalDesc")}</p>
                </div>
                <button onClick={() => setConfig(p => ({ ...p, requireHumanApproval: !p.requireHumanApproval }))}
                  className={cn("w-11 h-6 rounded-full transition-colors cursor-pointer relative",
                    config.requireHumanApproval ? "bg-primary" : "bg-muted"
                  )}>
                  <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    config.requireHumanApproval ? "translate-x-5.5" : "translate-x-0.5"
                  )} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bottom save */}
      {config.templateId && config.goalId && (
        <button onClick={handleSave} disabled={saving}
          className="w-full h-12 rounded-xl btn-brand text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><CheckCircle className="w-4 h-4" />{t("saved")}</> : <><Save className="w-4 h-4" />{t("saveConfig")}</>}
        </button>
      )}
    </div>
  );
}