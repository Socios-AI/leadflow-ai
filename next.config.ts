import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Produce a minimal runner: Next ships a self-contained server with just
  // the node_modules it actually traces. Cuts the runtime image from
  // ~600MB to ~150MB and avoids the OOM we were hitting on `docker export`.
  output: "standalone",
  // `ffmpeg-static` ships a native binary at `node_modules/ffmpeg-static/ffmpeg`
  // (or `ffmpeg.exe` on Windows). It must be treated as external so Webpack
  // does not try to bundle it and so the standalone build keeps the binary
  // accessible via require.resolve at runtime.
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "bcrypt",
    "ffmpeg-static",
    // Knowledge-base extractors. They're heavy, server-only, and pull in
    // Node-builtin modules (fs, stream, crypto). Without listing them here
    // webpack tries to bundle them and chokes on the dynamic requires that
    // pdf-parse/mammoth/xlsx use internally.
    "pdf-parse",
    "mammoth",
    "xlsx",
    "jszip",
  ],
  // Ensure the standalone output traces the ffmpeg binary file so it's
  // copied into .next/standalone. Without this, the path returned by
  // `require("ffmpeg-static")` exists in dev but is missing in production.
  outputFileTracingIncludes: {
    "/api/campaigns/analyze": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffmpeg-static/ffmpeg.exe",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);