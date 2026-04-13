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
          number: to,
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
    try {
      // Show typing before sending
      await this.sendPresence(to, content.length);

      const url = `${this.baseUrl}/message/sendText/${this.config.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ number: to, text: content }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data?.message || `HTTP ${res.status}` };
      }

      return { success: true, externalId: data?.key?.id };
    } catch (error: any) {
      return { success: false, error: error.message };
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
    try {
      await this.sendPresence(to, 50);

      const url = `${this.baseUrl}/message/sendMedia/${this.config.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          number: to,
          mediatype: opts?.mediatype || "image",
          media: mediaUrl,
          caption: opts?.caption || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data?.message || `HTTP ${res.status}` };
      }

      return { success: true, externalId: data?.key?.id };
    } catch (error: any) {
      return { success: false, error: error.message };
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