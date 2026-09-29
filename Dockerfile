FROM node:24.14.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
COPY docs/contracts/ /app/docs/contracts/
RUN DATABASE_URL=mysql://schema:unused@127.0.0.1:1/schema_only npx prisma generate && npm run build

FROM node:24.14.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY --from=build /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/backend/scripts/start-cloudrun.mjs ./scripts/start-cloudrun.mjs
COPY --from=build /app/docs/contracts /app/docs/contracts
RUN mkdir -p /data/assets && chown node:node /data/assets
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 FILE_STORAGE_ROOT=/data/assets
ENV NODE_EXTRA_CA_CERTS=/app/cert/certificate.crt
USER node
EXPOSE 3000
CMD ["node", "scripts/start-cloudrun.mjs"]
