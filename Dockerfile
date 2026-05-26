# ---------------------------------------------------------------------------
# Frontend image: Next.js 15 (TypeScript + Tailwind) production build
# ---------------------------------------------------------------------------
# Build context is the project root. Multi-stage build keeps the final
# runtime image small by discarding dev dependencies and build tooling.
#
# REQUIRES: `output: "standalone"` in next.config.(js|ts|mjs). See the
# notes accompanying this file. Without it, the `.next/standalone` folder
# referenced in the runner stage will not exist and the build will fail.
# ---------------------------------------------------------------------------

# ---- Stage 1: dependencies ------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app

# Install dependencies based on the lockfile only, so this layer is cached
# and reused as long as the lockfile does not change.
COPY package.json package-lock.json* ./
RUN npm ci


# ---- Stage 2: build -------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time,
# so the API URL must be available here, not just at runtime.
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# ---- Stage 3: runtime -----------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user for safety.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# The standalone output bundles a minimal server + only the node_modules
# actually needed at runtime. Static assets and the public folder are
# copied separately because standalone does not include them.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# server.js is produced by Next.js inside the standalone output.
CMD ["node", "server.js"]
