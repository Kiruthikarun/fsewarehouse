# ─── Multi-stage build for Cloud Run ─────────────────────────────────────────
# Uses Next.js `output: "standalone"` to produce a minimal runtime image.

FROM node:20-slim AS base
# openssl is needed by Prisma's query engine at runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─── deps ───
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ─── builder ───
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Dummy DATABASE_URL so `next build` (which collects page data) doesn't fail at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined at build time, so the WorkOS redirect URI must be
# present here (the Edge middleware reads it). Overridable via --build-arg; defaults
# to the deployed Cloud Run URL (stable: <service>-<projectnumber>.<region>.run.app).
ARG NEXT_PUBLIC_WORKOS_REDIRECT_URI="https://warehouse-505424789443.us-central1.run.app/api/auth/callback"
ENV NEXT_PUBLIC_WORKOS_REDIRECT_URI=${NEXT_PUBLIC_WORKOS_REDIRECT_URI}
RUN npm run build

# ─── runner ───
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma schema + generated client + migrations needed for `migrate deploy` at release.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
