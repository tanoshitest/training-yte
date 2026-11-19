# STEPS LMS - self-hosted VPS image using Next.js
# Server components and server actions require Next.js server, not Cloudflare Worker emulation
#
# CANH BAO: file nay KHONG duoc deploy pipeline nao dung. Production tai
# ngoaingusteps.edu.vn build bang Dockerfile.vps (deploy/docker-compose.yml),
# chay cloudflare/worker.ts, khong phai app Next.js nay. Xem muc "Ung dung
# dang chay production nam o cloudflare/, khong phai src/" trong
# docs/system-architecture.md truoc khi doi Dockerfile nay hoac coi no la
# nguon that.

FROM node:22-alpine AS base
RUN (apk add --no-cache libc6-compat || apk add --no-cache libc6-compat) \
 && npm install -g npm@11.6.2 --fetch-timeout=60000 --fetch-retries=5 \
 && npm cache clean --force

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --fetch-timeout=60000 --fetch-retries=5 && npm cache clean --force

FROM deps AS prisma-cli
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN ./node_modules/.bin/prisma generate

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma-cli /app/src/generated ./src/generated
# postcss.config.mjs bắt buộc phải copy — thiếu nó Next.js không chạy
# @tailwindcss/postcss → CSS chỉ có theme tĩnh, mất toàn bộ utility.
COPY package.json package-lock.json tsconfig.json next.config.ts prisma.config.ts postcss.config.mjs ./
COPY prisma ./prisma
COPY cloudflare ./cloudflare
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN ./node_modules/.bin/prisma generate
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV AUTH_SECRET="build-secret-for-type-checking-only"
ENV AUTH_TRUST_HOST="true"
# Tailwind v4 dùng .git làm ranh giới quét class — tạo thư mục giả làm anchor.
RUN mkdir -p .git
RUN NODE_OPTIONS="--max-old-space-size=2048" npx next build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy the standalone output to the root
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy necessary files for Prisma and other runtime needs
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/cloudflare ./cloudflare
COPY --from=builder /app/src/lib/money-words.ts ./src/lib/money-words.ts
COPY --from=builder /app/scripts/import-syllabuses.ts ./scripts/import-syllabuses.ts
COPY --from=builder /app/src/data/syllabuses ./src/data/syllabuses
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Install minimal prisma CLI for migrations and seeding
RUN npm install --no-save @prisma/client @prisma/adapter-pg pg tsx bcryptjs dotenv \
 && npm cache clean --force

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
