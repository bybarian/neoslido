# ==========================================
# Phase 1: Build static assets and server
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Enable npm cache mounts for faster builds
COPY package*.json ./
RUN npm ci

# Copy all source files
COPY . .

# Run production build - compiles Vite assets and bundles the Express server using esbuild
RUN npm run build

# ==========================================
# Phase 2: Production service runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Configure node environment
ENV NODE_ENV=production
ENV PORT=3000

# Install ONLY production dependencies to keep the final image highly optimized
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled assets and backend bundles from builder phase
COPY --from=builder /app/dist ./dist

# Document key platform port
EXPOSE 3000

# Start Express multi-turn server
CMD ["npm", "run", "start"]
