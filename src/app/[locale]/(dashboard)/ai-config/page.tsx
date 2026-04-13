// src/app/[locale]/(dashboard)/ai-config/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, CheckCircle, User, Target, Shield, BookOpen, Brain,
  Upload, X, FileText, Image, Video, Eye, EyeOff, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Sales method presets
const SALES_METHODS: Record<string, { name: string; desc: string; prompt: string }> = {
  consultive: {
    name: "Consultivo",
    desc: "Entende as necessidades antes de oferecer soluções",
    prompt: "Use vendas CONSULTIVAS: Faça perguntas para entender as necessidades do lead antes de apresentar soluções. Escute mais do que fale. Nunca empurre o produto sem antes entender o que o lead precisa.",
  },
  spin: {
    name: "SPIN Selling",
    desc: "Foca na dor e no problema do cliente",
    prompt: "Use SPIN Selling: Foque na Situação do lead, identifique o Problema, explore as Implicações desse problema, e mostre a Necessidade de solução. Faça o lead sentir a dor antes de apresentar a solução.",
  },
  challenger: {
    name: "Challenger",
    desc: "Educa e desafia o pensamento do cliente",
    prompt: "Use vendas CHALLENGER: Ensine algo novo ao lead, adapte sua abordagem ao perfil dele, e tome controle da conversa. Compartilhe insights que desafiem o pensamento do lead e mostrem uma nova perspectiva.",
  },
  solution: {
    name: "Venda de Soluções",
    desc: "Apresenta seu produto como a solução ideal",
    prompt: "Use VENDA DE SOLUÇÕES: Identifique problemas específicos do lead e apresente seu produto/serviço como a solução ideal. Conecte cada funcionalidade a uma necessidade real do lead.",
  },
  relationship: {
    name: "Relacionamento",
    desc: "Constrói confiança antes de vender",
    prompt: "Use vendas por RELACIONAMENTO: Construa confiança primeiro. A venda vem naturalmente da conexão genuína. Seja paciente, mostre interesse real no lead, e nunca force uma venda.",
  },
  urgency: {
    name: "Urgência e Escassez",
    desc: "Usa FOMO e ofertas limitadas",
    prompt: "Crie URGÊNCIA: Use escassez, ofertas por tempo limitado e FOMO para impulsionar decisões. Mas nunca minta sobre prazos ou disponibilidade. Seja honesto sobre as limitações reais.",
  },
  wolf: {
    name: "Straight Line (Jordan Belfort)",
    desc: "Controle total da conversa, fechamento direto",
    prompt: "Use o método STRAIGHT LINE: Mantenha controle total da conversa. Cada mensagem deve mover o lead em direção ao fechamento. Antecipe objeções, responda com confiança, e sempre peça o fechamento. Seja persuasivo mas ético.",
  },
};

type Tab = "persona" | "business" | "rules" | "firstMessage" | "materials" | "advanced";

export default function AIConfigPage() {
  const t = useTranslations("aiConfig");
  const tc = useTranslations("common");
  const [tab, setTab] = useState<Tab>("persona");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Model
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  // Persona
  const [aiName, setAiName] = useState("");
  const [aiRole, setAiRole] = useState("");
  const [tone, setTone] = useState("friendly_professional");
  const [personality, setPersonality] = useState("");
  const [emojiFreq, setEmojiFreq] = useState("rare");
  const [language, setLanguage] = useState("auto");
  const [salesMethod, setSalesMethod] = useState("consultive");

  // Business
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [mainProduct, setMainProduct] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [uniqueValue, setUniqueValue] = useState("");
  const [commonObjections, setCommonObjections] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [ecommerceUrl, setEcommerceUrl] = useState("");

  // Rules
  const [msgLength, setMsgLength] = useState("medium");
  const [responseStyle, setResponseStyle] = useState("conversational");
  const [neverSay, setNeverSay] = useState("");
  const [alwaysMention, setAlwaysMention] = useState("");
  const [escalationTriggers, setEscalationTriggers] = useState("");
  const [conversionTriggers, setConversionTriggers] = useState("");
  const [offHoursMsg, setOffHoursMsg] = useState("");
  const [followUpDelay, setFollowUpDelay] = useState("30");

  // First message
  const [aiInitiates, setAiInitiates] = useState(true);
  const [firstMsgInstruction, setFirstMsgInstruction] = useState("");

  // Materials
  const [materials, setMaterials] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  useEffect(() => {
    if (!useCustomPrompt) setGeneratedPrompt(buildPrompt());
  }, [aiName, aiRole, tone, personality, emojiFreq, language, salesMethod, companyName, industry, mainProduct, targetAudience, uniqueValue, commonObjections, priceRange, callToAction, websiteUrl, ecommerceUrl, msgLength, responseStyle, neverSay, alwaysMention, escalationTriggers, conversionTriggers, offHoursMsg, aiInitiates, firstMsgInstruction, useCustomPrompt]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/ai-config`);
      if (res.ok) {
        const d = await res.json();
        if (d) {
          setProvider(d.provider || "openai");
          setModel(d.model || "gpt-4o");
          setTemperature(d.temperature ?? 0.7);
          setMaxTokens(d.maxTokens ?? 1000);
          setCustomPrompt(d.systemPrompt || "");
          if (d.persona) {
            const p = d.persona;
            setAiName(p.name || ""); setAiRole(p.role || ""); setTone(p.tone || "friendly_professional");
            setPersonality(p.personality || ""); setEmojiFreq(p.emojiFrequency || "rare");
            setLanguage(p.language || "auto"); setSalesMethod(p.salesMethod || "consultive");
          }
          if (d.rules) {
            const r = d.rules;
            if (r.business) {
              const b = r.business;
              setCompanyName(b.companyName || ""); setIndustry(b.industry || "");
              setMainProduct(b.mainProduct || ""); setTargetAudience(b.targetAudience || "");
              setUniqueValue(b.uniqueValue || ""); setCommonObjections(b.commonObjections || "");
              setPriceRange(b.priceRange || ""); setCallToAction(b.callToAction || "");
              setWebsiteUrl(b.websiteUrl || ""); setEcommerceUrl(b.ecommerceUrl || "");
            }
            if (r.rules) {
              const ru = r.rules;
              setMsgLength(ru.maxMessageLength || "medium"); setResponseStyle(ru.responseStyle || "conversational");
              setNeverSay(Array.isArray(ru.neverSay) ? ru.neverSay.join("\n") : ru.neverSay || "");
              setAlwaysMention(Array.isArray(ru.alwaysMention) ? ru.alwaysMention.join("\n") : ru.alwaysMention || "");
              setEscalationTriggers(ru.escalationTriggers || ""); setConversionTriggers(ru.conversionTriggers || "");
              setOffHoursMsg(ru.offHoursMessage || ""); setFollowUpDelay(ru.followUpDelay || "30");
            }
            if (r.firstMessage) {
              setAiInitiates(r.firstMessage.aiInitiates ?? true);
              setFirstMsgInstruction(r.firstMessage.instruction || "");
            }
            if (r.useCustomPrompt) setUseCustomPrompt(true);
          }
        }
      }
    } catch {}
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${window.location.origin}/api/ai-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider, model, temperature, maxTokens,
          systemPrompt: useCustomPrompt ? customPrompt : generatedPrompt,
          persona: { name: aiName, role: aiRole, tone, personality, emojiFrequency: emojiFreq, language, salesMethod },
          rules: {
            business: { companyName, industry, mainProduct, targetAudience, uniqueValue, commonObjections, priceRange, callToAction, websiteUrl, ecommerceUrl },
            rules: { maxMessageLength: msgLength, responseStyle, neverSay: neverSay.split("\n").filter(Boolean), alwaysMention: alwaysMention.split("\n").filter(Boolean), escalationTriggers, conversionTriggers, offHoursMessage: offHoursMsg, followUpDelay },
            firstMessage: { aiInitiates, instruction: firstMsgInstruction },
            useCustomPrompt,
          },
        }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append("file", file);
      try {
        const res = await fetch(`${window.location.origin}/api/uploads`, { method: "POST", body: fd });
        const d = await res.json();
        if (d.url) {
          const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "pdf";
          setMaterials(prev => [...prev, { id: crypto.randomUUID(), name: file.name, type, url: d.url, size: file.size, description: "", sendWhen: "" }]);
        }
      } catch {}
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  function buildPrompt(): string {
    const l: string[] = [];
    l.push(`Você é ${aiName || "um assistente de vendas"}${aiRole ? `, ${aiRole}` : ""} da ${companyName || "empresa"}.`);
    if (personality) { l.push(""); l.push(`=== PERSONALIDADE ===`); l.push(personality); }
    const tones: Record<string, string> = {
      friendly_professional: "Seja amigável e profissional — caloroso mas não casual demais.",
      casual: "Seja casual e descontraído — fale como um amigo.",
      formal: "Mantenha tom formal e corporativo.",
      enthusiastic: "Seja entusiasmado e energético.",
      empathetic: "Seja empático e compreensivo — escute primeiro.",
      direct: "Seja direto e objetivo — sem enrolação.",
      humorous: "Use humor leve para criar conexão.",
    };
    l.push(""); l.push(`=== TOM DE VOZ ===`); l.push(tones[tone] || "Seja profissional.");
    const emojis: Record<string, string> = { never: "NUNCA use emojis.", rare: "Use emojis com moderação — só em saudações.", moderate: "Use emojis naturalmente.", frequent: "Use emojis expressivamente." };
    l.push(emojis[emojiFreq] || "");
    if (language === "auto") l.push("Detecte automaticamente e responda no idioma do lead."); else l.push(`Sempre responda em ${language === "pt" ? "Português" : language === "en" ? "Inglês" : "Espanhol"}.`);
    const sm = SALES_METHODS[salesMethod];
    if (sm) { l.push(""); l.push(`=== MÉTODO DE VENDAS ===`); l.push(sm.prompt); }
    if (mainProduct || industry) {
      l.push(""); l.push(`=== CONTEXTO DO NEGÓCIO ===`);
      if (industry) l.push(`Setor: ${industry}`);
      if (mainProduct) l.push(`Produto/Serviço: ${mainProduct}`);
      if (targetAudience) l.push(`Público-alvo: ${targetAudience}`);
      if (uniqueValue) l.push(`Diferencial: ${uniqueValue}`);
      if (priceRange) l.push(`Faixa de preço: ${priceRange}`);
      if (callToAction) l.push(`Objetivo: Guiar leads para → ${callToAction}`);
      if (websiteUrl) l.push(`Site: ${websiteUrl}`);
      if (ecommerceUrl) l.push(`Loja: ${ecommerceUrl}`);
    }
    if (commonObjections) { l.push(""); l.push(`=== OBJEÇÕES COMUNS ===`); l.push(commonObjections); }
    l.push(""); l.push(`=== REGRAS ===`);
    const lengths: Record<string, string> = { short: "Mensagens curtas: 1-2 frases.", medium: "Mensagens concisas: 2-4 frases.", detailed: "Pode escrever mensagens mais longas quando necessário." };
    l.push(lengths[msgLength] || "Seja conciso.");
    const styles: Record<string, string> = { conversational: "Escreva como se estivesse conversando — natural e fluido.", structured: "Organize as respostas em pontos claros.", storytelling: "Use histórias e exemplos." };
    l.push(styles[responseStyle] || "Seja conversacional.");
    const ns = neverSay.split("\n").filter(Boolean);
    if (ns.length) l.push(`NUNCA mencione: ${ns.join(", ")}`);
    const am = alwaysMention.split("\n").filter(Boolean);
    if (am.length) l.push(`Sempre inclua naturalmente: ${am.join(", ")}`);
    l.push("NUNCA invente informações que não foram fornecidas.");
    l.push("Se não souber algo, diga que vai verificar.");
    if (escalationTriggers) { l.push(""); l.push(`=== ESCALAÇÃO ===`); l.push(`Passe para um humano quando: ${escalationTriggers}`); }
    if (conversionTriggers) { l.push(""); l.push(`=== CONVERSÃO ===`); l.push(`Marque como venda quando: ${conversionTriggers}`); }
    if (offHoursMsg) { l.push(""); l.push(`=== FORA DO HORÁRIO ===`); l.push(`Mensagem: "${offHoursMsg}"`); }
    if (aiInitiates && firstMsgInstruction) { l.push(""); l.push(`=== PRIMEIRA MENSAGEM ===`); l.push(`Ao fazer o primeiro contato com o lead, siga esta instrução: ${firstMsgInstruction}`); }
    return l.join("\n");
  }

  const tabs: { key: Tab; icon: React.ComponentType<any>; label: string }[] = [
    { key: "persona", icon: User, label: "Persona" },
    { key: "business", icon: Target, label: "Negócio" },
    { key: "rules", icon: Shield, label: "Regras" },
    { key: "firstMessage", icon: MessageSquare, label: "1ª Mensagem" },
    { key: "materials", icon: BookOpen, label: "Materiais" },
    { key: "advanced", icon: Brain, label: "Avançado" },
  ];

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--fg-3)]" /></div>;

  return (
    <div className="max-w-3xl space-y-5 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-medium text-[17px] tracking-[-0.01em] text-[var(--fg)]">{t("title")}</h1>
          <p className="font-body text-[10px] text-[var(--fg-3)] mt-px">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="flex items-center gap-1 text-[10px] text-[var(--emerald)] font-body animate-in"><CheckCircle className="w-3 h-3" />{tc("savedSuccessfully")}</span>}
          <Button onClick={handleSave} disabled={saving} className="h-8 text-[11px] font-body font-medium bg-[var(--brand)] text-black hover:bg-[var(--brand-hover)]">
            {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}{tc("save")}
          </Button>
        </div>
      </div>

      <div className="flex gap-0.5 border-b border-[var(--border)] overflow-x-auto">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className={cn(
            "flex items-center gap-1 px-2.5 py-2 text-[10px] font-medium font-body border-b-[1.5px] -mb-px transition-colors whitespace-nowrap",
            tab === tb.key ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--fg-3)] hover:text-[var(--fg-2)]"
          )}>
            <tb.icon className="w-3 h-3" />{tb.label}
          </button>
        ))}
      </div>

      <div className="animate-up">
        {/* ── PERSONA ── */}
        {tab === "persona" && (
          <div className="space-y-4">
            <Card title="Identidade da IA" desc="Quem é a IA? Dê um nome e função para parecer humano.">
              <div className="grid grid-cols-2 gap-2">
                <F label="Nome da IA" placeholder="Ex: Sarah, Alex, Luna..." value={aiName} onChange={setAiName} hint="O nome que seus leads vão ver" />
                <F label="Cargo / Função" placeholder="Ex: Consultor de Vendas..." value={aiRole} onChange={setAiRole} hint="O que a IA faz na sua empresa?" />
              </div>
            </Card>
            <Card title="Tom e Personalidade" desc="Como a IA deve soar nas conversas?">
              <div className="grid grid-cols-2 gap-2">
                <Sel label="Tom de voz" value={tone} onChange={setTone} options={[
                  { value: "friendly_professional", label: "Amigável e Profissional" },
                  { value: "casual", label: "Casual e Descontraído" },
                  { value: "formal", label: "Formal e Corporativo" },
                  { value: "enthusiastic", label: "Entusiasmado e Energético" },
                  { value: "empathetic", label: "Empático e Compreensivo" },
                  { value: "direct", label: "Direto e Objetivo" },
                  { value: "humorous", label: "Leve e Bem-humorado" },
                ]} />
                <Sel label="Emojis" value={emojiFreq} onChange={setEmojiFreq} options={[
                  { value: "never", label: "Nunca usar emojis" },
                  { value: "rare", label: "Raramente (só saudações)" },
                  { value: "moderate", label: "Moderado (uso natural)" },
                  { value: "frequent", label: "Frequente (expressivo)" },
                ]} />
              </div>
              <F label="Descrição da personalidade" placeholder="Ex: Paciente, bom ouvinte, sabe quando insistir..." value={personality} onChange={setPersonality} multi hint="Descreva como se fosse uma pessoa real" />
              <Sel label="Idioma" value={language} onChange={setLanguage} options={[
                { value: "auto", label: "Auto-detectar (responde no idioma do lead)" },
                { value: "pt", label: "Português" },
                { value: "en", label: "Inglês" },
                { value: "es", label: "Espanhol" },
              ]} />
            </Card>
            <Card title="Método de vendas" desc="Como a IA deve abordar os leads? Cada método tem uma estratégia pré-configurada.">
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(SALES_METHODS).map(([key, m]) => (
                  <button key={key} onClick={() => setSalesMethod(key)} className={cn(
                    "flex items-start gap-2.5 p-2.5 rounded-[6px] text-left transition-all duration-150 border",
                    salesMethod === key
                      ? "bg-[var(--brand-muted)] border-[var(--brand)]/20"
                      : "bg-transparent border-[var(--border)] hover:border-[var(--fg-4)]"
                  )}>
                    <div className={cn("w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 transition-colors",
                      salesMethod === key ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--fg-4)]"
                    )} />
                    <div>
                      <p className="font-body text-[11px] font-medium text-[var(--fg)]">{m.name}</p>
                      <p className="font-body text-[9px] text-[var(--fg-3)] mt-px">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── BUSINESS ── */}
        {tab === "business" && (
          <div className="space-y-4">
            <Card title="Seu negócio" desc="A IA precisa conhecer seu negócio para vender bem.">
              <div className="grid grid-cols-2 gap-2">
                <F label="Nome da empresa" value={companyName} onChange={setCompanyName} placeholder="Sua empresa" />
                <F label="Setor" value={industry} onChange={setIndustry} placeholder="Ex: E-commerce, Imobiliário, SaaS..." />
              </div>
              <F label="Produto / Serviço principal" value={mainProduct} onChange={setMainProduct} placeholder="O que você vende? Descreva com detalhes." multi hint="Quanto mais detalhe, melhor a IA vende" />
              <F label="Público-alvo" value={targetAudience} onChange={setTargetAudience} placeholder="Quem compra? Idade, interesses, dores..." multi />
              <F label="Diferencial competitivo" value={uniqueValue} onChange={setUniqueValue} placeholder="O que te diferencia dos concorrentes?" multi />
              <F label="Faixa de preço" value={priceRange} onChange={setPriceRange} placeholder="Ex: R$29-99/mês, $500-2000, consulta grátis..." />
            </Card>
            <Card title="Objeções comuns" desc="O que os leads costumam questionar? A IA estará preparada.">
              <F label="Objeções e como responder" value={commonObjections} onChange={setCommonObjections} multi rows={5}
                placeholder={"Ex:\n'Muito caro' → Explica o valor + parcelamento\n'É golpe?' → Menciona prova social + garantias\n'Preciso pensar' → Cria urgência + oferece desconto"} hint="Uma objeção por linha. Formato: objeção → estratégia" />
            </Card>
            <Card title="Conversão" desc="Para onde a IA deve direcionar os leads prontos?">
              <div className="grid grid-cols-2 gap-2">
                <F label="URL do site" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://seusite.com" />
                <F label="URL do checkout / loja" value={ecommerceUrl} onChange={setEcommerceUrl} placeholder="https://sualoja.com/checkout" />
              </div>
              <F label="Call to Action" value={callToAction} onChange={setCallToAction} placeholder="O que a IA deve guiar o lead a fazer? Ex: 'Agendar uma ligação', 'Começar teste grátis'" />
            </Card>
          </div>
        )}

        {/* ── RULES ── */}
        {tab === "rules" && (
          <div className="space-y-4">
            <Card title="Comportamento" desc="Controle como a IA escreve as mensagens.">
              <div className="grid grid-cols-2 gap-2">
                <Sel label="Tamanho da mensagem" value={msgLength} onChange={setMsgLength} options={[
                  { value: "short", label: "Curta (1-2 frases)" },
                  { value: "medium", label: "Média (2-4 frases)" },
                  { value: "detailed", label: "Detalhada (parágrafo)" },
                ]} />
                <Sel label="Estilo de resposta" value={responseStyle} onChange={setResponseStyle} options={[
                  { value: "conversational", label: "Conversacional (como WhatsApp)" },
                  { value: "structured", label: "Estruturado (pontos claros)" },
                  { value: "storytelling", label: "Storytelling (narrativa)" },
                ]} />
              </div>
            </Card>
            <Card title="Limites" desc="O que a IA nunca deve dizer e o que sempre deve mencionar.">
              <F label="Nunca dizer (uma por linha)" value={neverSay} onChange={setNeverSay} multi rows={3} placeholder="Ex: nomes de concorrentes, promessas de garantia..." hint="A IA vai evitar completamente esses assuntos" />
              <F label="Sempre mencionar (uma por linha)" value={alwaysMention} onChange={setAlwaysMention} multi rows={3} placeholder="Ex: frete grátis, garantia de 30 dias, desconto..." hint="A IA vai incluir naturalmente nas conversas" />
            </Card>
            <Card title="Escalação e Conversão" desc="Quando a IA deve passar para um humano ou marcar uma venda?">
              <F label="Gatilhos de escalação" value={escalationTriggers} onChange={setEscalationTriggers} multi placeholder="Quando passar para humano? Ex: 'quer falar com gerente', 'problema técnico'" />
              <F label="Gatilhos de conversão" value={conversionTriggers} onChange={setConversionTriggers} multi placeholder="O que sinaliza uma venda? Ex: 'quero comprar', 'manda o link'" />
            </Card>
            <Card title="Horários e Follow-up" desc="Comportamento fora do horário e mensagens de acompanhamento.">
              <F label="Mensagem fora do horário" value={offHoursMsg} onChange={setOffHoursMsg} placeholder="Deixe vazio para a IA responder 24/7" hint="Se preenchido, essa mensagem é enviada fora do horário" />
              <Sel label="Delay do follow-up" value={followUpDelay} onChange={setFollowUpDelay} options={[
                { value: "15", label: "15 minutos" }, { value: "30", label: "30 minutos" },
                { value: "60", label: "1 hora" }, { value: "120", label: "2 horas" },
                { value: "1440", label: "24 horas" }, { value: "0", label: "Sem follow-up" },
              ]} />
            </Card>
          </div>
        )}

        {/* ── FIRST MESSAGE ── */}
        {tab === "firstMessage" && (
          <div className="space-y-4">
            <Card title="Primeira mensagem" desc="A IA faz o primeiro contato ou espera o lead chamar?">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-[6px] bg-[var(--bg-elevated)] border border-[var(--border)]">
                  <div>
                    <p className="font-body text-[11px] font-medium text-[var(--fg)]">A IA inicia a conversa</p>
                    <p className="font-body text-[9px] text-[var(--fg-3)] mt-px">O lead deixou os dados e quer ser contatado</p>
                  </div>
                  <Switch checked={aiInitiates} onCheckedChange={setAiInitiates} />
                </div>
                {aiInitiates && (
                  <div className="animate-up">
                    <F label="Instrução para a primeira mensagem" value={firstMsgInstruction} onChange={setFirstMsgInstruction} multi rows={4}
                      placeholder={"Ex: Cumprimente pelo nome, mencione a campanha que trouxe o lead, faça uma pergunta aberta sobre o que ele procura. Seja caloroso mas não exagerado."}
                      hint="A IA vai gerar uma mensagem única baseada nessa instrução — nunca vai ser a mesma mensagem" />
                  </div>
                )}
                {!aiInitiates && (
                  <div className="p-2.5 rounded-[6px] bg-[var(--bg-elevated)] border border-[var(--border)] animate-up">
                    <p className="font-body text-[10px] text-[var(--fg-2)]">
                      A IA vai esperar o lead enviar a primeira mensagem e responder automaticamente.
                      Ideal para campanhas onde o lead clica direto no WhatsApp.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── MATERIALS ── */}
        {tab === "materials" && (
          <div className="space-y-4">
            <Card title="Materiais de venda" desc="Imagens, PDFs e vídeos que a IA pode enviar durante a conversa.">
              <div onClick={() => fileRef.current?.click()} className="border border-dashed border-[var(--border)] rounded-[7px] p-6 text-center cursor-pointer hover:border-[var(--brand)]/30 hover:bg-[var(--brand-muted)] transition-all">
                {uploading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--brand)]" /> : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-[var(--fg-3)] mb-1.5" />
                    <p className="font-body text-[10px] text-[var(--fg-2)]">Clique para enviar imagens, PDFs ou vídeos</p>
                    <p className="font-body text-[8px] text-[var(--fg-4)] mt-0.5">Máximo 50MB por arquivo</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf" onChange={handleUpload} className="hidden" />
              {materials.length > 0 && (
                <div className="space-y-2">
                  {materials.map(mat => {
                    const icons: Record<string, any> = { image: Image, video: Video, pdf: FileText };
                    const Ic = icons[mat.type] || FileText;
                    return (
                      <div key={mat.id} className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Ic className="w-3.5 h-3.5 text-[var(--fg-3)]" />
                            <span className="font-body text-[10px] font-medium text-[var(--fg)]">{mat.name}</span>
                            <span className="font-body text-[8px] text-[var(--fg-4)]">{(mat.size / 1024 / 1024).toFixed(1)}MB</span>
                          </div>
                          <button onClick={() => setMaterials(prev => prev.filter(m => m.id !== mat.id))} className="w-5 h-5 rounded grid place-items-center hover:bg-[var(--red)]/10 text-[var(--red)]"><X className="w-3 h-3" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Input placeholder="Descrição do material" value={mat.description} onChange={e => setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, description: e.target.value } : m))} className="h-7 text-[10px] font-body bg-[var(--bg-card)] border-[var(--border)]" />
                          <Input placeholder="Quando enviar (ex: 'ao falar de preço')" value={mat.sendWhen} onChange={e => setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, sendWhen: e.target.value } : m))} className="h-7 text-[10px] font-body bg-[var(--bg-card)] border-[var(--border)]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── ADVANCED ── */}
        {tab === "advanced" && (
          <div className="space-y-4">
            <Card title="Modelo de IA" desc="Escolha o provedor e modelo.">
              <div className="grid grid-cols-2 gap-2">
                <Sel label="Provedor" value={provider} onChange={setProvider} options={[
                  { value: "openai", label: "OpenAI" },
                  { value: "anthropic", label: "Anthropic" },
                ]} />
                <Sel label="Modelo" value={model} onChange={setModel} options={
                  provider === "openai"
                    ? [{ value: "gpt-4o", label: "GPT-4o (recomendado)" }, { value: "gpt-4o-mini", label: "GPT-4o Mini (mais rápido)" }]
                    : [{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }, { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (mais rápido)" }]
                } />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-body text-[10px] text-[var(--fg-2)]">Temperatura: {temperature}</Label>
                  <input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-[var(--brand)] h-1" />
                  <p className="font-body text-[8px] text-[var(--fg-4)]">Menor = mais preciso / Maior = mais criativo</p>
                </div>
                <F label="Max tokens" value={String(maxTokens)} onChange={v => setMaxTokens(parseInt(v) || 1000)} placeholder="1000" />
              </div>
            </Card>
            <Card title="Prompt do sistema" desc="Prompt gerado automaticamente ou personalizado.">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Switch checked={useCustomPrompt} onCheckedChange={setUseCustomPrompt} />
                  <span className="font-body text-[10px] text-[var(--fg-2)]">{useCustomPrompt ? "Prompt manual" : "Prompt automático"}</span>
                </div>
              </div>
              {useCustomPrompt ? (
                <Textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={16} className="font-mono text-[10px] leading-relaxed bg-[var(--bg-card)] border-[var(--border)] text-[var(--fg)]" placeholder="Cole seu prompt personalizado aqui..." />
              ) : (
                <div className="rounded-[6px] bg-[var(--bg-elevated)] border border-[var(--border)] p-3 max-h-[400px] overflow-y-auto">
                  <pre className="font-mono text-[9px] leading-relaxed text-[var(--fg-2)] whitespace-pre-wrap">{generatedPrompt}</pre>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared components ──
function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[7px] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)]">
        <h3 className="font-display font-medium text-[12px] text-[var(--fg)]">{title}</h3>
        <p className="font-body text-[9px] text-[var(--fg-3)] mt-px">{desc}</p>
      </div>
      <div className="p-3.5 space-y-2.5">{children}</div>
    </div>
  );
}

function F({ label, value, onChange, placeholder, hint, multi, rows }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; multi?: boolean; rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="font-body text-[10px] text-[var(--fg-2)]">{label}</Label>
      {multi ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3} className="font-body text-[11px] resize-none bg-[var(--bg-card)] border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-4)]" />
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-8 font-body text-[11px] bg-[var(--bg-card)] border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-4)]" />
      )}
      {hint && <p className="font-body text-[8px] text-[var(--fg-4)]">{hint}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="font-body text-[10px] text-[var(--fg-2)]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 font-body text-[11px] bg-[var(--bg-card)] border-[var(--border)] text-[var(--fg)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[var(--bg-elevated)] border-[var(--border)]">
          {options.map(o => (
            <SelectItem key={o.value} value={o.value} className="text-[11px] font-body text-[var(--fg)]">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}