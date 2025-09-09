# Multi-stage build for Web service
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

    # Install dependencies
    RUN pnpm install --no-frozen-lockfile

    # Copy source code
    COPY packages/shared ./packages/shared
    COPY apps/web ./apps/web
    COPY tsconfig.base.json ./

# Build shared package first
RUN cd packages/shared && pnpm build

# Build web app
RUN cd apps/web && pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built application (Next.js standalone mode)
COPY --from=base /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/.next/static ./.next/static

# Create public directory structure
COPY --from=base /app/apps/web/public ./public

# Set environment variable for Next.js
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "server.js"]
