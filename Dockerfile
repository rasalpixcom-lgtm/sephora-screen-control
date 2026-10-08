FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/db/postgres-migrations ./db/postgres-migrations
COPY --from=builder --chown=node:node /app/scripts/migrate-postgres.mjs ./scripts/migrate-postgres.mjs
USER node
EXPOSE 3000
CMD ["node", "server.js"]
