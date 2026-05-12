import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // `ffmpeg-static` ships a native binary at `node_modules/ffmpeg-static/ffmpeg`
  // (or `ffmpeg.exe` on Windows). It must be treated as external so Webpack
  // does not try to bundle it and so the standalone build keeps the binary
  // accessible via require.resolve at runtime.
  serverExternalPackages: ["bullmq", "ioredis", "bcrypt", "ffmpeg-static"],
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