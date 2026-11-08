# syntax=docker/dockerfile:1

# ---- build: Angular production build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Scripts must run: esbuild / tailwind oxide ship native binaries via postinstall.
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: static files + reverse proxy to the API ----
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend-app/browser /usr/share/nginx/html
EXPOSE 80
