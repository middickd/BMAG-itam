# syntax=docker/dockerfile:1
#
# Multi-stage build for the BMAG-itam monorepo (client + server workspaces).
# One runtime image: the Node server serves the API AND the built React SPA, and
# applies pending schema migrations at boot (see server/src/index.js).
#
# Targets linux/amd64 (Debian 12 / glibc). better-sqlite3 publishes prebuilt
# binaries for this platform; the build toolchain is present as a fallback so
# `npm ci` can compile from source if a prebuild isn't available for the ABI.

# ---- Stage 1: install all deps, compile native modules, build the SPA ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first so `npm ci` is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

# Build the client (Vite). The server workspace has no build step.
COPY . .
ARG VITE_AUTH_MODE=sso
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
RUN npm run build

# Drop devDependencies (vite, typescript, nodemon, concurrently) but keep the
# compiled better-sqlite3 native binary in the production tree.
RUN npm prune --omit=dev

# ---- Stage 2: minimal runtime — server + built client + prod node_modules ----
FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/itam.db

# Persistent data dir for the SQLite DB (+ WAL/SHM sidecars). Owned by the
# unprivileged `node` user so a freshly created named volume inherits writable
# ownership. (For a bind mount, chown the host directory to uid 1000 — see DOCKER.md.)
RUN mkdir -p /data && chown -R node:node /data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

USER node
EXPOSE 4000
VOLUME ["/data"]

# Same endpoint the deploy smoke test uses; it sits before the auth middleware.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
