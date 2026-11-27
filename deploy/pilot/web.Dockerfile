# Kawalys web image (BACK-64): the live-mode app build served by Caddy. Build context: the repository root.
FROM node:24.22.3-alpine AS build
WORKDIR /build
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts
COPY app/tsconfig.json app/vite.config.ts app/index.html ./
COPY app/src ./src
ENV VITE_KAWALYS_LIVE=1
# Typecheck runs in the app suite; the image only bundles (tests import e2e/ files that are not in this context).
RUN npx vite build

FROM caddy:2.11.9-alpine
COPY --from=build /build/dist /srv
COPY deploy/pilot/Caddyfile /etc/caddy/Caddyfile
