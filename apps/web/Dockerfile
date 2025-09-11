# Multi-stage build for Web service
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies for the workspace (no source yet)
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Build shared package first
RUN pnpm -C packages/shared build

# Build web app (must produce .next/standalone)
RUN pnpm -C apps/web build


# ---------------- Production stage ----------------
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# Copy Next.js standalone output and assets
# NOTE: In a monorepo standalone bundle, the entry is apps/web/server.js
COPY --from=base /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=base /app/apps/web/public ./apps/web/public

# Next.js port
ENV PORT=3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application (monorepo standalone entry)
CMD ["node", "apps/web/server.js"]
