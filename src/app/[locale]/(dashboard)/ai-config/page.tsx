// src/app/dashboard/ai-config/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Brain,
  MessageSquare,
  Shield,
  Clock,
  Save,
  Loader2,
  Plus,
  X,
  Zap,
  Globe,
  Sliders,
  FileText,
  Sparkles,
} from "lucide-react";

function cn(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

// ══════════════════════════════════════
// TYPES
// ══════════════════════════════════════
interface AIConfig {
  aiName: string;
  aiRole: string;
  tone: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  provider: string;
  model: string;
  language: string;
  rules: string[];
  escalationTriggers: string;
  conversionTriggers: string;
  offHoursMessage: string;
  followUpDelay: string;
  aiInitiatesContact: boolean;
  firstMessageInstruction: string;
  debounceSeconds: number;
}

const DEFAULT_CONFIG: AIConfig = {
  aiName: "Luna",
  aiRole: "Consultora de Vendas",
  tone: "professional_friendly",
  systemPrompt: "Você é uma consultora de vendas especializada. Seu objetivo é entender as necessidades do lead, apresentar soluções relevantes e guiar o lead em direção à conversão. Seja natural, empática e profissional.",
  temperature: 0.7,
  maxTokens: 500,
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  language: "auto",
  rules: [
    "Nunca invente informações sobre preços ou funcionalidades",
    "Se o lead pedir para falar com humano, escale imediatamente",
    "Sempre cumprimente o lead pelo nome quando disponível",
    "Faça no máximo 2 perguntas por mensagem",
    "Se o lead disser que não tem interesse, agradeça e encerre educadamente",
  ],
  escalationTriggers: "falar com gerente, problema técnico, reclamação, insatisfeito",
  conversionTriggers: "quero comprar, manda o link, como faço para pagar, quero fechar",
  offHoursMessage: "",
  followUpDelay: "30",
  aiInitiatesContact: true,
  firstMessageInstruction: "Cumprimente pelo nome, mencione a campanha que trouxe o lead, faça uma pergunta aberta sobre o que ele procura. Seja caloroso mas não exagerado.",
  debounceSeconds: 8,
};

const TABS = [
  { key: "persona", label: "Persona", icon: Bot },
  { key: "rules", label: "Regras", icon: Shield },
  { key: "firstMessage", label: "1ª Mensagem", icon: MessageSquare },
  { key: "advanced", label: "Avançado", icon: Sliders },
];

const TONE_OPTIONS = [
  { value: "professional_friendly", label: "Profissional e Amigável" },
  { value: "formal", label: "Formal e Corporativo" },
  { value: "casual", label: "Casual e Descontraído" },
  { value: "enthusiastic", label: "Entusiasmado e Energético" },
  { value: "consultative", label: "Consultivo e Analítico" },
];

// ══════════════════════════════════════
// PAGE
// ══════════════════════════════════════
export default function AIConfigPage() {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [tab, setTab] = useState("persona");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newRule, setNewRule] = useState("");

  // Load config
  useEffect(() => {
    fetch("/api/ai-config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setConfig(data))
      .catch(() => {});
  }, []);

  // Save
  async function saveConfig() {
    setSaving(true);
    try {
      await fetch("/api/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  // Update helper
  function set<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  // Add rule
  function addRule() {
    if (newRule.trim() && config.rules.length < 15) {
      set("rules", [...config.rules, newRule.trim()]);
      setNewRule("");
    }
  }

  // Remove rule
  function removeRule(index: number) {
    set("rules", config.rules.filter((_, i) => i !== index));
  }

  // Field component
  function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">{label}</label>
        {children}
        {hint && <p className="text-[10px] text-zinc-600 mt-1 font-body">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight font-display">Configuração da IA</h1>
          <p className="text-sm text-zinc-500 mt-1 font-body">Defina como a IA interage com seus leads</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-brand text-[12px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Save className="w-4 h-4" />Salvo!</> : <><Save className="w-4 h-4" />Salvar</>}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                tab === t.key ? "bg-[#B9F495] text-black" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══ PERSONA ═══ */}
      {tab === "persona" && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-white font-display">Identidade da IA</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5 font-body">Quem é a IA? Dê a ela um nome e um papel.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome da IA" hint="O nome que seus leads verão">
                <input value={config.aiName} onChange={(e) => set("aiName", e.target.value)} placeholder="Ex: Luna, Sarah, Alex..." className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body" />
              </Field>
              <Field label="Cargo / Função" hint="O que a IA faz?">
                <input value={config.aiRole} onChange={(e) => set("aiRole", e.target.value)} placeholder="Ex: Consultora de Vendas..." className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body" />
              </Field>
            </div>
            <Field label="Tom da Conversa">
              <select value={config.tone} onChange={(e) => set("tone", e.target.value)} className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-zinc-300 focus:outline-none focus:border-[#B9F495]/30 appearance-none cursor-pointer font-body">
                {TONE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </Field>
            <Field label="Idioma de Atendimento" hint="'auto' detecta o idioma do lead automaticamente">
              <select value={config.language} onChange={(e) => set("language", e.target.value)} className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-zinc-300 focus:outline-none focus:border-[#B9F495]/30 appearance-none cursor-pointer font-body">
                <option value="auto">Automático (detecta o idioma do lead)</option>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
              </select>
            </Field>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-white font-display">System Prompt</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5 font-body">Defina o comportamento principal da IA.</p>
            </div>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 resize-y focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body leading-relaxed"
            />
          </div>
        </div>
      )}

      {/* ═══ RULES ═══ */}
      {tab === "rules" && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-white font-display">Regras de Comportamento</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5 font-body">Instruções que a IA sempre deve seguir ({config.rules.length}/15).</p>
            </div>
            <div className="space-y-2">
              {config.rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] group">
                  <span className="text-[11px] font-bold text-[#B9F495] w-5 shrink-0">{i + 1}.</span>
                  <p className="flex-1 text-[12px] text-zinc-300 font-body">{rule}</p>
                  <button onClick={() => removeRule(i)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule()}
                placeholder="Adicionar nova regra..."
                className="flex-1 h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body"
              />
              <button onClick={addRule} disabled={!newRule.trim()} className="flex items-center gap-1.5 px-4 h-10 rounded-xl btn-brand text-[12px] font-semibold cursor-pointer disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-white font-display">Gatilhos</h3>
            <Field label="Gatilhos de Escalação" hint="Quando passar para atendimento humano">
              <textarea value={config.escalationTriggers} onChange={(e) => set("escalationTriggers", e.target.value)} rows={2} placeholder="Ex: falar com gerente, reclamação..." className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body" />
            </Field>
            <Field label="Gatilhos de Conversão" hint="O que sinaliza uma venda">
              <textarea value={config.conversionTriggers} onChange={(e) => set("conversionTriggers", e.target.value)} rows={2} placeholder="Ex: quero comprar, manda o link..." className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body" />
            </Field>
          </div>
        </div>
      )}

      {/* ═══ FIRST MESSAGE ═══ */}
      {tab === "firstMessage" && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-white font-display">Primeira Mensagem</h3>
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div>
                <p className="text-[12px] font-medium text-white font-body">A IA inicia a conversa</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-body">O lead deixou os dados e quer ser contatado</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={config.aiInitiatesContact} onChange={(e) => set("aiInitiatesContact", e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-white/[0.08] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-zinc-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#B9F495] peer-checked:after:bg-black" />
              </label>
            </div>

            {config.aiInitiatesContact && (
              <div className="animate-up">
                <Field label="Instrução para a primeira mensagem" hint="A IA gera uma mensagem única baseada nesta instrução — nunca será repetitiva">
                  <textarea value={config.firstMessageInstruction} onChange={(e) => set("firstMessageInstruction", e.target.value)} rows={4} placeholder="Ex: Cumprimente pelo nome, mencione a campanha..." className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 resize-y focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body leading-relaxed" />
                </Field>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ADVANCED ═══ */}
      {tab === "advanced" && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-white font-display">Modelo e Parâmetros</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Provider">
                <select value={config.provider} onChange={(e) => set("provider", e.target.value)} className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-zinc-300 focus:outline-none focus:border-[#B9F495]/30 appearance-none cursor-pointer font-body">
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </Field>
              <Field label="Modelo">
                <select value={config.model} onChange={(e) => set("model", e.target.value)} className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-zinc-300 focus:outline-none focus:border-[#B9F495]/30 appearance-none cursor-pointer font-body">
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                </select>
              </Field>
            </div>

            <Field label={`Temperatura: ${config.temperature}`} hint="Controla a criatividade (0 = preciso, 1 = criativo)">
              <input type="range" min="0" max="1" step="0.1" value={config.temperature} onChange={(e) => set("temperature", parseFloat(e.target.value))} className="w-full accent-[#B9F495]" />
            </Field>

            <Field label="Max Tokens">
              <input type="number" value={config.maxTokens} onChange={(e) => set("maxTokens", parseInt(e.target.value))} className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body" />
            </Field>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-white font-display">Comportamento de Resposta</h3>
            <Field label={`Debounce: ${config.debounceSeconds}s`} hint="Tempo que a IA espera após a última mensagem do lead antes de responder (para não responder mensagens fragmentadas)">
              <input type="range" min="3" max="30" step="1" value={config.debounceSeconds} onChange={(e) => set("debounceSeconds", parseInt(e.target.value))} className="w-full accent-[#B9F495]" />
            </Field>

            <Field label="Delay de Follow-up">
              <select value={config.followUpDelay} onChange={(e) => set("followUpDelay", e.target.value)} className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-zinc-300 focus:outline-none focus:border-[#B9F495]/30 appearance-none cursor-pointer font-body">
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="120">2 horas</option>
                <option value="1440">24 horas</option>
                <option value="0">Sem follow-up</option>
              </select>
            </Field>

            <Field label="Mensagem fora do horário" hint="Deixe vazio para a IA responder 24/7">
              <textarea value={config.offHoursMessage} onChange={(e) => set("offHoursMessage", e.target.value)} rows={2} placeholder="Deixe vazio para responder 24/7..." className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-[#B9F495]/30 transition-colors font-body" />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}