// src/app/api/campaigns/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, rm, stat, open } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createReadStream } from "fs";
import { getSession } from "@/lib/auth/session";
import { extractAudioFromPath } from "@/lib/media/extract-audio";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "api/campaigns/analyze" });

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const VISION_MAX_BYTES = 20 * 1024 * 1024;
// 250 MB ceiling. req.formData() buffers the whole upload in memory to parse
// it, so a multi-hundred-MB video OOMs the host (~4GB) and surfaces as the
// cryptic "failed to parse body as a FormData". We reject early (by
// content-length, before reading the body) with a clean 413. The client caps
// at 200 MB with a friendlier message, so this is just the server backstop.
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

const WHISPER_PASSTHROUGH = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/webm", "audio/ogg", "audio/flac", "audio/x-m4a", "audio/m4a",
  "audio/mp4", "audio/aac",
]);

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/campaigns/analyze
 *
 * Pipeline:
 *   1) Stream the upload directly to a temp file on disk (no in-memory buffering).
 *   2) Video → ffmpeg extract audio → Whisper.
 *      Audio in passthrough mime + < 25MB → Whisper direct.
 *      Otherwise → ffmpeg re-encode → Whisper.
 *   3) Image → GPT-4o Vision.
 *   4) Text → direct prompt.
 *   5) Final GPT-4o analysis.
 *
 * Error codes:
 *   FILE_TOO_LARGE_UPLOAD, AUDIO_TOO_LONG, FILE_TOO_LARGE_IMAGE,
 *   AUDIO_CODEC_UNSUPPORTED, FFMPEG_FAILED, NO_CONTENT,
 *   WHISPER_FAILED, VISION_FAILED, ANALYSIS_FAILED
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
  }

  // Quick reject on giant uploads before reading the body
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "FILE_TOO_LARGE_UPLOAD",
        sizeMB: Math.round((contentLength / 1024 / 1024) * 10) / 10,
        limitMB: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
      },
      { status: 413 }
    );
  }

  // Parse the multipart body in its OWN guard. For big videos on a flaky
  // connection (or a proxy body limit) `req.formData()` throws a raw
  // "failed to parse body as a FormData" — we turn that into a clean,
  // actionable message instead of a scary 500. This is the error users were
  // hitting when uploading campaign videos.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log.warn("formData parse failed", { detail });
    return NextResponse.json(
      {
        error: "UPLOAD_FAILED",
        message:
          "Não consegui receber o arquivo — provavelmente é muito grande ou a conexão caiu durante o envio. Tente um vídeo mais curto/leve, ou cole a legenda/copy do anúncio que a IA analisa por texto.",
        detail,
      },
      { status: 400 }
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "mktdigital-analyze-"));

  try {
    const type = String(formData.get("type") || "");
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;
    const caption = (formData.get("caption") as string | null) || "";
    const campaignName = (formData.get("campaignName") as string) || "Sem nome";

    let contentToAnalyze = "";

    // ═══════════════════════════════════════
    // 1. AUDIO / VIDEO → Whisper
    // ═══════════════════════════════════════
    if ((type === "audio" || type === "video") && file) {
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
      const isVideo = type === "video" || mime.startsWith("video/");
      const passthroughEligible =
        !isVideo &&
        file.size <= WHISPER_MAX_BYTES &&
        WHISPER_PASSTHROUGH.has(mime);

      // Stream upload to disk — never buffer the whole file in memory
      const inputPath = join(workDir, "input" + extFromMime(mime));
      await streamFileToDisk(file, inputPath);

      let whisperPath: string;
      let whisperMime: string;
      let whisperFilename: string;

      if (passthroughEligible) {
        whisperPath = inputPath;
        whisperMime = mime || "audio/mpeg";
        whisperFilename = file.name || "audio.mp3";
        log.info("passthrough audio", { mime, sizeMB: (file.size / 1024 / 1024).toFixed(1) });
      } else {
        try {
          const extracted = await extractAudioFromPath(inputPath);
          // Persist the extracted buffer back to disk so we can stream it to Whisper.
          const outPath = join(workDir, "audio.mp3");
          const fh = await open(outPath, "w");
          try {
            await fh.writeFile(extracted.buffer);
          } finally {
            await fh.close();
          }
          whisperPath = outPath;
          whisperMime = extracted.mimeType;
          whisperFilename = extracted.filename;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          log.error("ffmpeg failed", { detail });
          // Distinguish binary-missing from codec-unsupported for the UI
          const code =
            /spawn|ENOENT|not found/i.test(detail)
              ? "FFMPEG_FAILED"
              : "AUDIO_CODEC_UNSUPPORTED";
          return NextResponse.json(
            { error: code, detail },
            { status: code === "FFMPEG_FAILED" ? 500 : 415 }
          );
        }
      }

      // Final size guard before paying for the Whisper call
      const finalSize = (await stat(whisperPath)).size;
      if (finalSize > WHISPER_MAX_BYTES) {
        return NextResponse.json(
          {
            error: "AUDIO_TOO_LONG",
            sizeMB: Math.round((finalSize / 1024 / 1024) * 10) / 10,
            limitMB: 25,
          },
          { status: 413 }
        );
      }

      // Build the multipart payload for OpenAI by reading the temp file
      // into a single ArrayBuffer. After ffmpeg this is always < 25 MB.
      const audioBytes = await readFileAsArrayBuffer(whisperPath);
      const whisperForm = new FormData();
      whisperForm.append(
        "file",
        new Blob([audioBytes], { type: whisperMime }),
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
        log.error("whisper http error", { status: whisperRes.status, body: err.slice(0, 400) });
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
                { type: "text", text: imageAnalysisPrompt(campaignName, caption) },
              ],
            },
          ],
        }),
      });

      if (!visionRes.ok) {
        const err = await visionRes.text();
        log.error("vision http error", { status: visionRes.status, body: err.slice(0, 400) });
        return NextResponse.json({ error: "VISION_FAILED", detail: err }, { status: 502 });
      }

      const visionData = await visionRes.json();
      const analysis = visionData.choices?.[0]?.message?.content || "";
      return NextResponse.json({ analysis, transcription: analysis });
    }

    // ═══════════════════════════════════════
    // 3. TEXT → direct
    // ═══════════════════════════════════════
    else if (type === "text" && text) {
      contentToAnalyze = text;
    } else {
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
          { role: "system", content: finalAnalysisSystemPrompt() },
          { role: "user", content: finalAnalysisUserPrompt(campaignName, contentToAnalyze) },
        ],
      }),
    });

    if (!analysisRes.ok) {
      const err = await analysisRes.text();
      log.error("gpt http error", { status: analysisRes.status, body: err.slice(0, 400) });
      return NextResponse.json({ error: "ANALYSIS_FAILED", detail: err }, { status: 502 });
    }

    const analysisData = await analysisRes.json();
    const analysis =
      analysisData.choices?.[0]?.message?.content || "Não foi possível analisar.";
    return NextResponse.json({ analysis, transcription: contentToAnalyze });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("analyze unexpected error", { msg });
    return NextResponse.json({ error: "ANALYSIS_FAILED", detail: msg }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── helpers ──────────────────────────────────────────────────

async function streamFileToDisk(file: File, dest: string): Promise<void> {
  const fh = await open(dest, "w");
  try {
    // Convert the Web ReadableStream into a Node Readable and pipe
    const nodeStream = Readable.fromWeb(file.stream() as unknown as import("stream/web").ReadableStream);
    await pipeline(nodeStream, fh.createWriteStream());
  } finally {
    await fh.close().catch(() => {});
  }
}

async function readFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
  // Stream the file into an ArrayBuffer. Used for files we already know
  // are tiny (post-ffmpeg, < 25MB). Returning ArrayBuffer (not Uint8Array)
  // makes the Blob constructor accept it cleanly across Node/DOM typings.
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (c: Buffer | string) =>
      chunks.push(typeof c === "string" ? Buffer.from(c) : c)
    );
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const merged = Buffer.concat(chunks);
  const out = new ArrayBuffer(merged.byteLength);
  new Uint8Array(out).set(merged);
  return out;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("webm")) return ".webm";
  if (m.includes("quicktime") || m.includes("mov")) return ".mov";
  if (m.includes("mpeg")) return ".mpeg";
  if (m.includes("mp3")) return ".mp3";
  if (m.includes("wav")) return ".wav";
  if (m.includes("m4a") || m.includes("aac")) return ".m4a";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("flac")) return ".flac";
  if (m.includes("matroska") || m.includes("mkv")) return ".mkv";
  return ".bin";
}

function imageAnalysisPrompt(campaignName: string, caption?: string): string {
  return `Você é um estrategista sênior de marketing digital com 15 anos de experiência. Analise esta imagem do anúncio/campanha "${campaignName}" com profundidade cirúrgica.

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
Responda em português do Brasil. Seja específico, quanto mais detalhado, melhor a IA vai atender os leads.`;
}

function finalAnalysisSystemPrompt(): string {
  return `Você é um estrategista sênior de marketing digital com 15 anos de experiência analisando campanhas de alta performance. Analise o conteúdo dessa campanha com profundidade cirúrgica, sua análise vai alimentar uma IA de vendas que precisa atender leads em tempo real.

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

Seja extremamente específico e detalhado. Quanto mais precisa sua análise, melhor a IA vai converter leads em vendas. Responda em português do Brasil.`;
}

function finalAnalysisUserPrompt(campaignName: string, content: string): string {
  return `Campanha: "${campaignName}"

Conteúdo transcrito/extraído da campanha (pode ser um vídeo de vendas, áudio de pitch, copy de anúncio, ou script):

---
${content}
---

Analise com profundidade. Essa análise vai ser usada para treinar uma IA de vendas que vai atender os leads dessa campanha em tempo real via WhatsApp, Email e SMS.`;
}
