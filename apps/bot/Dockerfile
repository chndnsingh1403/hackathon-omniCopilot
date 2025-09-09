# Multi-stage build for Bot service
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/bot/package.json ./apps/bot/

    # Install dependencies
    RUN pnpm install --no-frozen-lockfile

    # Copy source code
    COPY packages/shared ./packages/shared
    COPY apps/bot ./apps/bot
    COPY tsconfig.base.json ./

# Build shared package first
RUN cd packages/shared && pnpm build

# Build bot
RUN cd apps/bot && pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/bot/package.json ./apps/bot/

    # Install production dependencies only
    RUN pnpm install --no-frozen-lockfile --prod

    # Copy built code
    COPY --from=base /app/packages/shared/dist ./packages/shared/dist
    COPY --from=base /app/packages/shared/package.json ./packages/shared/
    COPY --from=base /app/apps/bot/dist ./apps/bot/dist

# Expose port
EXPOSE 3978

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3978/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "apps/bot/dist/index.js"]
