#Docker
FROM node:20-alpine AS base   # ⬅ FIX version NextJS yêu cầu >= 20.9

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN apk add --update python3 make g++ \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package.json package-lock.json* ./

# Install NPM dependencies
RUN npm ci --omit=dev || npm install

# 2. Build application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Copy ENV nếu cần
COPY .env .env.production

RUN npm run build   # ⬅ build NextJS thành công sau khi đổi NODE

# 3. Production Image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3003
EXPOSE 3011

ENV PORT=3003
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]   # chạy server Next.js production
