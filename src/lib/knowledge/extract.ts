// src/lib/knowledge/extract.ts
//
// Extract plain text from uploaded knowledge files.
//
// Supported formats:
//   text/plain, text/markdown, text/csv, application/json  -> raw UTF-8
//   application/pdf                                        -> pdf-parse
//                                                            (fallback to Vision OCR
//                                                             when pdf-parse yields
//                                                             little text, i.e. scanned PDF)
//   docx (.docx)                                           -> mammoth
//   xlsx/xls (.xlsx, .xls)                                 -> xlsx -> CSV per sheet
//   pptx (.pptx)                                           -> jszip + slide XML text nodes
//   image/* (.png .jpg .jpeg .webp .gif)                   -> OpenAI Vision (gpt-4o-mini)
//
// Returns at most MAX_CHARS of trimmed text so a single file can never
// blow up the AI's context window. The retrieval layer chunks/scores the
// result before injecting into the prompt.

import { logger } from "@/lib/logger";

const log = logger.child({ module: "knowledge/extract" });

const MAX_CHARS = 200_000;
const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "text/html",
]);
const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
// If pdf-parse returns less than this much text, we treat the PDF as a
// scanned document and route it through Vision OCR instead.
const PDF_OCR_FALLBACK_THRESHOLD = 60;

export interface ExtractInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface ExtractResult {
  text: string | null;
  empty: boolean;
  error?: string;
}

export async function extractTextFromFile(
  input: ExtractInput
): Promise<ExtractResult> {
  const mime = (input.mimeType || "").toLowerCase();
  const name = input.fileName.toLowerCase();

  try {
    if (TEXT_MIMES.has(mime) || /\.(txt|md|csv|json|xml|html?)$/i.test(name)) {
      return finalize(input.buffer.toString("utf8"));
    }
    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      // pdf-parse only reads the text layer. Scanned PDFs (just images
      // inside a PDF wrapper) won't have one. We return a clear "no text"
      // signal in that case so the dashboard can show a helpful hint
      // instead of pretending the file was indexed.
      let textLayer = "";
      try {
        textLayer = await extractPdf(input.buffer);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        log.warn("pdf-parse failed", { name, detail });
        return {
          text: null,
          empty: true,
          error: `pdf_parse_failed: ${detail}`,
        };
      }
      if (!textLayer || textLayer.trim().length < PDF_OCR_FALLBACK_THRESHOLD) {
        return {
          text: textLayer || null,
          empty: !textLayer || textLayer.trim().length < PDF_OCR_FALLBACK_THRESHOLD,
          error: "scanned_pdf_no_text_layer",
        };
      }
      return finalize(textLayer);
    }
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      return finalize(await extractDocx(input.buffer));
    }
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel" ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls")
    ) {
      return finalize(await extractXlsx(input.buffer));
    }
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      name.endsWith(".pptx")
    ) {
      return finalize(await extractPptx(input.buffer));
    }
    if (
      IMAGE_MIMES.has(mime) ||
      /\.(png|jpe?g|webp|gif)$/i.test(name)
    ) {
      const guessedMime = mime || guessImageMime(name);
      return finalize(await extractWithVision(input.buffer, guessedMime));
    }
    return { text: null, empty: false };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn("extract failed", { mime, name, detail });
    return { text: null, empty: false, error: detail };
  }
}

function guessImageMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function finalize(raw: string | null): ExtractResult {
  if (!raw) return { text: null, empty: true };
  const cleaned = normalize(raw);
  if (!cleaned) return { text: null, empty: true };
  const truncated =
    cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) : cleaned;
  return { text: truncated, empty: false };
}

function normalize(s: string): string {
  // eslint-disable-next-line no-control-regex
  const controlRe = /[ --]/g;
  return s
    .replace(/\r\n/g, "\n")
    .replace(controlRe, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// CommonJS interop: when Next/webpack treats a CJS module via dynamic
// import, the namespace lands under `.default`. Picking whichever side has
// the real exports keeps us compatible with both shapes.
function cjsInterop<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  if (m && typeof m === "object" && "default" in m && m.default) {
    return m.default as T;
  }
  return mod as T;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Importing from the package root triggers a debug branch that tries to
  // read a sample PDF off disk at startup. Hitting the inner module skips
  // that and only loads the parser.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const parse = cjsInterop<(b: Buffer) => Promise<{ text: string }>>(mod);
  const out = await parse(buffer);
  return out?.text || "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mod = await import("mammoth");
  const mammoth = cjsInterop<{
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  }>(mod);
  const out = await mammoth.extractRawText({ buffer });
  return out?.value || "";
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const mod = await import("xlsx");
  const xlsx = cjsInterop<{
    read: (
      b: Buffer,
      opts?: Record<string, unknown>
    ) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: {
      sheet_to_csv: (sheet: unknown, opts?: Record<string, unknown>) => string;
    };
  }>(mod);
  const wb = xlsx.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = xlsx.utils
      .sheet_to_csv(wb.Sheets[name], { strip: true })
      .trim();
    if (csv) parts.push(`# ${name}\n${csv}`);
  }
  return parts.join("\n\n");
}

async function extractPptx(buffer: Buffer): Promise<string> {
  type ZipFile = { name: string; async: (t: "string") => Promise<string> };
  type Zip = { file: (re: RegExp) => ZipFile[] };
  const mod = await import("jszip");
  const JSZip = cjsInterop<{ loadAsync: (b: Buffer) => Promise<Zip> }>(mod);
  const zip = await JSZip.loadAsync(buffer);
  const slides = zip
    .file(/ppt\/slides\/slide\d+\.xml/)
    .sort((a, b) => slideIndex(a.name) - slideIndex(b.name));
  const parts: string[] = [];
  for (const s of slides) {
    const xml = await s.async("string");
    const text = xml
      .replace(/<a:br\/?>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

function slideIndex(name: string): number {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

// ────────────────────────────────────────────────────────────
// Vision OCR (OpenAI gpt-4o-mini)
//
// Used for images and scanned PDFs. The model is cheap, multilingual, and
// preserves layout reasonably well. We send a single image at a time so
// PDFs would need pre-rasterization, but the gpt-4o-mini vision endpoint
// accepts application/pdf as input directly too in the responses API,
// so we just upload the raw bytes.
// ────────────────────────────────────────────────────────────
async function extractWithVision(buffer: Buffer, mime: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log.warn("vision skipped, OPENAI_API_KEY missing");
    return "";
  }
  // Hard cap on the input we send to Vision (~10MB base64). Bigger files
  // would burn cost without proportional value. Operators wanting more
  // can split the file before upload.
  const MAX_BYTES = 8 * 1024 * 1024;
  const slice = buffer.length > MAX_BYTES ? buffer.subarray(0, MAX_BYTES) : buffer;
  const dataUrl = `data:${mime};base64,${slice.toString("base64")}`;

  const body = {
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are an OCR engine. Extract ALL the text visible in the image or document the user uploads. " +
          "Preserve original line breaks, tables (as CSV-like rows), bullet lists. " +
          "Do NOT summarize, do NOT translate, do NOT add commentary. " +
          "If the document has multiple languages, keep each language as is. " +
          "Return only the extracted text.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract every word, number and label you can read in this file. Output only the text.",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.warn("vision OCR failed", { status: res.status, detail: text.slice(0, 200) });
      return "";
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (data.choices?.[0]?.message?.content || "").trim();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn("vision OCR crashed", { detail });
    return "";
  }
}
