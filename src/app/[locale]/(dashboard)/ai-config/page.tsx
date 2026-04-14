// src/app/[locale]/(dashboard)/ai-config/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Brain, Loader2, Save, CheckCircle, Target, Heart, Zap, Calendar,
  Building, Mic, MicOff, ChevronDown,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    promptTemplate: `You qualify leads and schedule meetings. Your job is NOT to sell — it's to ensure qualified leads arrive prepared.

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
    promptTemplate: `You are an ultra-fast digital attendant. The lead knows what they want — give info and facilitate purchase. Zero fluff.

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
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {toast && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg border animate-in slide-in-from-top-2",
          toast.ok ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>{toast.msg}</div>
      )}

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

      {/* Assistants */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-space-grotesk text-[14px] font-semibold text-foreground">{t("chooseAssistant")}</h2>
        <p className="text-[11px] text-muted-foreground font-dm-sans -mt-2">{t("chooseAssistantDesc")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ASSISTANT_DEFS.map(a => {
            const Icon = a.icon; const sel = selectedAssistant === a.id;
            return (
              <button key={a.id} onClick={() => setSelectedAssistant(a.id)}
                className={cn("p-4 rounded-xl border-2 text-left cursor-pointer transition-all", sel ? "border-primary bg-primary/[0.04]" : "border-border hover:border-primary/20")}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", a.color)}><Icon className="w-4 h-4 text-white" /></div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{t(`ast.${a.id}.name` as any)}</p>
                    <p className="text-[10px] text-muted-foreground">{t(`ast.${a.id}.role` as any)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed font-dm-sans">{t(`ast.${a.id}.desc` as any)}</p>
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
              {t("temperature")}: {temperature} — <span className="normal-case tracking-normal text-muted-foreground/40">{temperature <= 0.3 ? t("precise") : temperature <= 0.6 ? t("balanced") : t("creative")}</span>
            </label>
            <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {t("debounce")}: {debounceSeconds}s — <span className="normal-case tracking-normal text-muted-foreground/40">{t("debounceHint")}</span>
            </label>
            <input type="range" min="3" max="30" step="1" value={debounceSeconds} onChange={e => setDebounceSeconds(parseInt(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="w-full h-12 rounded-xl btn-brand text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><CheckCircle className="w-4 h-4" />{t("saved")}</> : <><Save className="w-4 h-4" />{t("saveConfig")}</>}
      </button>
    </div>
  );
}