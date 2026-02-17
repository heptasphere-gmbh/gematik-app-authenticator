# Multi-stage build for slim container

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S shimuser && \
    adduser -u 1001 -S shimuser -G shimuser

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy healthcheck script
COPY scripts/ ./scripts/

# Create directories for logs and uploads
RUN mkdir -p /app/logs /app/uploads && \
    chown -R shimuser:shimuser /app

# Switch to non-root user
USER shimuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node /app/scripts/healthcheck.js

# Start application
CMD ["node", "dist/index.js"]
