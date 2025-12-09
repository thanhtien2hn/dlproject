#Docker
FROM node:18.18.0-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN apk add --update python3 make g++ \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package.json package-lock.json* ./

# Install NPM dependencies
RUN npm ci || npm install

# 2. Rebuild and build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Copy ENV (tuỳ dự án nếu cần)
COPY .env .env.production

RUN npm run build   # ⬅ build chuẩn cho NextJS/React/Nest/Node

# 3. Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3003
EXPOSE 3011

ENV PORT 3003
ENV HOSTNAME 0.0.0.0

CMD ["node", "server.js"]   # Hoặc chạy npm start nếu bạn muốn
# CMD ["npm", "start"]
