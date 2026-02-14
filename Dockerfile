# Multi-stage Docker build for Beleidsscan application
# Includes Chromium and dependencies for Puppeteer-based scraping

# Base stage - Common dependencies
FROM node:20-slim AS base

# Install system dependencies required for Chromium and Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium (we installed it above)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Create non-root user early (needed for COPY --chown)
RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser && \
    mkdir -p /home/nodeuser/.cache/node/corepack && \
    chown -R nodeuser:nodeuser /home/nodeuser

# Dependencies stage - Install pnpm packages
FROM base AS dependencies

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (still as root, pnpm install needs root)
COPY package.json pnpm-lock.yaml ./

# Copy scripts directory needed for postinstall script
COPY scripts/patch-eslintrc.cjs scripts/patch-eslintrc.cjs

# Install all dependencies (including devDependencies for tests)
RUN pnpm install --frozen-lockfile

# Development stage - For running tests
FROM dependencies AS development

# Fix ownership of node_modules (created as root in dependencies stage)
RUN chown -R nodeuser:nodeuser /app/node_modules

# Copy application source with correct ownership (much faster than chown after)
# Note: node_modules is excluded via .dockerignore and exists from dependencies stage
COPY --chown=nodeuser:nodeuser . .

USER nodeuser

# Default command for development
CMD ["pnpm", "run", "dev:all"]

# Production stage - Optimized runtime image
FROM base AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy production dependencies only (as root for pnpm install)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

# Copy application source with correct ownership
COPY --chown=nodeuser:nodeuser . .

# Build the application (as root for pnpm)
RUN pnpm run build:all

# Fix ownership of node_modules and dist (created by pnpm as root)
RUN chown -R nodeuser:nodeuser /app/node_modules /app/dist 2>/dev/null || true

USER nodeuser

# Expose ports
EXPOSE 4000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["pnpm", "run", "dev:all"]
