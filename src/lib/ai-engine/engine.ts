// src/lib/ai-engine/engine.ts
//
// Single source of truth for LLM-backed flows.
// All workers (first contact, AI response, follow-up, transcription) call
// AIEngine.* and never touch OpenAI/Anthropic directly.

import prisma from "@/lib/db/prisma";
import {
  findAvailableSlots,
  createEvent,
  getIntegrationStatus,
} from "@/lib/integrations/google-calendar";
import { getIntegrationStatus as getMetaStatus } from "@/lib/integrations/meta";
import { resolveLanguage, type ResolvedLanguage } from "@/lib/ai-engine/language";
import { createSignedUrl } from "@/lib/storage/supabase-storage";
import { buildKnowledgeBlock } from "@/lib/knowledge/retrieval";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

export type HistoryRole = "user" | "assistant";

export interface HistoryEntry {
  role: HistoryRole;
  content: string;
}

export interface FirstContactParams {
  accountId: string;
  leadName?: string;
  leadSource: string;
  campaignInfo?: string;
  channel: Channel;
  leadMetadata?: Record<string, unknown>;
  /** Country (ISO-2) of the campaign that brought this lead — drives language */
  campaignCountry?: string;
  /** Optional explicit language override coming from the campaign */
  campaignLanguage?: string;
}

export interface GenerateResponseParams {
  accountId: string;
  leadName?: string;
  leadPhone?: string;
  leadEmail?: string;
  leadSource: string;
  campaignInfo?: string;
  conversationHistory: HistoryEntry[];
  currentMessage: string;
  channel: Channel;
  leadMetadata?: Record<string, unknown>;
  campaignCountry?: string;
  campaignLanguage?: string;
}

export interface AIResponseResult {
  message: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  tags: string[];
  isEscalation: boolean;
  isConversion: boolean;
  notificationMessage?: string;
  scheduled?: {
    eventId: string;
    startISO: string;
    endISO: string;
    htmlLink?: string;
  };
  /** Media items the AI wants to send alongside the reply, in order. */
  attachments?: {
    id: string;
    name: string;
    kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
    mimeType: string;
    url: string;
  }[];
  /**
   * Closing intent detected via [CLOSE_WITH_LINK] tag in the AI output.
   * Caller (worker) is responsible for appending the configured link as
   * an extra bubble and marking the lead status.
   */
  closeWithLink?: {
    url: string;
    accompanyingMessage: string;
  };
  /**
   * Handoff request detected via [HANDOFF_TO_TEAM:summary] tag. Caller is
   * responsible for firing the team-handoff notification (email + webhook)
   * and recording the event.
   */
  handoff?: {
    summary: string;
    requestedAction: string;
    capturedInfo: Record<string, string>;
  };
}

interface ScheduleIntent {
  startISO: string;
  endISO: string;
  summary?: string;
  attendeeEmail?: string;
  attendeeName?: string;
}

interface LoadedConfig {
  provider: "openai" | "anthropic";
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  persona: Record<string, unknown>;
  escalationKeywords: string[];
  conversionKeywords: string[];
  offHoursMessage: string;
}

export class AIEngine {
  // ════════════════════════════════════════════════════
  // FIRST CONTACT
  // ════════════════════════════════════════════════════
  static async generateFirstContact(params: FirstContactParams): Promise<string> {
    const cfg = await loadConfig(params.accountId);
    if (!cfg) return fallbackGreeting(params.leadName);

    // EXACT-MESSAGE MODE: the operator typed the literal text the AI must
    // send. We do placeholder substitution ({nome}, {empresa}, {campanha},
    // and the english equivalents) and skip the LLM entirely. Same message
    // for every lead, predictable and zero variation.
    const variability = personaField<string>(
      cfg.persona,
      "pipelineFirstMessageVariability",
      "instruction"
    );
    const literalInstruction = personaField<string>(
      cfg.persona,
      "pipelineFirstMessageInstruction",
      ""
    );
    if (variability === "exact" && literalInstruction.trim()) {
      return renderExactMessage(literalInstruction, params);
    }

    const businessContext = await loadBusinessContext(
      params.accountId,
      params.leadMetadata
    );

    const language = resolveLanguage({
      personaLanguage: personaField(cfg.persona, "language", "auto") as string,
      campaignLanguage: params.campaignLanguage,
      campaignCountry: params.campaignCountry,
    });

    const knowledgeQuery = [
      params.campaignInfo || "",
      params.leadName || "",
      params.leadSource,
      literalInstruction,
    ]
      .filter(Boolean)
      .join(" ");
    const knowledgeBlock = await buildKnowledgeBlock(
      params.accountId,
      knowledgeQuery,
      { budgetChars: 6000, maxChunks: 5 }
    );

    const systemPrompt = buildFirstContactSystemPrompt(
      cfg,
      params,
      businessContext,
      language,
      knowledgeBlock
    );
    const userTurn = buildFirstContactUserTurn(params);

    const reply = await callLLM(cfg, systemPrompt, [
      { role: "user", content: userTurn },
    ]);

    return reply?.trim() || fallbackGreeting(params.leadName);
  }

  // ════════════════════════════════════════════════════
  // FOLLOW-UP MESSAGE (called by the follow-up worker)
  // The operator can type either an exact message or an instruction; the
  // engine renders one or the other and respects all the same voice rules
  // as the first contact.
  // ════════════════════════════════════════════════════
  static async generateFollowUp(params: FirstContactParams & {
    instruction?: string;
    attemptIndex?: number;
  }): Promise<string> {
    const cfg = await loadConfig(params.accountId);
    if (!cfg) return fallbackGreeting(params.leadName);

    // Per-follow-up instruction overrides the first-message one. Same
    // exact/instruction semantics: if it looks like a templated literal
    // (contains placeholders or is unusually long), render verbatim.
    const inst = (params.instruction || "").trim();
    if (inst && /^\s*[A-Z]/i.test(inst) && /\{(?:nome|name|empresa|company|campanha|campaign)\}/i.test(inst)) {
      return renderExactMessage(inst, params);
    }

    const businessContext = await loadBusinessContext(
      params.accountId,
      params.leadMetadata
    );
    const language = resolveLanguage({
      personaLanguage: personaField(cfg.persona, "language", "auto") as string,
      campaignLanguage: params.campaignLanguage,
      campaignCountry: params.campaignCountry,
    });

    const knowledgeBlock = await buildKnowledgeBlock(
      params.accountId,
      [params.campaignInfo || "", inst].filter(Boolean).join(" "),
      { budgetChars: 6000, maxChunks: 5 }
    );

    const systemPrompt = buildFollowUpSystemPrompt(
      cfg,
      params,
      businessContext,
      language,
      knowledgeBlock,
      inst,
      params.attemptIndex ?? 0
    );
    const userTurn = buildFollowUpUserTurn(params, params.attemptIndex ?? 0);

    const reply = await callLLM(cfg, systemPrompt, [
      { role: "user", content: userTurn },
    ]);
    return reply?.trim() || fallbackGreeting(params.leadName);
  }

  // ════════════════════════════════════════════════════
  // AI RESPONSE (reply to an inbound message)
  // ════════════════════════════════════════════════════
  static async generateResponse(
    params: GenerateResponseParams
  ): Promise<AIResponseResult> {
    const cfg = await loadConfig(params.accountId);
    if (!cfg) {
      return {
        message: fallbackGreeting(params.leadName),
        sentiment: "NEUTRAL",
        tags: [],
        isEscalation: false,
        isConversion: false,
      };
    }

    const escalation = matchesAny(params.currentMessage, cfg.escalationKeywords);
    const conversion = matchesAny(params.currentMessage, cfg.conversionKeywords);

    // ── Scheduling context (only when calendar is enabled + connected) ──
    const schedulingContext = await maybeLoadSchedulingContext(
      params.accountId,
      cfg
    );

    // ── Business context (Meta integration: business name/niche/offer + ad context) ──
    const businessContext = await loadBusinessContext(
      params.accountId,
      params.leadMetadata
    );

    const language = resolveLanguage({
      personaLanguage: personaField(cfg.persona, "language", "auto") as string,
      campaignLanguage: params.campaignLanguage,
      campaignCountry: params.campaignCountry,
    });

    // ── Knowledge base + media catalog ──
    // Retrieve only the chunks most relevant to the lead's recent turns.
    // We seed the query with the last 3 inbound messages so multi-turn
    // context still drives retrieval.
    const recentInbound = [
      ...params.conversationHistory
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => m.content),
      params.currentMessage,
    ].join(" ");
    const [knowledgeBlock, mediaCatalog] = await Promise.all([
      buildKnowledgeBlock(params.accountId, recentInbound, {
        budgetChars: 10000,
        maxChunks: 6,
      }),
      loadMediaCatalog(params.accountId),
    ]);
    const mediaBlock = buildMediaBlock(mediaCatalog);

    const systemPrompt = buildResponseSystemPrompt(cfg, params, {
      escalation,
      conversion,
      schedulingContext,
      businessContext,
      language,
      knowledgeBlock,
      mediaBlock,
    });

    const messages: HistoryEntry[] = [
      ...params.conversationHistory,
      { role: "user", content: params.currentMessage },
    ];

    const rawReply =
      (await callLLM(cfg, systemPrompt, messages))?.trim() ||
      "Posso te ajudar em algo mais?";

    // ── Parse optional SEND_MEDIA tags ──
    const mediaResult = extractMediaTags(rawReply, mediaCatalog);

    // ── Parse [CLOSE_WITH_LINK] and [HANDOFF_TO_TEAM:summary] ──
    // The closing tags are stripped from the visible text. We resolve
    // them against the operator's pipeline config; if a tag has no
    // matching config (e.g. AI emitted HANDOFF but operator has no email
    // configured), we silently drop the side-effect so the lead still
    // gets a coherent reply.
    const closingParsed = extractClosingTags(mediaResult.cleaned);

    // ── Parse optional SCHEDULE:{...} block and act on it ──
    const parsed = extractScheduleBlock(closingParsed.cleaned);
    let visibleMessage = parsed.cleaned;
    let scheduled: AIResponseResult["scheduled"];

    // Resolve closing actions from persona config.
    const closingLinkUrl = String(personaField(cfg.persona, "pipelineClosingLink", ""));
    const closingLinkMsg = String(personaField(cfg.persona, "pipelineClosingMessage", ""));
    const handoffEmail = String(personaField(cfg.persona, "pipelineHandoffEmail", ""));
    const handoffWebhook = String(personaField(cfg.persona, "pipelineHandoffWebhook", ""));
    const closeWithLink =
      closingParsed.closeWithLink && closingLinkUrl
        ? { url: closingLinkUrl, accompanyingMessage: closingLinkMsg }
        : undefined;
    // Fire the handoff result when EITHER an email OR a webhook is
    // configured — previously webhook-only setups silently dropped the
    // signal even though the worker would have happily POSTed to the URL.
    const handoff =
      closingParsed.handoffSummary && (handoffEmail || handoffWebhook)
        ? {
            summary: closingParsed.handoffSummary,
            requestedAction: closingParsed.handoffSummary,
            // Best-effort: pull any "Field: value" lines from the recent
            // conversation, so the team email shows what the lead said.
            capturedInfo: extractKeyValuesFromHistory(params.conversationHistory),
          }
        : undefined;

    // ── Resolve signed URLs for matched media ──
    let attachments: AIResponseResult["attachments"] | undefined;
    if (mediaResult.matched.length > 0) {
      attachments = [];
      for (const m of mediaResult.matched) {
        try {
          const url = await createSignedUrl("assistant-media", m.storagePath);
          attachments.push({
            id: m.id,
            name: m.name,
            kind: m.kind,
            mimeType: m.mimeType,
            url,
          });
        } catch (err) {
          console.warn("[AIEngine] sign media url failed:", err);
        }
      }
      if (attachments.length === 0) attachments = undefined;
    }

    if (parsed.intent && schedulingContext?.connected) {
      try {
        const ev = await createEvent(params.accountId, {
          summary:
            parsed.intent.summary ||
            `Reunião com ${params.leadName || params.leadPhone || "lead"}`,
          description: `Lead: ${params.leadName || ""} ${params.leadPhone || ""} ${params.leadEmail || ""}`.trim(),
          startISO: parsed.intent.startISO,
          endISO: parsed.intent.endISO,
          attendeeEmail: parsed.intent.attendeeEmail || params.leadEmail,
          attendeeName: parsed.intent.attendeeName || params.leadName,
          timeZone: schedulingContext.timeZone,
          sendUpdates: parsed.intent.attendeeEmail || params.leadEmail ? "all" : "none",
        });
        scheduled = {
          eventId: ev.eventId,
          startISO: parsed.intent.startISO,
          endISO: parsed.intent.endISO,
          htmlLink: ev.htmlLink,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AIEngine] createEvent failed:", msg);
        // Fall back: keep the message visible without confirmation of event
      }
    }

    return {
      message: visibleMessage,
      sentiment: analyzeSentiment(params.currentMessage),
      tags: collectTags({
        escalation,
        conversion: conversion || !!closeWithLink,
        scheduled: !!scheduled,
        handoff: !!handoff,
      }),
      isEscalation: escalation,
      isConversion: conversion || !!scheduled || !!closeWithLink,
      notificationMessage: escalation
        ? `Lead solicitou atendimento humano: ${params.leadName || params.leadPhone || params.leadEmail || "lead"}`
        : handoff
          ? `Handoff solicitado pela IA: ${handoff.summary}`
          : conversion || closeWithLink
            ? `Lead demonstrou intenção de compra: ${params.leadName || params.leadPhone || params.leadEmail || "lead"}`
            : scheduled
              ? `Reunião agendada com ${params.leadName || params.leadPhone || "lead"} em ${scheduled.startISO}`
              : undefined,
      scheduled,
      attachments,
      closeWithLink,
      handoff,
    };
  }

  // ════════════════════════════════════════════════════
  // AUDIO TRANSCRIPTION (OpenAI Whisper)
  // ════════════════════════════════════════════════════
  static async transcribeAudio(
    audio: Buffer | { buffer: Buffer; mimetype?: string },
    filename = "audio.ogg"
  ): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn("[AIEngine] OPENAI_API_KEY missing, skipping transcription");
      return "";
    }

    const buffer = Buffer.isBuffer(audio) ? audio : audio.buffer;
    const mimetype = Buffer.isBuffer(audio) ? "audio/ogg" : audio.mimetype || "audio/ogg";

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);
    form.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Whisper transcription failed: HTTP ${res.status} ${err}`);
    }

    const data = (await res.json()) as { text?: string };
    return (data.text || "").trim();
  }
}

// ════════════════════════════════════════════════════
// CONFIG LOADER
// ════════════════════════════════════════════════════
async function loadConfig(accountId: string): Promise<LoadedConfig | null> {
  const row = await prisma.aIConfig.findUnique({ where: { accountId } });
  if (!row) return null;

  // If the tenant flipped to a named assistant, override the inline
  // fields with that assistant's config. The base aiConfig still owns
  // pipeline / scheduling / business-hours metadata.
  let overlay: {
    provider?: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    persona?: Record<string, unknown> | null;
    escalationConfig?: Record<string, unknown> | null;
    conversionConfig?: Record<string, unknown> | null;
    offHoursMessage?: string | null;
  } | null = null;

  if (row.activeAssistantId) {
    const a = await prisma.aIAssistant.findFirst({
      where: { id: row.activeAssistantId, accountId },
    });
    if (a) {
      overlay = {
        provider: a.provider,
        model: a.model,
        systemPrompt: a.systemPrompt,
        temperature: a.temperature,
        maxTokens: a.maxTokens,
        persona: a.persona as Record<string, unknown> | null,
        escalationConfig: a.escalationConfig as Record<string, unknown> | null,
        conversionConfig: a.conversionConfig as Record<string, unknown> | null,
        offHoursMessage: a.offHoursMessage,
      };
    }
  }

  // BUG FIX: when an assistant overlay exists, it used to completely
  // replace the base persona, wiping out tenant-level pipeline settings
  // (language lock, firstMessageInstruction, channels[], followUps[],
  // webhookId, etc.) and silently reverting the AI to "auto" behavior.
  //
  // The right model: pipeline-owned and tenant-owned fields ALWAYS come
  // from the base aiConfig.persona. The assistant overlay only contributes
  // voice/persona-tone fields (aiName, aiRole, tone, ...). We merge with
  // the base winning for anything that starts with "pipeline" or sits in
  // a known tenant-owned key.
  const basePersona = (row.persona as Record<string, unknown>) || {};
  const overlayPersona = (overlay?.persona as Record<string, unknown> | null) || null;
  const TENANT_OWNED_KEYS = new Set([
    "language",
    "escalationTriggers",
    "conversionTriggers",
    "debounceSeconds",
  ]);
  const persona: Record<string, unknown> = overlayPersona
    ? { ...overlayPersona, ...pickTenantFields(basePersona, TENANT_OWNED_KEYS) }
    : basePersona;
  const escalation = (overlay?.escalationConfig ?? (row.escalationConfig as Record<string, unknown>)) || {};
  const conversion = (overlay?.conversionConfig ?? (row.conversionConfig as Record<string, unknown>)) || {};

  const provider = (overlay?.provider ?? row.provider) === "anthropic" ? "anthropic" : "openai";
  const model = overlay?.model ?? row.model;
  const systemPrompt = overlay?.systemPrompt ?? row.systemPrompt;
  const temperature = overlay?.temperature ?? row.temperature;
  const maxTokens = overlay?.maxTokens ?? row.maxTokens;
  const offHoursMessage = overlay?.offHoursMessage ?? row.offHoursMessage ?? "";

  return {
    provider,
    model,
    systemPrompt,
    temperature,
    maxTokens,
    persona,
    escalationKeywords: parseKeywords(
      (escalation.keywords as string | string[] | undefined) ||
        (persona.escalationTriggers as string | string[] | undefined)
    ),
    conversionKeywords: parseKeywords(
      (conversion.keywords as string | string[] | undefined) ||
        (persona.conversionTriggers as string | string[] | undefined)
    ),
    offHoursMessage,
  };
}

// ════════════════════════════════════════════════════
// KNOWLEDGE BASE + MEDIA LIBRARY
// ════════════════════════════════════════════════════

interface MediaCatalogItem {
  id: string;
  name: string;
  description: string;
  sendInstruction: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  storagePath: string;
}

async function loadMediaCatalog(accountId: string): Promise<MediaCatalogItem[]> {
  const items = await prisma.assistantMedia.findMany({
    where: { accountId, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      sendInstruction: true,
      kind: true,
      mimeType: true,
      storagePath: true,
    },
    take: 30,
    orderBy: { createdAt: "asc" },
  });
  return items;
}

function buildMediaBlock(items: MediaCatalogItem[]): string {
  if (items.length === 0) return "";
  const list = items
    .map(
      (m, i) =>
        `${i + 1}. [${m.kind}] "${m.name}", ${m.description}\n   QUANDO ENVIAR: ${m.sendInstruction}`
    )
    .join("\n");
  return `\nARQUIVOS QUE VOCÊ PODE ENVIAR AO LEAD:
Quando fizer sentido (siga "QUANDO ENVIAR" de cada arquivo), inclua no FINAL da sua resposta uma linha exatamente neste formato:
SEND_MEDIA: "<nome exato do arquivo>"

Pode enviar até 2 mídias por resposta. Use o NOME exato listado abaixo.
Se nenhum arquivo se aplicar, não escreva SEND_MEDIA.

ARQUIVOS DISPONÍVEIS:
${list}
`;
}

const MEDIA_TAG_RE = /SEND_MEDIA:\s*"([^"\n]+)"/gi;

function extractMediaTags(raw: string, catalog: MediaCatalogItem[]): {
  cleaned: string;
  matched: MediaCatalogItem[];
} {
  const matched: MediaCatalogItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = MEDIA_TAG_RE.exec(raw))) {
    const name = m[1].trim().toLowerCase();
    if (seen.has(name)) continue;
    const item = catalog.find((c) => c.name.trim().toLowerCase() === name);
    if (item) {
      matched.push(item);
      seen.add(name);
    }
    if (matched.length >= 2) break;
  }
  const cleaned = raw.replace(MEDIA_TAG_RE, "").trim();
  return { cleaned, matched };
}

/**
 * Strip the [CLOSE_WITH_LINK] and [HANDOFF_TO_TEAM:summary] tags from
 * the AI's raw reply and return what was found. The visible text is the
 * cleaned version — never leak a tag to the lead.
 *
 * IMPORTANT: regexes are built fresh per call. A module-scope `/.../g`
 * regex shares `lastIndex` between invocations on the long-lived worker
 * process, which silently dropped tag matches on the 2nd-and-later AI
 * responses. Building locally costs nothing and is bullet-proof.
 */
function extractClosingTags(raw: string): {
  cleaned: string;
  closeWithLink: boolean;
  handoffSummary: string | null;
} {
  const closeRe = /\[CLOSE_WITH_LINK\]/gi;
  const handoffMatchRe = /\[HANDOFF_TO_TEAM:\s*([^\]]+)\]/i;
  const handoffStripRe = /\[HANDOFF_TO_TEAM:\s*[^\]]+\]/gi;

  let cleaned = raw;
  const closeWithLink = closeRe.test(cleaned);
  cleaned = cleaned.replace(closeRe, "");
  const m = cleaned.match(handoffMatchRe);
  const handoffSummary = m ? m[1].trim().slice(0, 500) : null;
  cleaned = cleaned.replace(handoffStripRe, "");
  // Collapse extra whitespace left behind by tag removal.
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, closeWithLink, handoffSummary };
}

/**
 * Heuristic: scan the lead's recent messages for "Field: value" lines so
 * the handoff email shows what they answered to the AI's qualifying
 * questions. We're conservative on what counts as a "field" to avoid
 * polluting the team email with casual stuff like "sim: pode mandar":
 *
 *  - Key must be 2+ words OR end in a known field-name keyword
 *    (nome, email, telefone, empresa, cnpj, cpf, endereco, etc.)
 *  - Lines starting with conversational openers (sim, nao, ok, blz,
 *    obrigado, etc.) are explicitly skipped
 *  - Value must contain at least one digit or be 6+ chars (filters short
 *    affirmations that slip past the keyword guard)
 *
 * Better to under-extract than fill the team email with junk.
 */
const FIELD_KEYWORDS_RE =
  /\b(nome|name|email|e-?mail|telefone|phone|celular|whats(?:app)?|empresa|company|cnpj|cpf|rg|tax|id|documento|endereco|address|cidade|city|estado|bairro|cep|zip|idade|age|salario|salary|orcamento|budget|cargo|role|funcao|profissao|profession)\b/i;
const CONVERSATIONAL_OPENERS = new Set([
  "sim", "nao", "não", "yes", "no", "ok", "blz", "obrigado", "obrigada",
  "obg", "vlw", "valeu", "thanks", "thank", "gracias", "grazie",
  "claro", "sure", "talvez", "maybe", "ola", "olá", "hi", "hello",
]);

function extractKeyValuesFromHistory(
  history: HistoryEntry[]
): Record<string, string> {
  const out: Record<string, string> = {};
  const userTurns = history.filter((h) => h.role === "user").slice(-6);
  for (const turn of userTurns) {
    const lines = turn.content.split(/[\n;]/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]{1,30})\s*[:=]\s*(.{2,180})$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim();
      const keyLower = key.toLowerCase();
      // Skip casual affirmations masquerading as keys.
      if (CONVERSATIONAL_OPENERS.has(keyLower)) continue;
      // Require either multiple words OR a recognized field keyword.
      const isMultiWord = /\s/.test(key.trim());
      const matchesKeyword = FIELD_KEYWORDS_RE.test(keyLower);
      if (!isMultiWord && !matchesKeyword) continue;
      // Value must look substantive (digits OR at least 6 chars).
      if (val.length < 6 && !/\d/.test(val)) continue;
      if (!out[key]) out[key] = val;
    }
  }
  return out;
}

function parseKeywords(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ════════════════════════════════════════════════════
// PROMPT BUILDERS
// ════════════════════════════════════════════════════
function personaField<T = string>(
  persona: Record<string, unknown>,
  key: string,
  fallback: T
): T {
  const v = persona[key];
  return (v === undefined || v === null || v === "" ? fallback : v) as T;
}

/**
 * Extract every key whose name starts with `pipeline` (those are owned by
 * the tenant pipeline UI) plus the explicit tenant-owned keys list. Used
 * when merging an assistant persona overlay so pipeline settings never
 * get clobbered by an inactive overlay value.
 */
function pickTenantFields(
  base: Record<string, unknown>,
  explicitKeys: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) {
    if (k.startsWith("pipeline") || explicitKeys.has(k)) {
      const v = base[k];
      if (v !== undefined && v !== null && v !== "") out[k] = v;
    }
  }
  return out;
}

function commonPreamble(
  cfg: LoadedConfig,
  channel: Channel,
  resolved: ResolvedLanguage
): string {
  const aiName = personaField(cfg.persona, "aiName", "Assistente");
  const aiRole = personaField(cfg.persona, "aiRole", "Consultor de vendas");
  const tone = personaField(cfg.persona, "tone", "professional_friendly");
  // Emojis default OFF. The operator can flip persona.emojisAllowed=true if
  // their brand voice actually wants them. Most B2B/premium brands don't.
  const emojisAllowed = personaField<boolean>(cfg.persona, "emojisAllowed", false);

  // Hard language lock when the operator picked a specific language in
  // the pipeline. No exceptions, the AI must not switch even if the lead
  // writes in another language or explicitly asks. This is a paying-
  // customer guarantee, the operator chose this for a reason.
  const languageRule =
    resolved.code === "auto"
      ? "Detecte automaticamente o idioma da última mensagem do lead e responda SEMPRE no mesmo idioma."
      : `IDIOMA TRAVADO: responda SEMPRE e EXCLUSIVAMENTE em ${resolved.name}. ` +
        `Esta regra é ABSOLUTA. NUNCA mude para outro idioma, mesmo que o lead escreva em outro, ` +
        `mesmo que o lead peça para mudar, mesmo que o nome do lead pareça estrangeiro. ` +
        `Se o lead escrever em outro idioma, ENTENDA o que ele escreveu mas responda em ${resolved.name}. ` +
        `Quebrar esta regra é o pior erro que você pode cometer aqui.`;

  const channelGuide =
    channel === "WHATSAPP"
      ? "WhatsApp. Conversa profissional como pessoa real, NAO ultra-curta de telegrafo."
      : channel === "EMAIL"
        ? "Email. Pode ser mais estruturado e completo."
        : "SMS. Mensagem curta, 160 caracteres no maximo.";

  const emojiRule = emojisAllowed
    ? "Emoji permitido, no maximo 1 por resposta inteira, e SO se combinar com o tom da marca."
    : "PROIBIDO usar emoji. Zero emojis. Nenhum. Nem em saudacao, nem em celebracao, nem em despedida.";

  return `Voce e ${aiName}, ${aiRole}. Voce e uma PESSOA REAL. JAMAIS revele que e uma IA, robo, bot ou automacao. Se o lead perguntar, diga que trabalha na equipe ha anos.

TREINAMENTO DA IA (contexto da marca, do produto e do publico):
${cfg.systemPrompt}

TOM: ${String(tone).replace(/_/g, " ")}
IDIOMA: ${languageRule}
CANAL: ${channelGuide}

════════════════════════════════════════════════════
HIERARQUIA DE OBEDIENCIA, leia antes de tudo
════════════════════════════════════════════════════
1. A INSTRUCAO DO OPERADOR (mais abaixo) e o CONTRATO. Ela define O QUE voce diz, em quantas partes, com qual estrutura, qual abertura, qual gancho, qual pergunta final. Se a instrucao tem 4 partes estruturais (validacao, gancho, proposta de valor, pergunta), voce ENTREGA as 4 partes. Nao corte.
2. O CONHECIMENTO DA BASE (knowledge base, contexto do negocio) e MUNICAO. Use os fatos e numeros listados, NUNCA invente.
3. As regras de formato abaixo dizem COMO chunkar o conteudo em baloes do WhatsApp, NAO autorizam voce a encurtar o conteudo.

Resumindo: a instrucao do operador manda no QUE, as regras de formato mandam no COMO. Nunca o COMO pode apagar o QUE.

════════════════════════════════════════════════════
FORMATO DE BALOES (como dividir o conteudo)
════════════════════════════════════════════════════
Voce nao manda tudo num balao monolitico de email. Quebra em baloes naturais de WhatsApp.

Use o delimitador literal: |||

Regras:
- 1 a 5 baloes. Cada balao tem 1 a 4 frases. Cada parte ESTRUTURAL da instrucao do operador vira 1 balao.
- Se a instrucao do operador tem 4 partes (ex: validacao, hook, valor, pergunta), use 4 baloes. NAO COMPRIMA em 1 ou 2.
- Conteudo curto (resposta simples a pergunta direta) pode ser 1 balao so, nao force divisao.
- Proibido listas numeradas, bullet points e markdown (* - #). Frases corridas, naturais.
- ${emojiRule}
- Nao comece todos os baloes com a mesma palavra. Varie a abertura.

════════════════════════════════════════════════════
VICIOS DE LINGUAGEM PROIBIDOS (frases banidas)
════════════════════════════════════════════════════
NUNCA usa estas frases ou variacoes:
- "Estou a disposicao" / "Fico a disposicao" / "Ficamos a disposicao"
- "Qualquer duvida me chama" / "Qualquer coisa me avisa"
- "Nao hesite em perguntar"
- "Estou aqui para ajudar"
- "Pode contar comigo"
- "Fico no aguardo"
- "Espero ter ajudado"
- "Foi um prazer"

Para encerrar use SUBSTANCIA ou proxima acao concreta:
- BOM: "Me conta depois o que achou."
- BOM: "Assim que olhar, me da um retorno."
- BOM: "Vou te mandar mais detalhes em seguida."
- RUIM: qualquer frase da lista acima.

════════════════════════════════════════════════════
COMPORTAMENTO
════════════════════════════════════════════════════
- Nunca repita a saudacao. Se ja disse "oi" antes, vai direto ao assunto.
- Nunca repita textualmente o que o lead falou. Avance.
- Nunca invente preco, prazo, politica ou fato que nao esta no treinamento. Diga "vou confirmar e te retorno".
- Nao use o nome do lead em TODA mensagem, use ocasionalmente.
- Nunca diga que nao consegue ouvir/processar audio, o sistema ja transcreveu pra voce.
- Nunca envie o mesmo link duas vezes na mesma conversa.
- Nunca faca pergunta que o lead acabou de responder.
- Reaja a algo concreto que o lead disse antes de continuar. NUNCA ignore o conteudo da ultima mensagem dele e va direto pro proximo topico.

════════════════════════════════════════════════════
VARIE A ABERTURA, A IA NAO PODE MANDAR SEMPRE A MESMA COISA
════════════════════════════════════════════════════
Se a instrucao do operador pede "valide" ou "parabenize" o lead, VARIE a forma. Nunca abra dois leads diferentes com a mesma frase ("Congratulations, X, on taking the first step..." repetido em todo lead e o pior pesadelo). Inspire-se nessas formas alternativas, mas crie suas proprias:

- "Que bom te ver por aqui, X!" / "Great to see you here, X!"
- "Curti voce ter chegado ate aqui, X." / "Glad you took the leap, X."
- Cumprimento natural pelo NOME, sem usar 'Parabens'/'Congratulations' como muleta.
- Comecar reagindo ao contexto: "Vi que voce veio pelo anuncio Y..." / "Saw you came in through Y..."
- Em mensagens de resposta (nao primeiro contato), evite saudacao, va direto ao ponto.

Use uma palavra ou expressao diferente em cada lead. Se voce ja usou "modernizar" 3 vezes, troca pra "transformar", "evoluir", "atualizar".

════════════════════════════════════════════════════
FOLLOW-UP PROGRAMADO (opcional)
════════════════════════════════════════════════════
Se o lead indicar que volta depois (ex.: "vou ver amanha", "to ocupado", "volto em X dias"), inclua no FIM da resposta uma tag invisivel:
[FOLLOWUP:Xh]  (X numero, sufixo "h" para horas ou "d" para dias)

Exemplos:
- "vou ver amanha" -> [FOLLOWUP:24h]
- "to ocupado agora" -> [FOLLOWUP:6h]
- "volto semana que vem" -> [FOLLOWUP:7d]

Essa tag e REMOVIDA antes do envio, o lead nunca a ve. So use quando fizer sentido real.`;
}

function buildFirstContactSystemPrompt(
  cfg: LoadedConfig,
  params: FirstContactParams,
  businessContext: BusinessContext | null,
  language: ResolvedLanguage,
  knowledgeBlock: string = ""
): string {
  // 1) Pipeline-level operator instruction takes priority (the user wrote
  //    this in /pipeline → "First message" → instruction mode).
  // 2) Fall back to the legacy persona.firstMessageInstruction field.
  // 3) Fall back to a sensible default that varies wording per lead.
  const pipelineInstruction = personaField(
    cfg.persona,
    "pipelineFirstMessageInstruction",
    ""
  );
  const legacyInstruction = personaField(
    cfg.persona,
    "firstMessageInstruction",
    "Apresente-se de forma curta e humana, confirme o interesse do lead e faça UMA pergunta aberta para começar a qualificação."
  );
  const operatorInstruction =
    String(pipelineInstruction).trim() || String(legacyInstruction).trim();

  return `${commonPreamble(cfg, params.channel, language)}
${businessContext ? renderBusinessContext(businessContext) : ""}
${knowledgeBlock}
CONTEXTO DESTE LEAD:
- Nome: ${params.leadName || "ainda nao sabemos"}
- Origem: ${params.leadSource}
${params.campaignInfo ? `- Campanha: ${params.campaignInfo}` : ""}
${params.campaignCountry ? `- Pais da campanha: ${params.campaignCountry}` : ""}

════════════════════════════════════════════════════
INSTRUCAO DO OPERADOR PARA ESTA PRIMEIRA MENSAGEM
ESTA INSTRUCAO E O CONTRATO. CUMPRA TUDO QUE ELA PEDE.
════════════════════════════════════════════════════
${operatorInstruction}

════════════════════════════════════════════════════
SUA TAREFA AGORA
════════════════════════════════════════════════════
Escreva a PRIMEIRA mensagem para este lead, dividida em baloes com |||.

CHECKLIST OBRIGATORIO antes de finalizar:
1. Identifique CADA parte estrutural pedida na instrucao do operador (validacao, gancho, proposta de valor, prova, pergunta de qualificacao etc.). Cada parte = 1 balao.
2. Conte os pontos da instrucao. Se a instrucao pede 4 elementos, sua resposta tem 4 baloes. Nunca menos.
3. Use os termos, numeros e diferenciais especificos que a instrucao e a base de conhecimento listaram. Nao generalize "tecnologia avancada", chame pelo NOME.
4. Personalize com o nome do lead UMA vez, na abertura, nao em todo balao.
5. Termine com a pergunta exata (ou equivalente) que a instrucao pediu, nao invente outra pergunta.

PROIBIDO entregar so a saudacao e deixar o resto pra depois. PROIBIDO cortar a instrucao. PROIBIDO usar template generico ("Ola! Como posso te ajudar?"). Cada mensagem soa unica MAS contem TODO o conteudo pedido.`;
}

function buildFollowUpSystemPrompt(
  cfg: LoadedConfig,
  params: FirstContactParams,
  businessContext: BusinessContext | null,
  language: ResolvedLanguage,
  knowledgeBlock: string,
  instruction: string,
  attemptIndex: number
): string {
  const fallback =
    "Reabra o assunto com leveza, sem cobrar. Lembre o lead do que foi prometido na primeira interacao e faca uma pergunta nova que avance a qualificacao.";
  const op = instruction.trim() || fallback;
  return `${commonPreamble(cfg, params.channel, language)}
${businessContext ? renderBusinessContext(businessContext) : ""}
${knowledgeBlock}
CONTEXTO DESTE LEAD:
- Nome: ${params.leadName || "ainda nao sabemos"}
- Origem: ${params.leadSource}
${params.campaignInfo ? `- Campanha: ${params.campaignInfo}` : ""}

VOCE JA TENTOU FALAR COM ESTE LEAD ${attemptIndex} VEZES e ele(a) nao respondeu ainda.
Quanto maior o numero da tentativa, mais leve e curta a abordagem.
NUNCA repita textualmente o que voce ja enviou. Mude a estrutura, a abertura e a pergunta.

INSTRUCAO DO OPERADOR PARA ESTE FOLLOW-UP:
${op}

SUA TAREFA AGORA:
Escreva o follow-up para este lead, separado em baloes com |||. Varia o texto a cada envio.
Nao se desculpe por ter mandado mensagem antes. Nao force resposta.`;
}

function buildFollowUpUserTurn(
  params: FirstContactParams,
  attemptIndex: number
): string {
  const name = params.leadName ? ` ${params.leadName}` : "";
  return `Hora de retomar o contato com${name}. Tentativa numero ${attemptIndex + 1}. Escreva o follow-up agora no canal ${params.channel}.`;
}

/**
 * Render an "exact" first message: the operator typed the literal text and
 * we just substitute the supported placeholders. Lead name fallback is
 * intentional, "amigo" never goes out unless explicitly opted in.
 */
function renderExactMessage(template: string, params: FirstContactParams): string {
  const name = params.leadName || "";
  const company = (params.leadMetadata?.companyName as string) || "";
  const campaign = params.campaignInfo || "";
  const replacements: Record<string, string> = {
    "{nome}": name,
    "{name}": name,
    "{empresa}": company,
    "{company}": company,
    "{campanha}": campaign,
    "{campaign}": campaign,
  };
  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }
  // Collapse double spaces left by empty substitutions, but preserve line breaks.
  return out
    .split("\n")
    .map((l) => l.replace(/  +/g, " ").trim())
    .join("\n")
    .trim();
}

function buildResponseSystemPrompt(
  cfg: LoadedConfig,
  params: GenerateResponseParams,
  flags: {
    escalation: boolean;
    conversion: boolean;
    schedulingContext?: SchedulingContext | null;
    businessContext?: BusinessContext | null;
    language: ResolvedLanguage;
    knowledgeBlock?: string;
    mediaBlock?: string;
  }
): string {
  const pipelineGoal = personaField(cfg.persona, "pipelineGoal", "closeSale");
  const calendarEnabled = personaField<boolean>(
    cfg.persona,
    "pipelineCalendarEnabled",
    false
  );

  const goalInstruction = describeGoal(String(pipelineGoal), calendarEnabled);

  const escalationLine = flags.escalation
    ? "ATENÇÃO: O lead pediu atendimento humano ou demonstrou insatisfação séria. Avise com empatia que você vai conectar ele com um especialista agora e encerre sua resposta por aqui."
    : "";
  const conversionLine = flags.conversion
    ? "ATENÇÃO: O lead demonstrou intenção clara de compra. Conduza o fechamento, confirme o que ele quer, colete os dados que faltam e indique o próximo passo concreto (link de pagamento, agendamento, proposta)."
    : "";

  const schedulingBlock = flags.schedulingContext?.connected
    ? buildSchedulingBlock(flags.schedulingContext)
    : "";

  const businessBlock = flags.businessContext
    ? renderBusinessContext(flags.businessContext)
    : "";

  const closingBlock = buildClosingBlock(cfg.persona);

  return `${commonPreamble(cfg, params.channel, flags.language)}
${businessBlock}
${flags.knowledgeBlock || ""}
${flags.mediaBlock || ""}
CONTEXTO DO LEAD:
- Nome: ${params.leadName || "desconhecido"}
- Telefone: ${params.leadPhone || "—"}
- Email: ${params.leadEmail || "—"}
- Origem: ${params.leadSource}
${params.campaignInfo ? `- Campanha: ${params.campaignInfo}` : ""}

OBJETIVO DO FUNIL:
${goalInstruction}

${escalationLine}
${conversionLine}
${schedulingBlock}
${closingBlock}

OBSERVAÇÃO SOBRE DEBOUNCE:
O lead pode ter enviado várias mensagens seguidas. Elas aparecem juntas na última fala como "user". Responda a TUDO de uma vez, de forma coesa, como se tivesse lido tudo antes de responder.`;
}

/**
 * Builds the "Estrategia de Fechamento" block that tells the AI exactly
 * how the operator wants closing handled — which questions are required,
 * which link to send, when to ping a team member. The AI signals its
 * decisions with `[CLOSE_WITH_LINK]` or `[HANDOFF_TO_TEAM:summary]`
 * tags that send-parts.ts parses and acts on.
 */
function buildClosingBlock(persona: Record<string, unknown>): string {
  const strategy = String(
    personaField(persona, "pipelineClosingStrategy", "auto")
  );
  const closingLink = String(personaField(persona, "pipelineClosingLink", ""));
  const closingMessage = String(personaField(persona, "pipelineClosingMessage", ""));
  const questions = (personaField(persona, "pipelineQualifyingQuestions", []) as unknown[])
    .map((q) => String(q || "").trim())
    .filter(Boolean);
  const requiredInfo = (personaField(persona, "pipelineRequiredInfo", []) as unknown[])
    .map((q) => String(q || "").trim())
    .filter(Boolean);
  const handoffEmail = String(personaField(persona, "pipelineHandoffEmail", ""));
  const handoffWebhook = String(personaField(persona, "pipelineHandoffWebhook", ""));
  const handoffWaitMessage = String(
    personaField(persona, "pipelineHandoffWaitMessage", "")
  );
  const hasHandoffTarget = !!handoffEmail || !!handoffWebhook;

  // If absolutely nothing is configured, return empty so the prompt stays clean.
  if (
    strategy === "auto" &&
    !closingLink &&
    !hasHandoffTarget &&
    questions.length === 0 &&
    requiredInfo.length === 0
  ) {
    return "";
  }

  const parts: string[] = [
    "",
    "════════════════════════════════════════════════════",
    "ESTRATEGIA DE FECHAMENTO — esta secao define COMO voce conclui a venda",
    "════════════════════════════════════════════════════",
  ];

  // Mode description
  if (strategy === "direct_link") {
    parts.push(
      "MODO: enviar link direto. Quando o lead demonstrar intencao clara de fechar, envie o link de fechamento (abaixo). Nao precisa fazer perguntas de qualificacao se a instrucao nao listar nenhuma."
    );
  } else if (strategy === "qualify_first") {
    parts.push(
      "MODO: qualificar antes. Voce DEVE conseguir resposta para CADA pergunta de qualificacao abaixo antes de tentar fechar. Faca uma pergunta por vez, naturalmente, sem soar como formulario. Quando tiver todas as respostas, envie o link de fechamento."
    );
  } else if (strategy === "team_handoff") {
    parts.push(
      "MODO: handoff pra equipe humana. Voce coleta as informacoes obrigatorias abaixo, depois passa o caso pra um vendedor humano gerar a proxima acao. Nao tente fechar sozinha. Use a tag [HANDOFF_TO_TEAM:resumo curto do que precisa ser feito] quando estiver pronta pra acionar a equipe."
    );
  } else {
    // auto
    parts.push(
      "MODO: automatico. Use o link direto quando o lead estiver claramente pronto (perguntando preco, querendo comprar). Acione a equipe humana quando precisar de algo customizado (geracao manual de link, negociacao especial, duvida fora do seu conhecimento). Use sua leitura da conversa."
    );
  }

  // Qualifying questions
  if (questions.length > 0) {
    parts.push("");
    parts.push("PERGUNTAS OBRIGATORIAS DE QUALIFICACAO (precisa de resposta clara pra cada):");
    questions.forEach((q, i) => parts.push(`${i + 1}. ${q}`));
    parts.push(
      "REGRA: nao envie link nem acione handoff antes de ter resposta pras perguntas acima. Faca UMA por vez, espalhadas pela conversa, sem parecer interrogatorio."
    );
  }

  // Required info to capture for handoff
  if (requiredInfo.length > 0 && (strategy === "team_handoff" || strategy === "auto")) {
    parts.push("");
    parts.push("INFORMACOES OBRIGATORIAS PRA HANDOFF (capture antes de chamar a equipe):");
    requiredInfo.forEach((f, i) => parts.push(`${i + 1}. ${f}`));
  }

  // Link config
  if (closingLink && (strategy === "direct_link" || strategy === "qualify_first" || strategy === "auto")) {
    parts.push("");
    parts.push("LINK DE FECHAMENTO:");
    parts.push(`URL: ${closingLink}`);
    if (closingMessage) {
      parts.push(`Mensagem que acompanha: ${closingMessage}`);
    }
    parts.push("");
    parts.push(
      "Quando estiver na hora de enviar, use NO FIM da sua resposta a tag invisivel:"
    );
    parts.push("[CLOSE_WITH_LINK]");
    parts.push(
      "O sistema vai apagar a tag, anexar o link como balao separado e marcar o lead como pronto pra fechar. Nao cite o link na sua fala visivel se voce vai usar a tag, o sistema cuida disso."
    );
  }

  // Handoff config
  if (hasHandoffTarget && (strategy === "team_handoff" || strategy === "auto")) {
    parts.push("");
    parts.push("HANDOFF PRA EQUIPE:");
    parts.push(
      "Quando precisar acionar a equipe humana (ex: lead quer gerar link customizado, negociar valor, tirar duvida fora do seu treinamento), use NO FIM da sua resposta a tag:"
    );
    parts.push("[HANDOFF_TO_TEAM:resumo curto da acao que voce precisa que a equipe faca]");
    parts.push(
      `Ex: [HANDOFF_TO_TEAM:gerar link Stripe pro plano Plus mensal, R$ 297]`
    );
    parts.push(
      `O sistema vai apagar a tag e notificar a equipe ${
        handoffEmail && handoffWebhook
          ? "via email e webhook"
          : handoffEmail
            ? "via email"
            : "via webhook"
      } com todo o contexto da conversa.`
    );
    if (handoffWaitMessage) {
      parts.push(
        `Antes de usar a tag, mande primeiro pro lead esta mensagem (ou variacao com o mesmo sentido): "${handoffWaitMessage}"`
      );
    }
  }

  return parts.join("\n");
}

interface SchedulingContext {
  connected: boolean;
  timeZone: string;
  durationMinutes: number;
  slots: { startISO: string; endISO: string }[];
}

async function maybeLoadSchedulingContext(
  accountId: string,
  cfg: LoadedConfig
): Promise<SchedulingContext | null> {
  const goal = String(personaField(cfg.persona, "pipelineGoal", "closeSale"));
  const calendarEnabled = personaField<boolean>(
    cfg.persona,
    "pipelineCalendarEnabled",
    false
  );
  if (goal !== "scheduleMeeting" || !calendarEnabled) return null;

  const status = await getIntegrationStatus(accountId);
  if (!status.connected) return null;

  const durationMinutes = Number(
    personaField(cfg.persona, "pipelineMeetingDuration", 30)
  );
  const businessHoursStart = Number(
    personaField(cfg.persona, "pipelineBusinessHoursStart", 9)
  );
  const businessHoursEnd = Number(
    personaField(cfg.persona, "pipelineBusinessHoursEnd", 18)
  );
  const timeZone = String(
    personaField(cfg.persona, "pipelineTimeZone", "America/Sao_Paulo")
  );

  let slots: { startISO: string; endISO: string }[] = [];
  try {
    slots = await findAvailableSlots(accountId, {
      durationMinutes,
      days: 7,
      businessHoursStart,
      businessHoursEnd,
      timeZone,
      maxSlots: 8,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[AIEngine] findAvailableSlots failed:", msg);
  }

  return { connected: true, timeZone, durationMinutes, slots };
}

function buildSchedulingBlock(ctx: SchedulingContext): string {
  const slotList = ctx.slots.length
    ? ctx.slots
        .map((s, i) => `  ${i + 1}. ${formatSlotLabel(s.startISO, ctx.timeZone)} (start=${s.startISO}, end=${s.endISO})`)
        .join("\n")
    : "  (sem horários disponíveis nos próximos 7 dias)";

  return `
AGENDAMENTO GOOGLE CALENDAR, INSTRUÇÕES CRÍTICAS:
Você pode agendar uma reunião de ${ctx.durationMinutes} min no calendário. Os slots abaixo já foram filtrados pelos horários comerciais e ocupações atuais do calendário, ofereça 2 ou 3 em linguagem natural ao lead.

SLOTS DISPONÍVEIS (timezone ${ctx.timeZone}):
${slotList}

QUANDO O LEAD CONFIRMAR um horário específico:
1) Confirme o horário em linguagem natural na sua resposta visível.
2) No FINAL da sua resposta, adicione (sem anunciar) uma linha exatamente no formato:
SCHEDULE: {"startISO":"<ISO>","endISO":"<ISO>","summary":"<título>","attendeeName":"<nome do lead>","attendeeEmail":"<email se o lead deu>"}
3) Use EXATAMENTE os valores startISO/endISO de um dos slots acima, não invente horários.
4) Se o lead ainda estiver indeciso ou pedir outro horário, NÃO emita SCHEDULE. Apenas ofereça alternativas.
5) A linha SCHEDULE é removida antes do envio ao lead, nunca a cite na fala visível.`;
}

function formatSlotLabel(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const SCHEDULE_BLOCK_RE = /SCHEDULE:\s*(\{[\s\S]*?\})/i;

function extractScheduleBlock(
  raw: string
): { cleaned: string; intent: ScheduleIntent | null } {
  const match = raw.match(SCHEDULE_BLOCK_RE);
  if (!match) return { cleaned: raw, intent: null };

  const cleaned = raw.replace(SCHEDULE_BLOCK_RE, "").trim();
  try {
    const parsed = JSON.parse(match[1]) as Partial<ScheduleIntent>;
    if (!parsed.startISO || !parsed.endISO) {
      return { cleaned, intent: null };
    }
    return {
      cleaned,
      intent: {
        startISO: parsed.startISO,
        endISO: parsed.endISO,
        summary: parsed.summary,
        attendeeEmail: parsed.attendeeEmail,
        attendeeName: parsed.attendeeName,
      },
    };
  } catch {
    return { cleaned, intent: null };
  }
}

function describeGoal(goal: string, calendarEnabled: boolean): string {
  switch (goal) {
    case "scheduleMeeting":
      return calendarEnabled
        ? "Qualificar o lead e agendar uma reunião no calendário. Pergunte disponibilidade e confirme o horário."
        : "Qualificar o lead e agendar uma reunião com o time comercial.";
    case "qualifyTransfer":
      return "Fazer as perguntas de qualificação e preparar a transferência para um vendedor humano.";
    case "collectSend":
      return "Coletar as informações-chave do lead e indicar que a proposta/material será enviado em seguida.";
    case "closeSale":
    default:
      return "Conduzir a venda até o fechamento: entender a necessidade, tirar objeções e guiar para o próximo passo de compra.";
  }
}

function buildFirstContactUserTurn(params: FirstContactParams): string {
  const source = params.leadSource;
  const name = params.leadName ? ` O nome dele é ${params.leadName}.` : "";
  return `Um novo lead acabou de chegar via ${source}.${name} Escreva agora a primeira mensagem para ele no canal ${params.channel}.`;
}

// ════════════════════════════════════════════════════
// LLM CALLERS
// ════════════════════════════════════════════════════
async function callLLM(
  cfg: LoadedConfig,
  systemPrompt: string,
  messages: HistoryEntry[]
): Promise<string | null> {
  try {
    if (cfg.provider === "anthropic") {
      return await callAnthropic(cfg, systemPrompt, messages);
    }
    return await callOpenAI(cfg, systemPrompt, messages);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[AIEngine] LLM call failed (${cfg.provider}):`, msg);
    return null;
  }
}

const LLM_TIMEOUT_MS = 30_000;
const LLM_MAX_RETRIES = 2;

/** fetch wrapper with timeout + exponential-backoff retry on 5xx/network. */
async function llmFetch(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: ac.signal });
      clearTimeout(timer);
      // Retry only on transient errors
      if (res.status >= 500 || res.status === 429) {
        const body = await res.text().catch(() => "");
        lastError = new Error(`${label} ${res.status}: ${body.slice(0, 300)}`);
        if (attempt < LLM_MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
      return res;
    } catch (err: unknown) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < LLM_MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`${label} failed`);
}

function backoffMs(attempt: number): number {
  // 400ms, 1200ms, 3600ms — with ±25% jitter
  const base = 400 * Math.pow(3, attempt);
  const jitter = base * (Math.random() * 0.5 - 0.25);
  return Math.max(200, Math.round(base + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callOpenAI(
  cfg: LoadedConfig,
  systemPrompt: string,
  messages: HistoryEntry[]
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const res = await llmFetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    },
    "OpenAI"
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callAnthropic(
  cfg: LoadedConfig,
  systemPrompt: string,
  messages: HistoryEntry[]
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const res = await llmFetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    },
    "Anthropic"
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.[0]?.text?.trim() || "";
}

// ════════════════════════════════════════════════════
// TRIGGERS & SENTIMENT
// ════════════════════════════════════════════════════
const DEFAULT_ESCALATION = [
  "falar com humano",
  "falar com alguém",
  "atendente",
  "pessoa real",
  "talk to human",
  "real person",
  "agent",
  "hablar con alguien",
  "reclamação",
  "complaint",
  "queja",
  "problema grave",
];

function matchesAny(text: string, keywords: string[]): boolean {
  const list = keywords.length ? keywords : DEFAULT_ESCALATION;
  const lower = text.toLowerCase();
  return list.some((k) => k && lower.includes(k.toLowerCase()));
}

function analyzeSentiment(
  text: string
): "POSITIVE" | "NEUTRAL" | "NEGATIVE" {
  const positive =
    /obrigad|perfeito|ótimo|excelente|gostei|maravilh|thank|great|perfect|love|awesome|genial|incre[íi]ble/i;
  const negative =
    /horr[íi]vel|p[ée]ssimo|raiva|insatisf|cancel|terrible|awful|angry|furious|horrible|p[ée]simo|cancelar/i;
  if (positive.test(text)) return "POSITIVE";
  if (negative.test(text)) return "NEGATIVE";
  return "NEUTRAL";
}

function collectTags(flags: {
  escalation: boolean;
  conversion: boolean;
  scheduled?: boolean;
  handoff?: boolean;
}): string[] {
  const tags: string[] = [];
  if (flags.escalation) tags.push("escalation");
  if (flags.conversion) tags.push("conversion");
  if (flags.scheduled) tags.push("scheduled");
  if (flags.handoff) tags.push("handoff");
  return tags;
}

function fallbackGreeting(name?: string): string {
  return name
    ? `Oi ${name}! Tudo bem? Obrigado pelo contato, me conta rapidinho o que você procura?`
    : "Oi! Tudo bem? Obrigado pelo contato, me conta rapidinho o que você procura?";
}

// ════════════════════════════════════════════════════
// BUSINESS CONTEXT (Meta integration + lead metadata)
// ════════════════════════════════════════════════════

interface BusinessContext {
  businessName?: string;
  businessNiche?: string;
  businessProduct?: string;
  platform?: string;
  adName?: string;
  campaignName?: string;
  customFields?: Record<string, string>;
}

async function loadBusinessContext(
  accountId: string,
  leadMetadata?: Record<string, unknown>
): Promise<BusinessContext | null> {
  const ctx: BusinessContext = {};
  let hasAny = false;

  // From MetaIntegration business fields (saved by the owner in Settings)
  try {
    const meta = await getMetaStatus(accountId);
    if (meta.connected) {
      if (meta.businessName) {
        ctx.businessName = meta.businessName;
        hasAny = true;
      }
      if (meta.businessNiche) {
        ctx.businessNiche = meta.businessNiche;
        hasAny = true;
      }
      if (meta.businessProduct) {
        ctx.businessProduct = meta.businessProduct;
        hasAny = true;
      }
    }
  } catch {
    // integration optional
  }

  // From lead metadata (leadgen event)
  if (leadMetadata && typeof leadMetadata === "object") {
    const m = leadMetadata as Record<string, unknown>;
    if (typeof m.platform === "string") {
      ctx.platform = m.platform;
      hasAny = true;
    }
    if (typeof m.adName === "string") {
      ctx.adName = m.adName;
      hasAny = true;
    }
    if (typeof m.campaignName === "string") {
      ctx.campaignName = m.campaignName;
      hasAny = true;
    }
    if (m.customFields && typeof m.customFields === "object") {
      const cf = m.customFields as Record<string, string>;
      if (Object.keys(cf).length > 0) {
        ctx.customFields = cf;
        hasAny = true;
      }
    }
  }

  return hasAny ? ctx : null;
}

function renderBusinessContext(ctx: BusinessContext): string {
  const parts: string[] = [];

  if (ctx.businessName || ctx.businessNiche || ctx.businessProduct) {
    parts.push("SOBRE O NEGÓCIO QUE VOCÊ REPRESENTA:");
    if (ctx.businessName) parts.push(`- Empresa: ${ctx.businessName}`);
    if (ctx.businessNiche) parts.push(`- Segmento: ${ctx.businessNiche}`);
    if (ctx.businessProduct)
      parts.push(`- Produto/Oferta principal: ${ctx.businessProduct}`);
    parts.push(
      "Use estas informações para responder com autoridade. Nunca invente números, preços ou políticas que não estejam descritos aqui, se o lead perguntar algo que você não tem, diga que vai confirmar com o time."
    );
    parts.push("");
  }

  if (ctx.platform || ctx.adName || ctx.campaignName) {
    parts.push("DE ONDE ESTE LEAD VEIO:");
    if (ctx.platform) parts.push(`- Plataforma: ${ctx.platform}`);
    if (ctx.campaignName) parts.push(`- Campanha: ${ctx.campaignName}`);
    if (ctx.adName) parts.push(`- Criativo/Anúncio: ${ctx.adName}`);
    parts.push(
      "Use esse contexto para confirmar o interesse do lead (ex.: 'vi que você veio pelo anúncio X') sem parecer invasivo."
    );
    parts.push("");
  }

  if (ctx.customFields && Object.keys(ctx.customFields).length > 0) {
    parts.push("RESPOSTAS QUE O LEAD JÁ DEU NO FORMULÁRIO DE CAMPANHA:");
    for (const [k, v] of Object.entries(ctx.customFields)) {
      parts.push(`- ${k}: ${v}`);
    }
    parts.push(
      "Não peça essas informações de novo. Use-as para tornar sua mensagem mais precisa."
    );
    parts.push("");
  }

  return parts.length ? `\n${parts.join("\n")}` : "";
}
