# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# SinceWhen — single image serving both the API and the built frontend.
#
# better-sqlite3 is a native module, so the build and runtime stages share the
# same base image: the binding compiled in one must load in the other.
# ---------------------------------------------------------------------------

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# --- Dependencies ----------------------------------------------------------
# Manifests are copied on their own so this layer is cached until they change.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Build -----------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm build

# --- Production dependencies ----------------------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @sincewhen/server... --ignore-scripts=false

# --- Runtime ---------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_CLIENT=sqlite \
    SQLITE_PATH=/data/sincewhen.db \
    WEB_DIST_PATH=/app/packages/web/dist

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY package.json pnpm-workspace.yaml ./

# SQLite data lives on a volume so counters survive container replacement.
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/packages/server
CMD ["node", "dist/index.js"]
