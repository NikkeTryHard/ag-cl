FROM node:20-alpine

WORKDIR /app

# Install dependencies first (for layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create config directory
RUN mkdir -p /root/.config/antigravity-proxy

# Default port
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

# Start the server
CMD ["npx", "tsx", "src/index.ts"]
