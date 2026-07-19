# syntax=docker/dockerfile:1

# --- Install dependencies (cached on lockfile) ---
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- Runtime image ---
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 8000
# Apply pending Drizzle migrations (idempotent) then boot the Hono server.
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
