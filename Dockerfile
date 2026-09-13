# Assure Safety Field: the API server plus the built web app, as one container.
#
# Runs anywhere a container runs (DigitalOcean App Platform is the target).
# The image carries the monorepo pieces the server reads at runtime
# (migrations, generated template seed, renderers, brand assets) and the
# Flutter web build already committed under apps/server/public.
#
#   docker build -t assure-field .
#   docker run -p 8080:8080 -e DATABASE_URL=... -e AUTH_REQUIRED=1 assure-field
#
# DATABASE_URL is required: the image carries no in-memory database (a test dependency).

FROM node:22-alpine AS deps
WORKDIR /app/apps/server
COPY apps/server/package.json apps/server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Runtime assets the server resolves through assetPath(): repo paths first.
COPY packages/db/migrations packages/db/migrations
COPY packages/checksheets/generated packages/checksheets/generated
COPY packages/checksheets/lib packages/checksheets/lib
COPY packages/checksheets/data/sheet-sets.json packages/checksheets/data/sheet-sets.json
COPY packages/checksheets/data/authorisation.json packages/checksheets/data/authorisation.json
COPY packages/checksheets/brand packages/checksheets/brand

# The server and the web app it serves.
COPY apps/server apps/server
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules

# App Platform routes HTTP to 8080 by default; PORT overrides it.
ENV PORT=8080
EXPOSE 8080

# Run as the unprivileged user the base image provides.
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "apps/server/src/index.mjs"]
