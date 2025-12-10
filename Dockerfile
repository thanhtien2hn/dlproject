# =========================
# 1. BASE IMAGE
# =========================
FROM node:20-alpine AS base   # NextJS yêu cầu Node >=20.9

# =========================
# 2. INSTALL DEPENDENCIES
# =========================
FROM base AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install

# =========================
# 3. BUILD PROJECT
# =========================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

COPY .env .env.production   # Nếu cần ENV, giữ nguyên hoặc bỏ nếu không dùng

RUN npm run build

# =========================
# 4. PRODUCTION RUNTIME
# =========================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3003
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
