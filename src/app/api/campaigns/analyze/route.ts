// src/app/api/campaigns/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractAudioForWhisper } from "@/lib/media/extract-audio";

// Whisper hard limits — see https://platform.openai.com/docs/api-reference/audio
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const VISION_MAX_BYTES = 20 * 1024 * 1024;
// Max raw upload we'll accept for audio/video. Anything larger is almost
// certainly an upload mistake — even a 30-minute 1080p H.264 is < 1GB.
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1GB

// Container formats Whisper extracts audio from. Codec inside still matters,
// but checking the container catches the most common upload mistakes.
const WHISPER_ACCEPTED = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/webm", "audio/ogg", "audio/flac", "audio/x-m4a", "audio/m4a",
  "audio/mp4", "audio/aac",
  "video/mp4", "video/mpeg", "video/webm", "video/quicktime",
];

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/campaigns/analyze
 *
 * Analyzes campaign content using OpenAI:
 * - Audio/Video → Whisper transcription → GPT-4o analysis
 * - Image → GPT-4o Vision
 * - Text → GPT-4o analysis
 *
 * Returns structured error codes so the UI can show a human-friendly message:
 *   { error: "FILE_TOO_LARGE_UPLOAD", sizeMB, limitMB }
 *   { error: "AUDIO_TOO_LONG", sizeMB, limitMB }
 *   { error: "FILE_TOO_LARGE_IMAGE", sizeMB, limitMB }
 *   { error: "AUDIO_CODEC_UNSUPPORTED", detail }
 *   { error: "NO_CONTENT" }
 *   { error: "WHISPER_FAILED", detail }
 *   { error: "VISION_FAILED", detail }
 *   { error: "ANALYSIS_FAILED", detail }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const type = formData.get("type") as string;
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;
    const caption = formData.get("caption") as string | null;
    const campaignName = (formData.get("campaignName") as string) || "Sem nome";

    let contentToAnalyze = "";

    // ═══════════════════════════════════════
    // 1. AUDIO / VIDEO → Whisper
    // ═══════════════════════════════════════
    if ((type === "audio" || type === "video") && file) {
      // Hard ceiling so we don't OOM the server. 1GB is generous —
      // a 30-minute 1080p H.264 video is typically < 700MB.
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            error: "FILE_TOO_LARGE_UPLOAD",
            sizeMB: Math.round((file.size / 1024 / 1024) * 10) / 10,
            limitMB: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
          },
          { status: 413 }
        );
      }

      const mime = (file.type || "").toLowerCase();
      const rawBuffer = Buffer.from(await file.arrayBuffer());

      // Decide whether to re-encode through ffmpeg:
      //  - Video → always extract audio (saves 95%+)
      //  - Audio already small enough and in a Whisper-friendly container → pass through
      //  - Audio too big OR unknown codec → re-encode through ffmpeg
      const needsExtraction =
        type === "video" ||
        rawBuffer.length > WHISPER_MAX_BYTES ||
        (mime && !WHISPER_ACCEPTED.includes(mime));

      let whisperBuffer: Buffer;
      let whisperMime: string;
      let whisperFilename: string;

      if (needsExtraction) {
        try {
          const extracted = await extractAudioForWhisper(rawBuffer, mime || "video/mp4");
          whisperBuffer = extracted.buffer;
          whisperMime = extracted.mimeType;
          whisperFilename = extracted.filename;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error("ffmpeg extraction error:", detail);
          return NextResponse.json(
            { error: "AUDIO_CODEC_UNSUPPORTED", detail },
            { status: 415 }
          );
        }
      } else {
        whisperBuffer = rawBuffer;
        whisperMime = mime || "audio/mpeg";
        whisperFilename = file.name || "audio.mp3";
      }

      // Even after extraction, an extremely long recording could still
      // exceed 25MB. 25MB of 32kbps audio = ~100 minutes of speech.
      if (whisperBuffer.length > WHISPER_MAX_BYTES) {
        return NextResponse.json(
          {
            error: "AUDIO_TOO_LONG",
            sizeMB: Math.round((whisperBuffer.length / 1024 / 1024) * 10) / 10,
            limitMB: 25,
          },
          { status: 413 }
        );
      }

      const whisperForm = new FormData();
      // Copy into a fresh Uint8Array so the BlobPart typing matches across
      // Node's Buffer (ArrayBufferLike) and DOM Blob (ArrayBuffer).
      const blobBytes = new Uint8Array(whisperBuffer.byteLength);
      blobBytes.set(whisperBuffer);
      whisperForm.append(
        "file",
        new Blob([blobBytes], { type: whisperMime }),
        whisperFilename
      );
      whisperForm.append("model", "whisper-1");
      whisperForm.append("response_format", "text");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        console.error("Whisper error:", err);
        const lower = err.toLowerCase();
        if (lower.includes("decode") || lower.includes("format") || lower.includes("invalid")) {
          return NextResponse.json(
            { error: "AUDIO_CODEC_UNSUPPORTED", detail: err },
            { status: 415 }
          );
        }
        return NextResponse.json(
          { error: "WHISPER_FAILED", detail: err },
          { status: 502 }
        );
      }

      contentToAnalyze = await whisperRes.text();
      if (caption) contentToAnalyze += `\n\nLegenda/Copy do anúncio:\n${caption}`;
    }

    // ═══════════════════════════════════════
    // 2. IMAGE → GPT-4o Vision
    // ═══════════════════════════════════════
    else if (type === "image" && file) {
      if (file.size > VISION_MAX_BYTES) {
        return NextResponse.json(
          {
            error: "FILE_TOO_LARGE_IMAGE",
            sizeMB: Math.round((file.size / 1024 / 1024) * 10) / 10,
            limitMB: 20,
          },
          { status: 413 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mimeType = file.type || "image/jpeg";

      const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                {
                  type: "text",
                  text: `Você é um estrategista sênior de marketing digital com 15 anos de experiência. Analise esta imagem do anúncio/campanha "${campaignName}" com profundidade cirúrgica.

Retorne a análise EXATAMENTE neste formato:

🎯 PRODUTO/OFERTA
Descreva com precisão o que está sendo vendido, incluindo categoria, faixa de preço estimada (se visível), e modelo de negócio (assinatura, compra única, serviço, etc).

👥 PERFIL DO LEAD
Defina o perfil demográfico e psicográfico: idade estimada, gênero predominante, nível de renda, dores/frustrações que esse produto resolve, e o momento de vida em que essa pessoa provavelmente está.

💎 PROPOSTA DE VALOR
Qual a promessa central? O que diferencia dos concorrentes? Identifique os gatilhos mentais usados (escassez, autoridade, prova social, urgência, etc).

🗣️ SCRIPT DE ABORDAGEM
Escreva exatamente como a IA deve abordar um lead dessa campanha. Inclua: saudação ideal, perguntas de qualificação, e 2-3 respostas para objeções comuns.

⚠️ O QUE NÃO FAZER
Liste 3-4 erros que a IA deve evitar ao atender leads dessa campanha (promessas que não pode fazer, informações que não deve inventar, tom que deve evitar).

📊 DADOS TÉCNICOS
Plataforma provável (Meta Ads, Google, TikTok), formato do criativo, CTA identificado, e landing page provável.
${caption ? `\nLegenda/Copy do anúncio: ${caption}` : ""}
Responda em português do Brasil. Seja específico — quanto mais detalhado, melhor a IA vai atender os leads.`,
                },
              ],
            },
          ],
        }),
      });

      if (!visionRes.ok) {
        const err = await visionRes.text();
        console.error("Vision error:", err);
        return NextResponse.json({ error: "VISION_FAILED", detail: err }, { status: 502 });
      }

      const visionData = await visionRes.json();
      contentToAnalyze = visionData.choices?.[0]?.message?.content || "";

      // Image already analyzed, return directly
      return NextResponse.json({ analysis: contentToAnalyze, transcription: contentToAnalyze });
    }

    // ═══════════════════════════════════════
    // 3. TEXT → direct
    // ═══════════════════════════════════════
    else if (type === "text" && text) {
      contentToAnalyze = text;
    }

    // No content
    else {
      return NextResponse.json({ error: "NO_CONTENT" }, { status: 400 });
    }

    // ═══════════════════════════════════════
    // Final GPT-4o analysis
    // ═══════════════════════════════════════
    const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2000,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `Você é um estrategista sênior de marketing digital com 15 anos de experiência analisando campanhas de alta performance. Analise o conteúdo dessa campanha com profundidade cirúrgica — sua análise vai alimentar uma IA de vendas que precisa atender leads em tempo real.

Retorne a análise EXATAMENTE neste formato:

🎯 PRODUTO/OFERTA
Descreva com precisão o que está sendo vendido. Identifique: categoria do produto/serviço, modelo de negócio (assinatura, compra única, high ticket, etc), faixa de preço se mencionada, e diferenciais competitivos.

👥 PERFIL DO LEAD
Defina quem é o lead ideal: perfil demográfico (idade, gênero, região), nível de consciência (sabe do problema? já buscou soluções?), dores e frustrações principais, e o que essa pessoa espera ouvir para tomar a decisão de compra.

💎 PROPOSTA DE VALOR & GATILHOS
Qual a promessa central da campanha? Liste os gatilhos mentais usados (escassez, autoridade, prova social, urgência, reciprocidade, etc). Identifique se há bônus, garantias, ou condições especiais.

🗣️ COMO A IA DEVE ATENDER
Escreva instruções práticas para a IA:
- Tom de voz ideal (formal, casual, consultivo, energético)
- Saudação recomendada para o primeiro contato
- 3 perguntas de qualificação que a IA deve fazer
- 3-4 respostas para as objeções mais prováveis (preço, timing, confiança)
- Frase de fechamento/CTA que a IA deve usar

⚠️ REGRAS E RESTRIÇÕES
Liste 4-5 coisas que a IA NÃO pode fazer:
- Promessas que não foram feitas na campanha
- Informações que não deve inventar
- Temas que deve evitar
- Quando deve escalar para um humano

📊 INTELIGÊNCIA COMPETITIVA
Com base no conteúdo, infira: nível de sofisticação do marketing (iniciante/intermediário/avançado), plataforma provável de veiculação, e sugestões de melhoria para a campanha.

Seja extremamente específico e detalhado. Quanto mais precisa sua análise, melhor a IA vai converter leads em vendas. Responda em português do Brasil.`,
          },
          {
            role: "user",
            content: `Campanha: "${campaignName}"

Conteúdo transcrito/extraído da campanha (pode ser um vídeo de vendas, áudio de pitch, copy de anúncio, ou script):

---
${contentToAnalyze}
---

Analise com profundidade. Essa análise vai ser usada para treinar uma IA de vendas que vai atender os leads dessa campanha em tempo real via WhatsApp, Email e SMS.`,
          },
        ],
      }),
    });

    if (!analysisRes.ok) {
      const err = await analysisRes.text();
      console.error("GPT error:", err);
      return NextResponse.json({ error: "ANALYSIS_FAILED", detail: err }, { status: 502 });
    }

    const analysisData = await analysisRes.json();
    const analysis = analysisData.choices?.[0]?.message?.content || "Não foi possível analisar.";

    return NextResponse.json({ analysis, transcription: contentToAnalyze });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Campaign analysis error:", msg);
    return NextResponse.json({ error: "ANALYSIS_FAILED", detail: msg }, { status: 500 });
  }
}