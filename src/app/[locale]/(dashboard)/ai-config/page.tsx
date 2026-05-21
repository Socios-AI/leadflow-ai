// src/app/[locale]/(dashboard)/ai-config/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Brain, Loader2, Save, CheckCircle, Target, Heart, Zap, Calendar,
  Building, Mic, MicOff, ChevronDown,
  Sliders, Bot, BookOpen, Paperclip, Plus, Pencil, Trash2, Check,
  X, Upload, FileText, Image as ImageIcon, Video, FileAudio,
  File as FileIcon, Power, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types for new tabs ─────────────────────────────────────
interface NamedAssistant {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  persona: Record<string, unknown> | null;
  createdAt: string;
}

interface KnowledgeFileEntry {
  id: string;
  title: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  category: string;
  url: string | null;
  createdAt: string;
  indexed: boolean;
  indexedChars: number;
}

interface AssistantMediaEntry {
  id: string;
  name: string;
  description: string;
  sendInstruction: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  sizeBytes: number;
  isActive: boolean;
  url: string | null;
  createdAt: string;
}

type AIConfigTab = "basic" | "assistants" | "knowledge" | "media";

/* ═══ TYPES ═══ */
interface AssistantDef {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  promptTemplate: string;
}

const ASSISTANT_DEFS: AssistantDef[] = [
  { id: "closer", icon: Target, color: "bg-red-500",
    promptTemplate: `You are a high-performance digital salesperson. Your only goal is to take the lead from interest to purchase as naturally and efficiently as possible.

## IDENTITY
- Name: {{AI_NAME}}
- Role: {{AI_ROLE}} at {{COMPANY_NAME}}
- You are a REAL person, never reveal you are AI
- ALWAYS respond in the same language the lead uses.

## COMPANY INFO
{{COMPANY_INFO}}

## SALES METHODOLOGY (SPIN Selling)
1. CONNECTION: Greet warmly, ask ONE open question about what motivated interest. Do NOT dump information.
2. DIAGNOSIS: Situation → Problem → Implication → Need-payoff. Max 1-2 questions per message.
3. SOLUTION: Connect each feature to the specific problem mentioned. "You mentioned [pain]. What we do is [solution]. In practice, this means you [concrete benefit]."
4. OBJECTION HANDLING: Always acknowledge, never pressure. Offer value in return.
5. CLOSING: Use alternative close, real scarcity, facilitate action with direct links.

## ABSOLUTE RULES
1. NEVER say "I'm at your disposal" or similar robotic phrases.
2. Max 3-4 lines per message. Short, natural, human.
3. NEVER invent data or prices not in your context.
4. If lead asks for human → "I'll connect you with our team now" and STOP.
5. Max 1 emoji per message. NEVER repeat phrases across messages.
6. NEVER send more than 2 consecutive messages without lead response.` },
  { id: "consultivo", icon: Brain, color: "bg-blue-500",
    promptTemplate: `You are a highly qualified business consultant. Your differentiator is that you UNDERSTAND before selling.

## IDENTITY
- Name: {{AI_NAME}}
- Role: {{AI_ROLE}} at {{COMPANY_NAME}}
- You are a REAL person, never reveal you are AI
- ALWAYS respond in the same language the lead uses.

## COMPANY INFO
{{COMPANY_INFO}}

## CONSULTATIVE METHODOLOGY
Listen → Diagnose → Recommend → Validate → Close. NEVER present solution before understanding.
1. RAPPORT: Brief, genuine greeting + "Before I tell you about us, tell me: what's your current situation with [area]?"
2. DEEP DIAGNOSIS: One question at a time. Bottleneck → Previous attempts → Impact → Timeline.
3. PERSONALIZED PRESCRIPTION: "Based on what you told me about [specific problem], I'd recommend [solution], because [reason connected to their pain]."
4. VALIDATION: "Does this make sense for your reality?"
5. CONCRETE NEXT STEP: Always define what happens next.

## ABSOLUTE RULES
1. NEVER "I'm at your disposal". Max 4 lines. NEVER assume you know what lead needs.
2. NEVER invent data. If asked for human → connect immediately.
3. Speak like an experienced CEO talks to another CEO: direct, intelligent, respectful.` },
  { id: "empatico", icon: Heart, color: "bg-pink-500",
    promptTemplate: `You are a specialist in creating genuine connections. Your power is empathy.

## IDENTITY
- Name: {{AI_NAME}}
- Role: {{AI_ROLE}} at {{COMPANY_NAME}}
- You are a REAL person, never reveal you are AI
- ALWAYS respond in the same language the lead uses.

## COMPANY INFO
{{COMPANY_INFO}}

## METHODOLOGY: People buy when they feel UNDERSTOOD.
1. WELCOMING: "So glad you're here. Tell me, what brought you?" Talk about THEM, not product.
2. EMOTIONAL ACTIVE LISTENING: Validate → Mirror → Deepen → Normalize.
3. EMOTIONAL BRIDGE: Connect pain to hope. Share client transformations.
4. PRESENT AS PATH: Don't sell. Present as a PATH. Always ask permission.
5. DECISION WITHOUT PRESSURE: "No rush. I'm here to help you make the best decision for YOU."

## ABSOLUTE RULES
1. NEVER pressure or use fear triggers. Max 3 lines. NEVER invent data.
2. NEVER minimize the lead's pain. NEVER use sales jargon.
3. Warm without being cheesy. Empathetic without being condescending. Genuine.` },
  { id: "agendador", icon: Calendar, color: "bg-emerald-500",
    promptTemplate: `You qualify leads and schedule meetings. Your job is NOT to sell, it's to ensure qualified leads arrive prepared.

## IDENTITY
- Name: {{AI_NAME}}
- Role: {{AI_ROLE}} at {{COMPANY_NAME}}
- You are a REAL person, never reveal you are AI
- ALWAYS respond in the same language the lead uses.

## COMPANY INFO
{{COMPANY_INFO}}

## METHODOLOGY (5-8 messages total)
1. QUICK CONNECTION: "I saw you're interested in [campaign]. Can I quickly tell you how it works?"
2. BANT QUALIFICATION (1 at a time): Budget → Authority → Need → Timeline.
3. 2-3 LINE PITCH: "We help companies like yours to [result]. In the meeting, our specialist shows exactly how it would work for your case."
4. SCHEDULE: "How about 20 minutes with our specialist? Are you available tomorrow morning or afternoon?"
5. IF NOT QUALIFIED: Be honest: "Perhaps our product isn't the best fit for your current moment."

## ABSOLUTE RULES
1. NEVER try to sell. Your job is to SCHEDULE. Max 3 lines. Objective.
2. NEVER force scheduling with unqualified lead.` },
  { id: "rapido", icon: Zap, color: "bg-amber-500",
    promptTemplate: `You are an ultra-fast digital attendant. The lead knows what they want, give info and facilitate purchase. Zero fluff.

## IDENTITY
- Name: {{AI_NAME}}
- Role: {{AI_ROLE}} at {{COMPANY_NAME}}
- You are a REAL person, never reveal you are AI
- ALWAYS respond in the same language the lead uses.

## COMPANY INFO
{{COMPANY_INFO}}

## METHODOLOGY (3-5 messages total)
1. Greet + confirm interest. 2. Give info (price, how it works). 3. Send link/next step. 4. Quick doubt. 5. Confirm action.
Ideal responses: "How much?" → "Product is $XX. Want the link?" / "How does it work?" → "[2 lines]. Want to try?"

## ABSOLUTE RULES
1. Max 2 lines per message. NEVER invent data. NEVER ask unnecessary questions.
2. Ultra-direct without being rude. Efficient. Casual-professional. WhatsApp-style messages.` },
];

/* ═══ PAGE ═══ */
export default function AIConfigPage() {
  const t = useTranslations("aiConfig");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [tab, setTab] = useState<AIConfigTab>("basic");

  const [selectedAssistant, setSelectedAssistant] = useState("closer");
  const [aiName, setAiName] = useState("Luna");
  const [aiRole, setAiRole] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [products, setProducts] = useState("");
  const [differentials, setDifferentials] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [debounceSeconds, setDebounceSeconds] = useState(8);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const INDUSTRIES = [
    "Marketing Digital", "E-commerce", "SaaS / Software",
    t("industry.education"), t("industry.health"), t("industry.consulting"),
    t("industry.realEstate"), t("industry.finance"), "Coaching",
    t("industry.services"), t("industry.retail"), t("industry.other"),
  ];

  useEffect(() => {
    fetch("/api/ai-config")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.assistantId) setSelectedAssistant(data.assistantId);
        if (data.aiName) setAiName(data.aiName);
        if (data.aiRole) setAiRole(data.aiRole);
        if (data.companyName) setCompanyName(data.companyName);
        if (data.industry) setIndustry(data.industry);
        if (data.companyDescription) setCompanyDescription(data.companyDescription);
        if (data.products) setProducts(data.products);
        if (data.differentials) setDifferentials(data.differentials);
        if (data.targetAudience) setTargetAudience(data.targetAudience);
        if (data.temperature != null) setTemperature(data.temperature);
        if (data.debounceSeconds != null) setDebounceSeconds(data.debounceSeconds);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function buildPrompt(): string {
    const def = ASSISTANT_DEFS.find(a => a.id === selectedAssistant)!;
    const info = [
      companyName && `Company: ${companyName}`, industry && `Industry: ${industry}`,
      companyDescription && `About: ${companyDescription}`, products && `Products/Services: ${products}`,
      differentials && `Differentials: ${differentials}`, targetAudience && `Target audience: ${targetAudience}`,
    ].filter(Boolean).join("\n");
    return def.promptTemplate
      .replace(/\{\{AI_NAME\}\}/g, aiName || "Luna")
      .replace(/\{\{AI_ROLE\}\}/g, aiRole || "Sales Consultant")
      .replace(/\{\{COMPANY_NAME\}\}/g, companyName || "the company")
      .replace(/\{\{COMPANY_INFO\}\}/g, info || "Company information not yet provided.");
  }

  async function handleSave() {
    if (!companyName.trim()) { showToast(t("fillCompanyName"), false); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/ai-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: selectedAssistant, aiName, aiRole, companyName, industry,
          companyDescription, products, differentials, targetAudience,
          systemPrompt: buildPrompt(), temperature, debounceSeconds,
        }),
      });
      if (r.ok) { setSaved(true); showToast(t("configSaved"), true); setTimeout(() => setSaved(false), 3000); }
      else showToast(t("errorSaving"), false);
    } catch { showToast(t("connectionError"), false); }
    setSaving(false);
  }

  async function startVoiceInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunks.current = [];
      mr.ondataavailable = e => audioChunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false); setTranscribing(true);
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("file", new File([blob], "voice.webm", { type: "audio/webm" }));
        fd.append("locale", locale);
        try {
          const tRes = await fetch("/api/ai-config", { method: "POST", body: fd });
          if (tRes.ok) {
            const parsed = await tRes.json();
            if (parsed.aiName) setAiName(parsed.aiName);
            if (parsed.aiRole) setAiRole(parsed.aiRole);
            if (parsed.companyName) setCompanyName(parsed.companyName);
            if (parsed.industry) setIndustry(parsed.industry);
            if (parsed.companyDescription) setCompanyDescription(parsed.companyDescription);
            if (parsed.products) setProducts(parsed.products);
            if (parsed.differentials) setDifferentials(parsed.differentials);
            if (parsed.targetAudience) setTargetAudience(parsed.targetAudience);
            showToast(t("filledByVoice"), true);
          } else { showToast(t("voiceError"), false); }
        } catch { showToast(t("connectionError"), false); }
        setTranscribing(false);
      };
      mr.start(); mediaRecorder.current = mr; setRecording(true);
    } catch { showToast(t("micError"), false); }
  }

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {toast && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
          toast.ok ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>{toast.msg}</div>
      )}

      <header className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -right-12 w-[280px] h-[280px] rounded-full bg-primary/[0.07] blur-[80px]" />
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
        <div className="relative p-6 sm:p-7 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-primary/12 border border-primary/25 text-primary text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-3">
              <Brain className="w-3 h-3" />
              {t("title")}
            </div>
            <h1 className="font-display text-[26px] sm:text-[30px] font-semibold text-foreground tracking-tight leading-tight">
              {t("chooseAssistant")}
            </h1>
            <p className="text-[13.5px] text-muted-foreground mt-2 max-w-xl leading-relaxed">
              {t("subtitle")}
            </p>
          </div>
          {tab === "basic" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><CheckCircle className="w-4 h-4" />{t("saved")}</> : <><Save className="w-4 h-4" />{tc("save")}</>}
            </button>
          )}
        </div>
      </header>

      {/* Tabs (segmented control) */}
      <div className="flex">
        <nav className="tab-bar">
          {([
            { id: "basic" as AIConfigTab, label: t("tabs.basic"), icon: Sliders },
            { id: "assistants" as AIConfigTab, label: t("tabs.assistants"), icon: Bot },
            { id: "knowledge" as AIConfigTab, label: t("tabs.knowledge"), icon: BookOpen },
            { id: "media" as AIConfigTab, label: t("tabs.media"), icon: Paperclip },
          ]).map((it) => (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              data-active={tab === it.id}
              className="tab-item"
            >
              <it.icon className="w-3.5 h-3.5" />
              {it.label}
            </button>
          ))}
        </nav>
      </div>

      {tab !== "basic" && (
        <>
          {tab === "assistants" && <AssistantsTab onToast={showToast} />}
          {tab === "knowledge" && <KnowledgeFilesTab onToast={showToast} />}
          {tab === "media" && <MediaLibraryTab onToast={showToast} />}
        </>
      )}

      {/* Original basic config below, only shown on "basic" tab */}
      {tab === "basic" && <>

      {/* Assistants */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-elevated">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">{t("chooseAssistant")}</h2>
            <p className="text-[12px] text-muted-foreground font-dm-sans mt-1">{t("chooseAssistantDesc")}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ASSISTANT_DEFS.map(a => {
            const Icon = a.icon; const sel = selectedAssistant === a.id;
            return (
              <button key={a.id} onClick={() => setSelectedAssistant(a.id)}
                className={cn(
                  "relative p-4 rounded-xl text-left cursor-pointer transition-all border overflow-hidden group",
                  sel
                    ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]"
                    : "border-border hover:border-primary/30 hover:bg-muted/30 hover:-translate-y-0.5"
                )}>
                {sel && (
                  <span aria-hidden className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-white/10", a.color)}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{t(`ast.${a.id}.name` as never)}</p>
                    <p className="text-[10.5px] text-muted-foreground truncate">{t(`ast.${a.id}.role` as never)}</p>
                  </div>
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed font-dm-sans">{t(`ast.${a.id}.desc` as never)}</p>
                <p className="text-[10px] text-primary mt-2 font-medium font-dm-sans">{t("idealFor")}: {t(`ast.${a.id}.bestFor` as any)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Personalize */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("customize")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("aiName")}</label>
            <input value={aiName} onChange={e => setAiName(e.target.value)} placeholder="Luna, Sarah..."
              className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("aiRole")}</label>
            <input value={aiRole} onChange={e => setAiRole(e.target.value)} placeholder={t("rolePlaceholder")}
              className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans" />
          </div>
        </div>
      </div>

      {/* Company Info */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("aboutCompany")}</h2>
          </div>
          <button onClick={() => recording ? mediaRecorder.current?.stop() : startVoiceInput()} disabled={transcribing}
            className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium cursor-pointer transition-all border",
              recording ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
              : transcribing ? "bg-muted text-muted-foreground border-border"
              : "text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            )}>
            {recording ? <><MicOff className="w-3.5 h-3.5" />{t("stopRecording")}</>
            : transcribing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t("processing")}</>
            : <><Mic className="w-3.5 h-3.5" />{t("fillByVoice")}</>}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground font-dm-sans -mt-2">
          {recording ? t("aboutCompanyRecording") : t("aboutCompanyDesc")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("companyName")} *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t("companyNamePlaceholder")}
              className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 font-dm-sans" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("sector")}</label>
            <select value={industry} onChange={e => setIndustry(e.target.value)}
              className="w-full h-10 px-4 rounded-xl bg-muted border border-transparent text-[13px] text-foreground focus:outline-none cursor-pointer font-dm-sans">
              <option value="">{t("selectSector")}</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>

        {[
          { key: "whatCompanyDoes", ph: "companyDoesPlaceholder", val: companyDescription, set: setCompanyDescription },
          { key: "products", ph: "productsPlaceholder", val: products, set: setProducts },
          { key: "differentials", ph: "differentialsPlaceholder", val: differentials, set: setDifferentials },
          { key: "targetAudience", ph: "audiencePlaceholder", val: targetAudience, set: setTargetAudience },
        ].map(f => (
          <div key={f.key}>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">{t(f.key as any)}</label>
            <textarea value={f.val} onChange={e => f.set(e.target.value)} rows={2} placeholder={t(f.ph as any)}
              className="w-full px-4 py-3 rounded-xl bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 resize-y focus:outline-none focus:border-ring/30 font-dm-sans leading-relaxed" />
          </div>
        ))}
      </div>

      {/* Advanced */}
      <button onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-between px-5 py-3 rounded-2xl border border-border bg-card cursor-pointer hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-muted-foreground" />
          <span className="text-[13px] font-medium text-foreground">{t("advancedSettings")}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showAdvanced && "rotate-180")} />
      </button>

      {showAdvanced && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {t("temperature")}: {temperature}, <span className="normal-case tracking-normal text-muted-foreground/40">{temperature <= 0.3 ? t("precise") : temperature <= 0.6 ? t("balanced") : t("creative")}</span>
            </label>
            <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {t("debounce")}: {debounceSeconds}s, <span className="normal-case tracking-normal text-muted-foreground/40">{t("debounceHint")}</span>
            </label>
            <input type="range" min="3" max="30" step="1" value={debounceSeconds} onChange={e => setDebounceSeconds(parseInt(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="w-full h-12 rounded-xl btn-brand text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><CheckCircle className="w-4 h-4" />{t("saved")}</> : <><Save className="w-4 h-4" />{t("saveConfig")}</>}
      </button>
      </>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ASSISTANTS TAB — named personas (CRUD)
// ════════════════════════════════════════════════════════════

function AssistantsTab({ onToast }: { onToast: (msg: string, ok: boolean) => void }) {
  const t = useTranslations("aiConfig.assistantsTab");
  const [items, setItems] = useState<NamedAssistant[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NamedAssistant | "new" | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assistants");
      if (res.ok) {
        const data = await res.json();
        setItems(data.assistants);
        setActiveId(data.activeAssistantId);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function activate(id: string | null) {
    const res = await fetch("/api/ai/assistants/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistantId: id }),
    });
    if (res.ok) { setActiveId(id); onToast(id ? t("activated") : t("deactivated"), true); }
    else onToast(t("error"), false);
  }

  async function remove(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    const res = await fetch(`/api/ai/assistants?id=${id}`, { method: "DELETE" });
    if (res.ok) { onToast(t("deleted"), true); reload(); }
    else onToast(t("error"), false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <header className="px-5 py-4 flex items-end justify-between gap-3 border-b border-border">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">{t("title")}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t("subtitle")}</p>
          </div>
          <Button onClick={() => setEditing("new")}>
            <Plus className="w-4 h-4 mr-1.5" />{t("create")}
          </Button>
        </header>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Bot} title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 p-4 rounded-xl border border-border bg-card/40 hover:bg-card/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-display text-[14px] font-semibold text-foreground">{a.name}</p>
                      {activeId === a.id && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
                          {t("active")}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono">{a.model}</span>
                    </div>
                    {a.description && <p className="text-[12.5px] text-muted-foreground line-clamp-2">{a.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant={activeId === a.id ? "default" : "outline"} size="sm"
                      onClick={() => activate(activeId === a.id ? null : a.id)} title={activeId === a.id ? t("deactivate") : t("activate")}>
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)} title={t("edit")}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive" title={t("remove")}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <AssistantModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onToast(t("saved"), true); reload(); }}
          onError={() => onToast(t("error"), false)}
        />
      )}
    </div>
  );
}

function AssistantModal({
  initial, onClose, onSaved, onError,
}: { initial: NamedAssistant | null; onClose: () => void; onSaved: () => void; onError: () => void }) {
  const t = useTranslations("aiConfig.assistantsTab");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [model, setModel] = useState(initial?.model || "gpt-4o");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt || "");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(initial?.maxTokens ?? 1000);
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 1 && systemPrompt.trim().length > 30;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    const res = await fetch("/api/ai/assistants", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: initial?.id,
        name: name.trim(),
        description: description.trim() || null,
        model,
        systemPrompt: systemPrompt.trim(),
        temperature,
        maxTokens,
      }),
    });
    setSaving(false);
    if (res.ok) onSaved(); else onError();
  }

  return (
    <ModalShell onClose={onClose} title={initial ? t("editTitle") : t("createTitle")} size="lg">
      <div className="space-y-4">
        <FormRow label={t("nameLabel")} hint={t("nameHint")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" placeholder={t("namePlaceholder")} />
        </FormRow>
        <FormRow label={t("descriptionLabel")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" placeholder={t("descriptionPlaceholder")} />
        </FormRow>
        <FormRow label={t("modelLabel")}>
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="w-full h-11 px-3 rounded-lg bg-muted border border-transparent text-sm text-foreground focus:outline-none focus:border-ring/30">
            <option value="gpt-4o">gpt-4o (recomendado)</option>
            <option value="gpt-4o-mini">gpt-4o-mini (mais barato)</option>
            <option value="claude-opus-4-7">claude-opus-4-7 (anthropic)</option>
            <option value="claude-sonnet-4-6">claude-sonnet-4-6 (anthropic)</option>
          </select>
        </FormRow>
        <FormRow label={t("promptLabel")} hint={t("promptHint")}>
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={10}
            placeholder={t("promptPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 resize-y focus:outline-none focus:border-ring/30 font-mono leading-relaxed" />
        </FormRow>
        <div className="grid sm:grid-cols-2 gap-3">
          <FormRow label={t("temperatureLabel", { value: temperature.toFixed(2) })}>
            <input type="range" min={0} max={1.5} step={0.05} value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))} className="w-full" />
            <p className="text-[10.5px] text-muted-foreground mt-1">{t("temperatureHint")}</p>
          </FormRow>
          <FormRow label={t("maxTokensLabel")}>
            <Input type="number" min={100} max={4000} step={50} value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))} className="h-11" />
          </FormRow>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════
// KNOWLEDGE FILES TAB
// ════════════════════════════════════════════════════════════

function KnowledgeFilesTab({ onToast }: { onToast: (msg: string, ok: boolean) => void }) {
  const t = useTranslations("aiConfig.knowledgeTab");
  const [files, setFiles] = useState<KnowledgeFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/files");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function remove(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    const res = await fetch(`/api/knowledge/files?id=${id}`, { method: "DELETE" });
    if (res.ok) { onToast(t("deleted"), true); reload(); } else onToast(t("error"), false);
  }

  async function reindex(id: string) {
    setReindexingId(id);
    try {
      const res = await fetch("/api/knowledge/files/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.indexed > 0) {
        onToast(t("reindexed"), true);
        reload();
      } else {
        onToast(t("reindexFailed"), false);
      }
    } finally {
      setReindexingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <header className="px-5 py-4 flex items-end justify-between gap-3 border-b border-border">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">{t("title")}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t("subtitle")}</p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" />{t("upload")}
          </Button>
        </header>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <EmptyState icon={BookOpen} title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-3 p-4 rounded-xl border border-border bg-card/40">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display text-[14px] font-semibold text-foreground truncate">{f.title}</p>
                        {f.indexed ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-medium border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            {t("indexed")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-medium border border-amber-500/20">
                            <AlertCircle className="w-3 h-3" />
                            {t("notIndexed")}
                          </span>
                        )}
                      </div>
                      {f.description && <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">{f.description}</p>}
                      <p className="text-[10.5px] text-muted-foreground mt-1 font-mono">{f.mimeType} - {formatSize(f.sizeBytes)}{f.indexed ? ` - ${f.indexedChars.toLocaleString()} ${t("chars")}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!f.indexed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={reindexingId === f.id}
                        onClick={() => reindex(f.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {reindexingId === f.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          t("reindex")
                        )}
                      </Button>
                    )}
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" className="text-[11.5px] text-muted-foreground hover:text-foreground underline underline-offset-2 px-2">{t("download")}</a>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {uploadOpen && (
        <KnowledgeUploadModal
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); onToast(t("saved"), true); reload(); }}
          onError={(msg) => onToast(msg || t("error"), false)}
        />
      )}
    </div>
  );
}

function KnowledgeUploadModal({
  onClose, onSaved, onError,
}: { onClose: () => void; onSaved: () => void; onError: (msg?: string) => void }) {
  const t = useTranslations("aiConfig.knowledgeTab");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = title.trim().length > 1 && !!file;

  async function submit() {
    if (!valid || !file) return;
    setSaving(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    form.append("description", description.trim());
    form.append("category", category.trim() || "general");
    const res = await fetch("/api/knowledge/files", { method: "POST", body: form });
    setSaving(false);
    if (res.ok) onSaved();
    else {
      const data = await res.json().catch(() => ({}));
      if (data.error === "FILE_TOO_LARGE") onError(t("tooLarge", { size: data.sizeMB ?? "?" }));
      else onError();
    }
  }

  return (
    <ModalShell onClose={onClose} title={t("uploadTitle")}>
      <div className="space-y-4">
        <FormRow label={t("fileLabel")} hint={t("fileHint")}>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/[0.03] transition-all text-center cursor-pointer">
            {file ? (
              <div className="flex items-center justify-center gap-2 text-[13px]">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-foreground font-medium">{file.name}</span>
                <span className="text-muted-foreground">({formatSize(file.size)})</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-[12.5px] text-muted-foreground">
                <Upload className="w-5 h-5" />
                <span>{t("clickToUpload")}</span>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xls,.xlsx,.ppt,.pptx"
            onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
        </FormRow>
        <FormRow label={t("titleLabel")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} className="h-11" />
        </FormRow>
        <FormRow label={t("descriptionLabel")} hint={t("descriptionHint")}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder={t("descriptionPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-muted border border-transparent text-sm resize-none focus:outline-none focus:border-ring/30" />
        </FormRow>
        <FormRow label={t("categoryLabel")}>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="general" className="h-11" />
        </FormRow>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Upload className="w-4 h-4 mr-1.5" />}
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════
// MEDIA LIBRARY TAB
// ════════════════════════════════════════════════════════════

function MediaLibraryTab({ onToast }: { onToast: (msg: string, ok: boolean) => void }) {
  const t = useTranslations("aiConfig.mediaTab");
  const [items, setItems] = useState<AssistantMediaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AssistantMediaEntry | "new" | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/media-library");
      if (res.ok) {
        const data = await res.json();
        setItems(data.media);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function toggleActive(item: AssistantMediaEntry) {
    const res = await fetch("/api/ai/media-library", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
    });
    if (res.ok) reload(); else onToast(t("error"), false);
  }
  async function remove(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    const res = await fetch(`/api/ai/media-library?id=${id}`, { method: "DELETE" });
    if (res.ok) { onToast(t("deleted"), true); reload(); } else onToast(t("error"), false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <header className="px-5 py-4 flex items-end justify-between gap-3 border-b border-border">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">{t("title")}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t("subtitle")}</p>
          </div>
          <Button onClick={() => setEditing("new")}>
            <Plus className="w-4 h-4 mr-1.5" />{t("upload")}
          </Button>
        </header>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Paperclip} title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {items.map((m) => (
                <MediaCard key={m.id} media={m}
                  onEdit={() => setEditing(m)}
                  onToggle={() => toggleActive(m)}
                  onRemove={() => remove(m.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <MediaModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onToast(t("saved"), true); reload(); }}
          onError={(msg) => onToast(msg || t("error"), false)}
        />
      )}
    </div>
  );
}

function MediaCard({
  media, onEdit, onToggle, onRemove,
}: { media: AssistantMediaEntry; onEdit: () => void; onToggle: () => void; onRemove: () => void }) {
  const t = useTranslations("aiConfig.mediaTab");
  const Icon = useMemo(() => {
    if (media.kind === "IMAGE") return ImageIcon;
    if (media.kind === "VIDEO") return Video;
    if (media.kind === "AUDIO") return FileAudio;
    return FileIcon;
  }, [media.kind]);

  return (
    <div className={cn("rounded-xl border bg-card/40 p-4 space-y-3 transition-colors",
      media.isActive ? "border-border" : "border-border/50 opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[14px] font-semibold text-foreground truncate">{media.name}</p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5 font-mono">{media.kind} • {formatSize(media.sizeBytes)}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("descriptionLabel")}</p>
        <p className="text-[12.5px] text-foreground/90 line-clamp-2">{media.description}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("sendInstructionLabel")}</p>
        <p className="text-[12.5px] text-foreground/90 line-clamp-3">{media.sendInstruction}</p>
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <button onClick={onToggle}
          className={cn("text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border cursor-pointer",
            media.isActive ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border")}>
          {media.isActive ? t("active") : t("inactive")}
        </button>
        <div className="flex items-center gap-1">
          {media.url && <a href={media.url} target="_blank" rel="noreferrer" className="text-[11.5px] text-muted-foreground hover:text-foreground underline underline-offset-2 px-2">{t("preview")}</a>}
          <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

function MediaModal({
  initial, onClose, onSaved, onError,
}: { initial: AssistantMediaEntry | null; onClose: () => void; onSaved: () => void; onError: (msg?: string) => void }) {
  const t = useTranslations("aiConfig.mediaTab");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [sendInstruction, setSendInstruction] = useState(initial?.sendInstruction || "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const validNew = name.trim() && description.trim() && sendInstruction.trim() && !!file;
  const validEdit = !!initial && name.trim() && description.trim() && sendInstruction.trim();
  const valid = initial ? validEdit : validNew;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    if (initial) {
      const res = await fetch("/api/ai/media-library", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initial.id, name: name.trim(),
          description: description.trim(), sendInstruction: sendInstruction.trim(),
        }),
      });
      setSaving(false);
      if (res.ok) onSaved(); else onError();
    } else {
      const form = new FormData();
      form.append("file", file as File);
      form.append("name", name.trim());
      form.append("description", description.trim());
      form.append("sendInstruction", sendInstruction.trim());
      const res = await fetch("/api/ai/media-library", { method: "POST", body: form });
      setSaving(false);
      if (res.ok) onSaved();
      else {
        const data = await res.json().catch(() => ({}));
        if (data.error === "FILE_TOO_LARGE") onError(t("tooLarge", { size: data.sizeMB ?? "?" }));
        else onError();
      }
    }
  }

  return (
    <ModalShell onClose={onClose} title={initial ? t("editTitle") : t("uploadTitle")} size="lg">
      <div className="space-y-4">
        {!initial && (
          <FormRow label={t("fileLabel")} hint={t("fileHint")}>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/[0.03] transition-all text-center cursor-pointer">
              {file ? (
                <div className="flex items-center justify-center gap-2 text-[13px]">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-foreground font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({formatSize(file.size)})</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-[12.5px] text-muted-foreground">
                  <Upload className="w-5 h-5" />
                  <span>{t("clickToUpload")}</span>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
          </FormRow>
        )}
        <FormRow label={t("nameLabel")} hint={t("nameHint")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="h-11" />
        </FormRow>
        <FormRow label={t("descriptionLabel")} hint={t("descriptionHint")}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder={t("descriptionPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-muted border border-transparent text-sm resize-none focus:outline-none focus:border-ring/30" />
        </FormRow>
        <FormRow label={t("sendInstructionLabel")} hint={t("sendInstructionHint")}>
          <textarea value={sendInstruction} onChange={(e) => setSendInstruction(e.target.value)} rows={4}
            placeholder={t("sendInstructionPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-muted border border-transparent text-sm resize-none focus:outline-none focus:border-ring/30" />
        </FormRow>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ────── Shared building blocks ──────

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11.5px] font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80 mt-1">{hint}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-3">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
        <Icon className="w-6 h-6" />
      </div>
      <div className="space-y-1 max-w-md">
        <p className="font-display text-[15px] font-semibold text-foreground">{title}</p>
        <p className="text-[12.5px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ModalShell({
  onClose, title, children, size = "md",
}: { onClose: () => void; title: string; children: React.ReactNode; size?: "md" | "lg" }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/80 backdrop-blur-sm">
      <div className={cn("w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl",
        size === "lg" ? "max-w-[680px]" : "max-w-[560px]")}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-[15px] font-semibold text-foreground">{title}</h2>
          <button onClick={onClose}
            className="w-7 h-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Suppress unused warnings (kept for future inline notifications)
void AlertCircle;
void CheckCircle2;