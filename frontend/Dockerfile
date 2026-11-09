FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend --no-audit --no-fund
COPY frontend frontend
COPY backend/prisma/aquatic-catalog.ts backend/prisma/aquatic-catalog.ts
COPY backend/prisma/catalog-images.ts backend/prisma/catalog-images.ts
COPY backend/prisma/photo-manifest.ts backend/prisma/photo-manifest.ts
COPY backend/src/image-path.ts backend/src/image-path.ts
RUN npm run build -w frontend

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
