# Multi-stage build for API service
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

    # Install dependencies
    RUN pnpm install --no-frozen-lockfile

    # Copy source code
    COPY packages/shared ./packages/shared
    COPY apps/api ./apps/api
    COPY tsconfig.base.json ./

# Build shared package first
RUN cd packages/shared && pnpm build

# Build API
RUN cd apps/api && pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm and PostgreSQL client
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

    # Install production dependencies only
    RUN pnpm install --no-frozen-lockfile --prod

    # Copy built code
    COPY --from=base /app/packages/shared/dist ./packages/shared/dist
    COPY --from=base /app/packages/shared/package.json ./packages/shared/
    COPY --from=base /app/apps/api/dist ./apps/api/dist

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "apps/api/dist/index.js"]
