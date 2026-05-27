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
  // Drop heavy, build-time-only packages from the standalone trace. The
  // trace step walks node_modules to figure out what to ship, and on a
  // 4GB Coolify host it OOMs when everything below is included. None of
  // these are needed by the runtime server.
  outputFileTracingExcludes: {
    "*": [
      // SWC native binaries for other platforms (we only need linux-gnu)
      "node_modules/@next/swc-darwin-arm64/**",
      "node_modules/@next/swc-darwin-x64/**",
      "node_modules/@next/swc-win32-arm64-msvc/**",
      "node_modules/@next/swc-win32-ia32-msvc/**",
      "node_modules/@next/swc-win32-x64-msvc/**",
      "node_modules/@next/swc-linux-arm64-gnu/**",
      "node_modules/@next/swc-linux-arm64-musl/**",
      "node_modules/@next/swc-linux-x64-musl/**",
      "node_modules/@swc/core-darwin-arm64/**",
      "node_modules/@swc/core-darwin-x64/**",
      "node_modules/@swc/core-win32-arm64-msvc/**",
      "node_modules/@swc/core-win32-ia32-msvc/**",
      "node_modules/@swc/core-win32-x64-msvc/**",
      "node_modules/@swc/core-linux-arm64-gnu/**",
      "node_modules/@swc/core-linux-arm64-musl/**",
      "node_modules/@swc/core-linux-x64-musl/**",
      // Dev/build-only toolchain
      "node_modules/typescript/**",
      "node_modules/@typescript-eslint/**",
      "node_modules/eslint/**",
      "node_modules/eslint-config-next/**",
      "node_modules/@types/**",
      "node_modules/prettier/**",
      // Test infra that drifts into node_modules but never runs in prod
      "node_modules/jest/**",
      "node_modules/@jest/**",
      "node_modules/vitest/**",
      // Sharp ships a giant prebuilt cache for every libvips combo
      "node_modules/sharp/build/**",
      "node_modules/sharp/vendor/**",
      // Canvas is optional, only pulled in via pdfjs and similar
      "node_modules/canvas/**",
      // Source maps add ~150MB to the trace work for no runtime value
      "**/*.map",
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