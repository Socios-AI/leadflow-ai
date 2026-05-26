// src/lib/channels/whatsapp.ts
import type { ChannelProvider, SendResult } from "./types";

export class WhatsAppProvider implements ChannelProvider {
  constructor(
    private config: {
      instanceName: string;
      evolutionApiUrl: string;
      evolutionApiKey: string;
    }
  ) {}

  private get baseUrl() {
    return this.config.evolutionApiUrl.replace(/\/+$/, "");
  }

  private get headers() {
    return {
      "Content-Type": "application/json",
      apikey: this.config.evolutionApiKey,
    };
  }

  /**
   * Evolution API rejects phone numbers with the leading `+`. The lead
   * record stores phones in E.164 (`+5511...`) for portability, so we
   * normalize at the edge right before the HTTP call. Also strips spaces
   * and dashes that some forms allow through.
   */
  private normalizeNumber(to: string): string {
    return String(to || "").replace(/[\s\-\(\)]+/g, "").replace(/^\+/, "");
  }

  // ══════════════════════════════════════════════════════════
  // PRESENCE (typing indicator)
  // ══════════════════════════════════════════════════════════

  /**
   * Send "composing" presence to simulate typing.
   * Must be called BEFORE sending the actual message.
   *
   * Calculates a realistic typing delay based on message length:
   * - Short (< 80 chars): ~1.5-2s
   * - Medium (80-200): ~2-3s
   * - Long (200+): ~3-5s
   *
   * Follows Evolution API spec:
   * POST {{baseUrl}}/chat/sendPresence/{{instance}}
   * { "number": "remoteJid", "delay": 1200, "presence": "composing" }
   */
  async sendPresence(
    to: string,
    messageLength: number = 100
  ): Promise<void> {
    // Calculate realistic delay
    const delay = Math.min(
      Math.max(1200, Math.floor(messageLength * 18)),
      5000
    );

    try {
      const url = `${this.baseUrl}/chat/sendPresence/${this.config.instanceName}`;
      await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          number: this.normalizeNumber(to),
          delay,
          presence: "composing",
        }),
      });

      // Wait for the presence to show on the recipient's screen
      // before actually sending the message
      await new Promise((r) => setTimeout(r, delay));
    } catch {
      // Non-critical — still send the message if presence fails
    }
  }

  // ══════════════════════════════════════════════════════════
  // SEND TEXT
  // ══════════════════════════════════════════════════════════

  /**
   * Send a text message. Automatically shows typing indicator first.
   */
  async send(to: string, content: string): Promise<SendResult> {
    const number = this.normalizeNumber(to);
    if (!number) {
      return { success: false, error: "invalid_phone_format" };
    }
    if (!this.config.instanceName) {
      return { success: false, error: "missing_instance_name_in_channel_config" };
    }
    if (!this.baseUrl) {
      return { success: false, error: "missing_evolution_api_url" };
    }
    try {
      await this.sendPresence(number, content.length);

      const url = `${this.baseUrl}/message/sendText/${this.config.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ number, text: content }),
      });

      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // not JSON, keep raw in error
      }
      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status} on ${url}: ${flattenEvolutionError(data, raw)}`,
        };
      }
      const key = (data as { key?: { id?: string } }).key;
      return { success: true, externalId: key?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // SEND MEDIA
  // ══════════════════════════════════════════════════════════

  /**
   * Send media (image/video/document) via Evolution API.
   */
  async sendMedia(
    to: string,
    mediaUrl: string,
    opts?: {
      caption?: string;
      mediatype?: "image" | "video" | "document";
    }
  ): Promise<SendResult> {
    const number = this.normalizeNumber(to);
    if (!number) {
      return { success: false, error: "invalid_phone_format" };
    }
    try {
      await this.sendPresence(number, 50);

      const url = `${this.baseUrl}/message/sendMedia/${this.config.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          number,
          mediatype: opts?.mediatype || "image",
          media: mediaUrl,
          caption: opts?.caption || "",
        }),
      });

      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // not JSON
      }
      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status} on ${url}: ${flattenEvolutionError(data, raw)}`,
        };
      }
      const key = (data as { key?: { id?: string } }).key;
      return { success: true, externalId: key?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // DOWNLOAD MEDIA (for audio transcription)
  // ══════════════════════════════════════════════════════════

  /**
   * Download media from a WhatsApp message using Evolution API.
   * Returns raw Buffer ready for Whisper or any other processing.
   *
   * Uses: POST /chat/getBase64FromMediaMessage/{{instance}}
   */
  async downloadMedia(messageId: string): Promise<{
    buffer: Buffer;
    mimetype: string;
  }> {
    const url = `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.config.instanceName}`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        message: { key: { id: messageId } },
      }),
    });

    if (!res.ok) {
      throw new Error(`Evolution download failed: HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data.base64) {
      throw new Error("No base64 data returned from Evolution API");
    }

    return {
      buffer: Buffer.from(data.base64, "base64"),
      mimetype: data.mimetype || "audio/ogg",
    };
  }
}

/**
 * Evolution returns errors in several shapes depending on version and the
 * specific failure path. Reduce all of them to a single human-readable
 * string for metadata.lastSendError.
 *
 * Shapes seen in the wild:
 *   { message: "string" }
 *   { message: ["string", "string"] }
 *   { response: { message: ["string"] } }
 *   { error: "Bad Request", message: "..." }
 *   plain HTML / raw text from the proxy
 */
function flattenEvolutionError(
  data: Record<string, unknown>,
  raw: string
): string {
  const candidates: unknown[] = [
    data.message,
    (data.response as { message?: unknown } | undefined)?.message,
    data.error,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (Array.isArray(c) && c.length) {
      return c.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
    }
    if (c && typeof c === "object") return JSON.stringify(c).slice(0, 240);
  }
  return raw ? raw.slice(0, 240) : "no_body";
}