# Stage 1: Build
FROM node:20-slim AS builder

# Install OpenSSL (required by Prisma) and build tools (for native addons if any)
RUN apt-get update -y && apt-get install -y openssl build-essential python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Stage 2: Production Dependencies
FROM node:20-slim AS deps

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Generate Prisma client for the production environment
RUN npx prisma generate

# Stage 3: Runner (Final Image)
FROM node:20-slim AS runner

# Install OpenSSL for Prisma runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Copy node_modules from deps stage (only prod dependencies)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/prisma ./prisma

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create a non-root user (optional but recommended for security)
RUN groupadd -r epion && useradd -r -g epion epion
RUN chown -R epion:epion /app
USER epion

# The API port
EXPOSE 5175

# Default command launches the API. 
# This can be overridden in docker-compose for the worker (e.g. `command: ["npm", "run", "start:worker"]`)
CMD ["npm", "run", "start:api"]
