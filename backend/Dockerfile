# ---- base -------------------------------------------------------------------
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./

# ---- dev: código montado como volume, recarga automática ---------------------
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run dev"]

# ---- build: compila TypeScript ----------------------------------------------
FROM base AS build
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod: só dependências de execução + dist + migrations ------------------
FROM node:24-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# Aplica as migrations pendentes antes de subir a API.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
