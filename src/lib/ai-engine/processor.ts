// src/lib/ai-engine/processor.ts

/**
 * ══════════════════════════════════════════════════════════════
 * AI ENGINE — Core Message Processor
 * ══════════════════════════════════════════════════════════════
 *
 * This is the brain of the system. It:
 * 1. Receives inbound messages from leads
 * 2. Applies debounce (waits for the lead to finish typing)
 * 3. Loads conversation history + AI config
 * 4. Generates a natural response via LLM (Claude/GPT)
 * 5. Sends the response via the appropriate channel (WhatsApp/Email/SMS)
 * 6. Handles escalation triggers, conversion triggers, and follow-ups
 *
 * DEBOUNCE STRATEGY:
 * When a lead sends multiple messages in quick succession (common on WhatsApp),
 * we wait for a configurable period of silence before responding.
 * This prevents the AI from replying to each fragment separately.
 *
 * LANGUAGE DETECTION:
 * When set to "auto", the AI detects the lead's language from their first
 * message and responds in the same language. Supports all major languages.
 */

// ══════════════════════════════════════
// TYPES
// ══════════════════════════════════════

export interface AIConfig {
  provider: "anthropic" | "openai";
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  aiName: string;
  aiRole: string;
  tone: string;
  language: string;
  rules: string[];
  escalationTriggers: string[];
  conversionTriggers: string[];
  debounceSeconds: number;
  offHoursMessage: string;
  followUpDelayMinutes: number;
  aiInitiatesContact: boolean;
  firstMessageInstruction: string;
}

export interface ConversationContext {
  conversationId: string;
  accountId: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
  campaignName: string | null;
  isAIEnabled: boolean;
  messageHistory: {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }[];
}

export interface ProcessResult {
  action: "RESPOND" | "ESCALATE" | "CONVERT" | "SKIP" | "OFF_HOURS";
  response: string | null;
  detectedLanguage: string | null;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  shouldFollowUp: boolean;
}

// ══════════════════════════════════════
// DEBOUNCE MANAGER
// ══════════════════════════════════════

/**
 * In-memory debounce map.
 * In production, use Redis for multi-instance support:
 *   Key: `debounce:{conversationId}`
 *   Value: timestamp of last message
 *   TTL: debounceSeconds + 5
 */
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingMessages = new Map<string, string[]>();

export function debounceMessage(
  conversationId: string,
  message: string,
  debounceSeconds: number,
  callback: (messages: string[]) => void
): void {
  // Clear existing timer
  const existing = debounceTimers.get(conversationId);
  if (existing) clearTimeout(existing);

  // Accumulate messages
  const msgs = pendingMessages.get(conversationId) || [];
  msgs.push(message);
  pendingMessages.set(conversationId, msgs);

  // Set new timer
  const timer = setTimeout(() => {
    const accumulated = pendingMessages.get(conversationId) || [];
    pendingMessages.delete(conversationId);
    debounceTimers.delete(conversationId);
    callback(accumulated);
  }, debounceSeconds * 1000);

  debounceTimers.set(conversationId, timer);
}

// ══════════════════════════════════════
// MAIN PROCESSOR
// ══════════════════════════════════════

export async function processMessage(
  context: ConversationContext,
  inboundMessages: string[],
  config: AIConfig
): Promise<ProcessResult> {
  // 1. Check if AI is enabled
  if (!context.isAIEnabled) {
    return {
      action: "SKIP",
      response: null,
      detectedLanguage: null,
      sentiment: "NEUTRAL",
      shouldFollowUp: false,
    };
  }

  // 2. Check business hours (if off-hours message is configured)
  if (config.offHoursMessage && !isWithinBusinessHours()) {
    return {
      action: "OFF_HOURS",
      response: config.offHoursMessage,
      detectedLanguage: null,
      sentiment: "NEUTRAL",
      shouldFollowUp: false,
    };
  }

  // 3. Combine accumulated messages
  const combinedMessage = inboundMessages.join("\n");

  // 4. Check escalation triggers
  const shouldEscalate = checkTriggers(combinedMessage, config.escalationTriggers);
  if (shouldEscalate) {
    return {
      action: "ESCALATE",
      response: generateEscalationMessage(config, context),
      detectedLanguage: null,
      sentiment: "NEGATIVE",
      shouldFollowUp: false,
    };
  }

  // 5. Check conversion triggers
  const isConverting = checkTriggers(combinedMessage, config.conversionTriggers);

  // 6. Build the system prompt
  const systemPrompt = buildSystemPrompt(config, context);

  // 7. Build message history for the LLM
  const messages = [
    ...context.messageHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: combinedMessage },
  ];

  // 8. Call the LLM
  const aiResponse = await callLLM(config, systemPrompt, messages);

  // 9. Analyze sentiment
  const sentiment = analyzeSentiment(combinedMessage);

  return {
    action: isConverting ? "CONVERT" : "RESPOND",
    response: aiResponse,
    detectedLanguage: detectLanguage(combinedMessage),
    sentiment,
    shouldFollowUp: config.followUpDelayMinutes > 0,
  };
}

// ══════════════════════════════════════
// FIRST MESSAGE GENERATOR
// ══════════════════════════════════════

export async function generateFirstMessage(
  config: AIConfig,
  context: ConversationContext
): Promise<string | null> {
  if (!config.aiInitiatesContact || !context.isAIEnabled) return null;

  const systemPrompt = `You are ${config.aiName}, a ${config.aiRole}.
${config.firstMessageInstruction}

Lead info:
- Name: ${context.leadName || "Unknown"}
- Campaign: ${context.campaignName || "Direct"}
- Channel: ${context.channel}

IMPORTANT: Generate a single, natural first message. Do NOT use templates.
Each message must be unique and personalized.
${config.language !== "auto" ? `Respond in: ${config.language}` : "Detect the appropriate language from the lead's country/name."}`;

  const messages = [
    { role: "user" as const, content: "Generate the first outreach message for this lead." },
  ];

  return callLLM(config, systemPrompt, messages);
}

// ══════════════════════════════════════
// LLM CALLER
// ══════════════════════════════════════

async function callLLM(
  config: AIConfig,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  if (config.provider === "anthropic") {
    return callAnthropic(config, systemPrompt, messages);
  }
  return callOpenAI(config, systemPrompt, messages);
}

async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAI(
  config: AIConfig,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ══════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ══════════════════════════════════════

function buildSystemPrompt(config: AIConfig, context: ConversationContext): string {
  const rules = config.rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const languageInstruction =
    config.language === "auto"
      ? "IMPORTANT: Detect the language the lead is writing in and respond in the SAME language. If the lead writes in German, respond in German. If in Portuguese, respond in Portuguese. Always match their language."
      : `Always respond in: ${config.language}`;

  return `You are ${config.aiName}, a ${config.aiRole}.

PERSONALITY & TONE:
${config.systemPrompt}

TONE STYLE: ${config.tone.replace(/_/g, " ")}

RULES (ALWAYS FOLLOW):
${rules}

CONTEXT:
- Lead name: ${context.leadName || "Unknown"}
- Channel: ${context.channel}
- Campaign: ${context.campaignName || "Direct"}

LANGUAGE:
${languageInstruction}

ESCALATION TRIGGERS (if the lead says any of these, respond that you're connecting them with a specialist):
${config.escalationTriggers.join(", ")}

CONVERSION TRIGGERS (if detected, guide the lead to close the sale):
${config.conversionTriggers.join(", ")}

IMPORTANT GUIDELINES:
- Be natural and human-like. NO robotic responses.
- Keep messages concise — max 2-3 short paragraphs for WhatsApp.
- Don't use excessive emojis or exclamation marks.
- Ask questions to understand the lead's needs.
- Never hallucinate prices, features, or information you don't have.
- If you don't know something, say you'll check and get back to them.`;
}

// ══════════════════════════════════════
// HELPERS
// ══════════════════════════════════════

function checkTriggers(message: string, triggers: string[]): boolean {
  const lower = message.toLowerCase();
  return triggers.some((t) => lower.includes(t.toLowerCase().trim()));
}

function generateEscalationMessage(config: AIConfig, context: ConversationContext): string {
  // This would ideally be generated by the LLM too, but a template works for escalation
  const templates: Record<string, string> = {
    "pt-BR": `Entendo perfeitamente, ${context.leadName || ""}! Vou conectar você com um dos nossos especialistas agora. Um momento, por favor.`,
    "en": `I completely understand, ${context.leadName || ""}! Let me connect you with one of our specialists right away. One moment, please.`,
    "es": `¡Lo entiendo perfectamente, ${context.leadName || ""}! Voy a conectarte con uno de nuestros especialistas. Un momento, por favor.`,
    "de": `Das verstehe ich vollkommen, ${context.leadName || ""}! Ich verbinde Sie gleich mit einem unserer Spezialisten. Einen Moment bitte.`,
  };

  return templates[config.language] || templates["en"];
}

function analyzeSentiment(message: string): "POSITIVE" | "NEUTRAL" | "NEGATIVE" {
  const positive = /obrigad|perfeito|ótimo|excelente|gostei|maravilh|thank|great|perfect|love|awesome|genial|increíble/i;
  const negative = /horrível|péssimo|raiva|insatisf|cancel|terrible|awful|angry|furious|horrible|pésimo|cancelar/i;

  if (positive.test(message)) return "POSITIVE";
  if (negative.test(message)) return "NEGATIVE";
  return "NEUTRAL";
}

function detectLanguage(text: string): string {
  // Simple heuristic — in production use a proper library like franc
  const ptWords = /\b(você|voce|obrigado|como|qual|quero|preciso|tenho|pode)\b/i;
  const esWords = /\b(usted|quiero|necesito|puedo|cómo|cuál|gracias)\b/i;
  const deWords = /\b(ich|sie|können|möchte|brauche|danke|bitte|gibt)\b/i;
  const frWords = /\b(je|vous|comment|merci|pouvez|besoin|voudrais)\b/i;

  if (ptWords.test(text)) return "pt-BR";
  if (esWords.test(text)) return "es";
  if (deWords.test(text)) return "de";
  if (frWords.test(text)) return "fr";
  return "en";
}

function isWithinBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  // Default: 8am - 10pm (configurable per account in production)
  return hour >= 8 && hour < 22;
}