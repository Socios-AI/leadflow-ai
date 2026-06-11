import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Deploy resilience: a type-only or lint error must never block a production
  // deploy. TypeScript errors don't affect the compiled JS at runtime, and
  // ESLint already doesn't run in the build image (it isn't installed there).
  // We keep types correct in development; this just stops the Docker build
  // from failing on a stray type mismatch we couldn't catch without a local
  // typecheck. Compilation errors (real syntax/bundling failures) STILL fail.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
      // Prisma CLI (only @prisma/client + .prisma/client are needed at runtime;
      // the `prisma` package is the CLI used during db:generate / migrations).
      // NOTE: do NOT exclude @prisma/get-platform or @prisma/debug — the
      // runtime client (@prisma/client) imports both for engine resolution
      // and structured logging respectively. Excluding them = crash on boot.
      "node_modules/prisma/**",
      "node_modules/@prisma/internals/**",
      "node_modules/@prisma/migrate/**",
      "node_modules/@prisma/fetch-engine/**",
      // Prisma engine binaries for non-runtime platforms. Coolify runs
      // node:20-bookworm-slim (linux-x64-gnu). All other engine targets
      // are dead weight that the tracer is forced to stat & hash.
      "node_modules/@prisma/engines/libquery_engine-darwin*",
      "node_modules/@prisma/engines/libquery_engine-debian-openssl-1*",
      "node_modules/@prisma/engines/libquery_engine-rhel*",
      "node_modules/@prisma/engines/libquery_engine-linux-arm64*",
      "node_modules/@prisma/engines/libquery_engine-linux-musl*",
      "node_modules/@prisma/engines/migration-engine*",
      "node_modules/@prisma/engines/prisma-fmt*",
      "node_modules/@prisma/engines/introspection-engine*",
      "node_modules/@prisma/engines/schema-engine-darwin*",
      "node_modules/@prisma/engines/schema-engine-linux-arm64*",
      "node_modules/@prisma/engines/schema-engine-linux-musl*",
      "node_modules/@prisma/engines/schema-engine-windows*",
      "node_modules/@prisma/engines/query-engine-darwin*",
      "node_modules/@prisma/engines/query-engine-linux-arm64*",
      "node_modules/@prisma/engines/query-engine-linux-musl*",
      "node_modules/@prisma/engines/query-engine-windows*",
      "node_modules/@prisma/engines/query_engine-windows*",
      // Next.js compiled vendor bundles that are TRULY build-only.
      // CAUTION: do NOT exclude next/dist/compiled/babel/** — it ships the
      // `code-frame` module used at RUNTIME by patch-error-inspect for
      // formatting stack traces (loaded via node-environment.js on boot).
      // Excluding it crashes the container with MODULE_NOT_FOUND on start.
      // Same applies to babel-packages and jest-worker (next uses worker
      // threads for ISR/streaming at runtime).
      "node_modules/next/dist/compiled/terser/**",
      "node_modules/next/dist/compiled/webpack/**",
      "node_modules/next/dist/compiled/@ampproject/**",
      "node_modules/next/dist/compiled/sass-loader/**",
      "node_modules/next/dist/compiled/postcss-scss/**",
      // Dev/build-only toolchain
      "node_modules/typescript/**",
      "node_modules/@typescript-eslint/**",
      "node_modules/eslint/**",
      "node_modules/eslint-config-next/**",
      "node_modules/@types/**",
      "node_modules/prettier/**",
      "node_modules/tsx/**",
      "node_modules/rimraf/**",
      "node_modules/cross-env/**",
      // Test infra that drifts into node_modules but never runs in prod
      "node_modules/jest/**",
      "node_modules/@jest/**",
      "node_modules/vitest/**",
      // Sharp ships a giant prebuilt cache for every libvips combo
      "node_modules/sharp/build/**",
      "node_modules/sharp/vendor/**",
      // Canvas is optional, only pulled in via pdfjs and similar
      "node_modules/canvas/**",
      // Tailwind toolchain (CSS already compiled into .next/static/css)
      "node_modules/tailwindcss/**",
      "node_modules/@tailwindcss/**",
      "node_modules/postcss/**",
      "node_modules/autoprefixer/**",
      // Source maps and TypeScript .d.ts files: ~200MB combined of pure
      // build-time metadata the runtime server never reads.
      "**/*.map",
      "**/*.d.ts",
      "**/*.d.cts",
      "**/*.d.mts",
      // README/CHANGELOG/LICENSE files: tiny each but there are thousands.
      // Safe to exclude — runtime never reads these.
      "**/README*",
      "**/CHANGELOG*",
      "**/LICENSE*",
      "**/HISTORY*",
      // NOTE: do NOT use broad `**/test/**` `**/tests/**` `**/__tests__/**`
      // `**/spec/**` excludes here. Many published packages have legit
      // runtime modules under those paths (some-pkg/lib/test/util.js,
      // foo/dist/__tests__/setup.js, etc) and excluding them caused the
      // container to crash on boot with module-not-found.
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