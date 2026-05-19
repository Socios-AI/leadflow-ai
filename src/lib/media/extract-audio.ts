// src/lib/media/extract-audio.ts
//
// Strip audio from a video file and re-encode it small enough for Whisper.
//
// Two operating modes:
//
// 1) extractAudioFromPath(inputPath) — preferred path for big uploads.
//    The caller streamed the upload to disk; we just spawn ffmpeg with
//    -i <path>. Memory usage stays under ~50MB regardless of input size.
//
// 2) extractAudioForWhisper(buffer, mime) — legacy in-memory path.
//    Writes the buffer to a temp file, calls extractAudioFromPath.
//
// ffmpeg binary resolution, in order:
//   a) FFMPEG_PATH env var (escape hatch for ops)
//   b) require("ffmpeg-static")        (works in dev + most containers)
//   c) /usr/bin/ffmpeg / /usr/local/bin/ffmpeg (system install — fallback)
//   d) plain "ffmpeg" on $PATH         (last resort)

import { spawn } from "child_process";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "media/extract-audio" });

export interface ExtractedAudio {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

let resolvedBinary: string | null = null;
let resolvedSource: string = "uninit";

function resolveFfmpegBinary(): { path: string; source: string } {
  if (resolvedBinary) return { path: resolvedBinary, source: resolvedSource };

  // 1) Manual override
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    resolvedBinary = envPath;
    resolvedSource = "env:FFMPEG_PATH";
    return { path: resolvedBinary, source: resolvedSource };
  }

  // 2) ffmpeg-static (bundled binary)
  try {
    const mod = require("ffmpeg-static");
    const candidate = (typeof mod === "string" ? mod : mod?.default) as string | null;
    if (candidate && existsSync(candidate)) {
      resolvedBinary = candidate;
      resolvedSource = "ffmpeg-static";
      return { path: resolvedBinary, source: resolvedSource };
    }
  } catch {
    /* not installed or path missing — fall through */
  }

  // 3) Common system installs
  for (const sysPath of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"]) {
    if (existsSync(sysPath)) {
      resolvedBinary = sysPath;
      resolvedSource = `system:${sysPath}`;
      return { path: resolvedBinary, source: resolvedSource };
    }
  }

  // 4) Last resort — rely on $PATH lookup at spawn time
  resolvedBinary = "ffmpeg";
  resolvedSource = "path-lookup";
  return { path: resolvedBinary, source: resolvedSource };
}

/**
 * Extract audio from a file already on disk. Preferred path for large uploads.
 */
export async function extractAudioFromPath(inputPath: string): Promise<ExtractedAudio> {
  const dir = await mkdtemp(join(tmpdir(), "mktdigital-audio-"));
  const outputPath = join(dir, "audio.mp3");

  try {
    const { path: ffmpegBin, source } = resolveFfmpegBinary();
    log.info("ffmpeg binary resolved", { source, ffmpegBin });

    await runFfmpeg(ffmpegBin, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", inputPath,
      "-vn",                      // strip video
      "-ac", "1",                 // mono
      "-ar", "16000",             // 16 kHz, Whisper's internal sample rate
      "-b:a", "32k",              // 32 kbps is plenty for speech
      "-f", "mp3",
      "-y",
      outputPath,
    ]);

    const inputSize = (await stat(inputPath)).size;
    const buffer = await readFile(outputPath);
    log.info("audio extracted", {
      inputMB: (inputSize / 1024 / 1024).toFixed(1),
      outputMB: (buffer.length / 1024 / 1024).toFixed(2),
    });

    return { buffer, mimeType: "audio/mpeg", filename: "audio.mp3" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Backwards-compatible in-memory entrypoint. Prefer extractAudioFromPath for
 * uploads above ~25MB to keep memory bounded.
 */
export async function extractAudioForWhisper(
  input: Buffer,
  inputMime: string
): Promise<ExtractedAudio> {
  const { writeFile } = await import("fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "mktdigital-audio-in-"));
  const inputPath = join(dir, "input" + extFromMime(inputMime));
  try {
    await writeFile(inputPath, input);
    return await extractAudioFromPath(inputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn failed (${bin}): ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 800)}`));
    });
  });
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
  return ".bin";
}
