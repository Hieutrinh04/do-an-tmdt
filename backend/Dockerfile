FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --no-audit --no-fund
COPY backend backend
RUN npm run db:generate -w backend && npm run build -w backend
RUN npm prune --omit=dev --workspace backend --no-audit --no-fund && node -e "require.resolve('prisma/build/index.js')"
WORKDIR /app/backend
ENV LONG_FISH_COMPILED=1
CMD ["node", "scripts/start.cjs"]
