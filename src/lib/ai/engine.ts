// src/lib/ai/engine.ts
import OpenAI from "openai";
import prisma from "@/lib/db/prisma";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AIContext {
  accountId: string;
  leadName?: string;
  leadPhone?: string;
  leadEmail?: string;
  leadSource?: string;
  campaignInfo?: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  /** The new message(s) to respond to. May contain multiple messages joined by \n if debounced. */
  currentMessage: string;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
}

export interface AIResponse {
  message: string;
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
  isConversion: boolean;
  isEscalation: boolean;
  shouldNotify: boolean;
  notificationMessage?: string;
}

// ═══════════════════════════════════════════════════════════
// RETRY WRAPPER
// ═══════════════════════════════════════════════════════════

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxAttempts) throw error;
      const retryable =
        error?.status === 429 ||
        error?.status >= 500 ||
        error?.code === "ECONNRESET";
      if (!retryable) throw error;
      await new Promise((r) =>
        setTimeout(r, baseDelay * Math.pow(2, attempt - 1))
      );
    }
  }
  throw new Error("Retry exhausted");
}

// ═══════════════════════════════════════════════════════════
// AI ENGINE
// ═══════════════════════════════════════════════════════════

export class AIEngine {
  /**
   * Generate a response to lead message(s).
   *
   * currentMessage may contain MULTIPLE messages joined by \n
   * (from the debounce system). The AI sees them as a natural
   * sequence of messages the person sent.
   */
  static async generateResponse(ctx: AIContext): Promise<AIResponse> {
    const config = await prisma.aIConfig.findUnique({
      where: { accountId: ctx.accountId },
    });
    if (!config) throw new Error(`No AI config for account ${ctx.accountId}`);

    // Load knowledge base
    const knowledge = await prisma.knowledgeEntry.findMany({
      where: { accountId: ctx.accountId },
      select: { title: true, content: true, category: true },
    });

    // Build campaign context
    let campaignContext = "";
    if (ctx.campaignInfo) {
      campaignContext = `\n\n=== CAMPAIGN CONTEXT ===\n${ctx.campaignInfo}\n=== END CAMPAIGN ===`;
    }

    const knowledgeContext =
      knowledge.length > 0
        ? `\n\n=== KNOWLEDGE BASE ===\n${knowledge
            .map(
              (k) =>
                `[${k.category.toUpperCase()}] ${k.title}:\n${k.content}`
            )
            .join("\n\n")}\n=== END KNOWLEDGE BASE ===`
        : "";

    const systemPrompt = `${config.systemPrompt}

=== LEAD INFO ===
Name: ${ctx.leadName || "Not provided"}
Phone: ${ctx.leadPhone || "Not provided"}
Email: ${ctx.leadEmail || "Not provided"}
Source: ${ctx.leadSource || "Not provided"}
Channel: ${ctx.channel}
=== END LEAD INFO ===${campaignContext}${knowledgeContext}

=== RESPONSE FORMAT ===
You MUST respond in valid JSON with this exact structure:
{
  "message": "your message to the lead",
  "tags": ["relevant", "tags"],
  "sentiment": "positive" | "neutral" | "negative",
  "isConversion": false,
  "isEscalation": false,
  "shouldNotify": false,
  "notificationMessage": null
}

RULES:
1. "isConversion" = true when lead shows clear purchase intent or accepts an offer
2. "isEscalation" = true when lead explicitly asks for a human
3. "shouldNotify" = true on conversion OR escalation
4. Match the lead's language automatically
5. NEVER invent info not in the knowledge base
6. ${ctx.channel === "SMS" ? "Keep under 160 chars" : ""}
7. ${ctx.channel === "WHATSAPP" ? "Natural WhatsApp tone. Keep it human, not robotic." : ""}
8. ${ctx.channel === "EMAIL" ? "Slightly more formal but still friendly" : ""}
9. If the user sent multiple short messages (common on WhatsApp), respond to ALL of them naturally in ONE reply — do not address each line separately.
10. If the user sent an audio message (you'll see [AUDIO TRANSCRIPTION: ...]), respond naturally as if they spoke to you. Do NOT mention it was an audio.
=== END FORMAT ===`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...ctx.conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: ctx.currentMessage },
    ];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const raw = await withRetry(() =>
      openai.chat.completions.create({
        model: config.model || "gpt-4o",
        messages,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 1000,
        response_format: { type: "json_object" },
      })
    );

    const content = raw.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty response");

    return parseAIResponse(content);
  }

  /**
   * Generate the first contact message for a new lead.
   */
  static async generateFirstContact(opts: {
    accountId: string;
    leadName?: string;
    leadSource: string;
    campaignInfo?: string;
    channel: "WHATSAPP" | "EMAIL" | "SMS";
  }): Promise<string> {
    const config = await prisma.aIConfig.findUnique({
      where: { accountId: opts.accountId },
    });
    if (!config) throw new Error("No AI config found");

    const persona = config.persona as Record<string, string> | null;

    const prompt = `${config.systemPrompt}

TASK: Generate a FIRST CONTACT message for this lead. This is the very first message — make it count.

Lead name: ${opts.leadName || "there"}
Source: ${opts.leadSource}
${opts.campaignInfo ? `Campaign context: ${opts.campaignInfo}` : ""}
Channel: ${opts.channel}

${persona?.greeting ? `Greeting template: ${persona.greeting}` : ""}

RULES:
1. Be natural, not robotic
2. Reference how they found us (source/campaign)
3. Ask an engaging question to start conversation
4. ${opts.channel === "SMS" ? "MAX 160 characters" : ""}
5. ${opts.channel === "WHATSAPP" ? "WhatsApp-appropriate, friendly" : ""}
6. ${opts.channel === "EMAIL" ? "Include a clear subject line on the first line, then the body" : ""}

Return ONLY the message text. No quotes, no JSON, no formatting.`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const result = await withRetry(() =>
      openai.chat.completions.create({
        model: config.model || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: opts.channel === "SMS" ? 100 : 500,
      })
    );

    return (
      result.choices[0]?.message?.content?.trim() ||
      "Hello! How can I help you?"
    );
  }

  /**
   * Transcribe audio using OpenAI Whisper.
   * Accepts raw audio buffer (ogg/mp3/m4a/wav/webm).
   */
  static async transcribeAudio(
    audioBuffer: Buffer,
    mimetype: string = "audio/ogg"
  ): Promise<string> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Map mimetype to file extension for Whisper
    const extMap: Record<string, string> = {
      "audio/ogg": "ogg",
      "audio/ogg; codecs=opus": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/x-m4a": "m4a",
    };
    const ext = extMap[mimetype] || "ogg";
    const filename = `audio.${ext}`;

    // Create a File object from the buffer (required by OpenAI SDK)
    const file = new File([new Uint8Array(audioBuffer)], filename, {
      type: mimetype,
    });

    const result = await withRetry(() =>
      openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: undefined, // auto-detect
      })
    );

    return result.text;
  }

  /**
   * Analyze a campaign image — extract ad content for AI context.
   */
  static async analyzeCampaignImage(imageUrl: string): Promise<string> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const result = await withRetry(() =>
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this marketing ad image. Extract: 1) Product/service 2) Target audience 3) Key value proposition 4) Visible text 5) Tone and style. Be detailed — a sales AI will use this.",
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 1000,
      })
    );

    return result.choices[0]?.message?.content || "";
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function parseAIResponse(raw: string): AIResponse {
  try {
    const parsed = JSON.parse(raw);
    return {
      message: parsed.message || "Sorry, I couldn't process that.",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      sentiment: parsed.sentiment || "neutral",
      isConversion: !!parsed.isConversion,
      isEscalation: !!parsed.isEscalation,
      shouldNotify: !!parsed.shouldNotify,
      notificationMessage: parsed.notificationMessage || undefined,
    };
  } catch {
    return {
      message: raw,
      tags: [],
      sentiment: "neutral",
      isConversion: false,
      isEscalation: false,
      shouldNotify: false,
    };
  }
}