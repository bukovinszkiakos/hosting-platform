# Multi-stage production image for the Next.js frontend.
# Build context is the frontend/ directory:  docker build -t hosting-platform-frontend frontend/
#
# Uses Next.js "standalone" output (next.config.ts): `next build` traces only the
# files and node_modules the server actually needs into .next/standalone, so the
# runtime image ships a minimal self-contained server instead of the full
# dependency tree.

# ---------------------------------------------------------------------------
# Dependencies stage — cached unless package.json/package-lock.json change.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
# libc6-compat covers native modules that expect glibc on Alpine (musl).
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Build stage — produces the standalone server bundle.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage — minimal image running the standalone server.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS final
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Bind to all interfaces on 3000 so the pod is reachable by the Service/ALB and
# the Kubernetes probes; matches k8s/frontend/deployment.yaml (containerPort 3000)
# and service.yaml (targetPort 3000). Without HOSTNAME the standalone server
# would bind to localhost only and be unreachable from outside the pod.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy only what the standalone server needs: public assets, the traced server
# bundle, and the static chunks.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Run as the unprivileged `node` user that the base image provides.
USER node

EXPOSE 3000

CMD ["node", "server.js"]
