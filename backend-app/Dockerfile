# syntax=docker/dockerfile:1

# ---- deps: full dependencies, kept in a separate stage for layer caching ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Scripts are skipped here: Prisma's postinstall would run before the schema exists.
RUN npm ci --ignore-scripts

# ---- build: generate the Prisma client, compile Nest ----
FROM node:22-alpine AS build
WORKDIR /app
# Prisma CLI evaluates prisma.config.ts, which reads DATABASE_URL. The value is
# only needed for validation here; migrations run against the real database.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime: production dependencies + compiled output ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# Local storage driver writes uploaded documents here (mounted as a volume).
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["node", "dist/main.js"]
