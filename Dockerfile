FROM node:20-alpine

# Install build deps for native modules (better-sqlite3, sharp)
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production
RUN npm rebuild better-sqlite3
# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p uploads/cars uploads/temp db

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
