# Kawalys web image (BACK-64): the live-mode app build served by Caddy. Build context: the repository root.
FROM node:24.22.3-alpine AS build
WORKDIR /build
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts
COPY app/tsconfig.json app/vite.config.ts app/index.html ./
COPY app/src ./src
# The Descope project id for the /sign-in page (D3(a)). A public identifier, not a secret; images.yml passes it. Deliberately no
# default: a build without it still works and the sign-in page then shows "not configured". Only the build stage sees it.
ARG VITE_KAWALYS_DESCOPE_PROJECT_ID
ENV VITE_KAWALYS_LIVE=1 VITE_KAWALYS_DESCOPE_PROJECT_ID=$VITE_KAWALYS_DESCOPE_PROJECT_ID
# Typecheck runs in the app suite; the image only bundles (tests import e2e/ files that are not in this context).
RUN ./node_modules/.bin/vite build

FROM caddy:2.11.9-alpine
COPY --from=build /build/dist /srv
COPY deploy/pilot/Caddyfile /etc/caddy/Caddyfile
# Run as an unprivileged user. Compose lowers net.ipv4.ip_unprivileged_port_start to 0 for this container only,
# so Caddy binds 80/443 with no capability at all. /data and /config are owned by the user so the named volumes
# Compose creates from them start out writable.
RUN addgroup -S -g 10001 kawalys && adduser -S -D -H -u 10001 -G kawalys kawalys \
 && mkdir -p /data /config && chown -R 10001:10001 /data /config
USER 10001:10001
