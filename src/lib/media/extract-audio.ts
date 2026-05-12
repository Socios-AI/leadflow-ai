// src/lib/media/extract-audio.ts
//
// Strip audio from a video file and re-encode it small enough for Whisper.
// Whisper has a hard 25MB limit per request, and marketing creatives are
// often 100MB+. The audio track itself is tiny — a 10-minute video at
// 32kbps mono produces ~2.4MB of audio. This is the standard escape hatch.
//
// We shell out to the ffmpeg binary shipped by `ffmpeg-static` and pipe
// through stdin/stdout to avoid disk writes when possible. For large
// uploads we fall back to a temp file because some containers (mov, mkv)
// require seekable input.

import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "media/extract-audio" });

interface ExtractedAudio {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Extract and downsample audio for Whisper transcription.
 *
 * Output: 16 kHz mono MP3 at 32 kbps — empirically transparent for speech
 * recognition while keeping file size minimal.
 */
export async function extractAudioForWhisper(
  input: Buffer,
  inputMime: string
): Promise<ExtractedAudio> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary not available — install ffmpeg-static");
  }

  // Some containers (.mov, .mkv) need seekable input. The safe path is
  // always: write input to temp file, run ffmpeg with -i tempfile, read
  // output. The cost of one disk write is negligible compared to the
  // network upload itself.
  const dir = await mkdtemp(join(tmpdir(), "mktdigital-audio-"));
  const inputPath = join(dir, "input" + extFromMime(inputMime));
  const outputPath = join(dir, "audio.mp3");

  try {
    await writeFile(inputPath, input);

    await runFfmpeg([
      "-hide_banner",
      "-loglevel", "error",
      "-i", inputPath,
      "-vn",                      // strip video
      "-ac", "1",                 // mono
      "-ar", "16000",             // 16 kHz — Whisper's internal sample rate
      "-b:a", "32k",              // 32 kbps is plenty for speech
      "-f", "mp3",
      "-y",
      outputPath,
    ]);

    const buffer = await readFile(outputPath);
    log.info("audio extracted", {
      inputMB: (input.length / 1024 / 1024).toFixed(1),
      outputMB: (buffer.length / 1024 / 1024).toFixed(2),
    });

    return {
      buffer,
      mimeType: "audio/mpeg",
      filename: "audio.mp3",
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(0, 500)}`));
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
