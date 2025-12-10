FROM node:18.18.0-alpine AS base

# 1. Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# 2. Build source
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY .env.production .env.production   # FIX ❗
RUN yarn build

# 3. Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules   # FIX ❗
COPY --from=builder /app/package.json ./package.json    # FIX ❗

EXPOSE 3003
ENV PORT=3003

CMD ["node", "server.js"]  # hoặc "yarn start" nếu không dùng standalone
