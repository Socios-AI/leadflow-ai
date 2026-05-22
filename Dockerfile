FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm install` (not `ci`) so the build tolerates lock drift when a new dep
# was added in a commit without locally regenerating the lockfile.
RUN npm install --include=dev --no-audit --no-fund

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ────────────────────────────────────────────────────────────
# WEB RUNNER (Next.js standalone output)
#
# Slim image, only the .next/standalone tree + static assets +
# public. No node_modules baggage. Cuts the runtime image from
# ~600MB to ~150MB and avoids the OOM the host was hitting at the
# `exporting to image` step.
# ────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
# Standalone bundles a minimal node_modules + server.js
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma engines are looked up via node_modules/.prisma at runtime.
# Next standalone tracing already includes them when generate ran in the
# builder stage, but we ship the schema for migrations/introspection.
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "server.js"]
