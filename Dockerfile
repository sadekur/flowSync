# One image for both apps; docker-compose.yml runs it twice (web, api) with
# different commands. Self-hosting / local production only — Vercel builds the
# app itself from vercel.json and ignores this file.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* are inlined at build time. Left unset, the browser talks to
# its own origin (/api, /socket.io), which Nginx routes to the api service.
ENV NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_SOCKET_URL="" NEXT_TELEMETRY_DISABLED=1
RUN npm run build:frontend && npm run build:backend && npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/backend/dist ./backend/dist
USER node
# Overridden per service in docker-compose.yml.
CMD ["node", "backend/dist/server.js"]
