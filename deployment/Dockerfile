FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1 AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY deployment/start-backend.sh ./deployment/start-backend.sh
RUN chmod +x ./deployment/start-backend.sh

EXPOSE 8000

USER bun

CMD ["./deployment/start-backend.sh"]
