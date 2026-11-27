# Kawalys BFF image (BACK-64). Build context: the repository root.
FROM node:24.22.3-alpine AS build
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:24.22.3-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /build/dist ./dist
# db-admin resolves migrations at dist/../migrations.
COPY server/migrations ./migrations
USER node
EXPOSE 8787
CMD ["node", "dist/main.js"]
