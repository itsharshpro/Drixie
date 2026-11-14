# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=9.15.0

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
RUN npm install -g "pnpm@${PNPM_VERSION}" --no-fund --no-audit && npm cache clean --force
WORKDIR /app

FROM base AS manifests
COPY . /src
RUN mkdir -p /out \
 && cd /src \
 && cp pnpm-lock.yaml pnpm-workspace.yaml package.json /out/ \
 && find packages services apps e2e -name package.json -not -path "*/node_modules/*" -exec cp --parents {} /out/ \;

FROM base AS deps
COPY --from=manifests /out ./
RUN --mount=type=cache,id=listed-pnpm-store,target=/pnpm/store \
    CI=true pnpm install --frozen-lockfile --store-dir /pnpm/store \
      --filter "@listed/api..." \
      --filter "@listed/indexer..." \
      --filter "@listed/relayer..." \
      --filter "@listed/agents..." \
      --filter "@listed/mcp..." \
      --filter "@listed/world..." \
      --filter "@listed/desk..." \
      --filter "@listed/nav..."

FROM deps AS app
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    LISTED_REPO_ROOT=/app
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node

FROM app AS api
WORKDIR /app/services/api
ENV API_HOST=0.0.0.0 API_PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS indexer
WORKDIR /app/services/indexer
ENV INDEXER_PORT=4200
EXPOSE 4200
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.INDEXER_PORT||4200)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS relayer
WORKDIR /app/services/relayer
ENV RELAYER_HOST=0.0.0.0 RELAYER_PORT=4110 RELAYER_TRUST_PROXY=1
EXPOSE 4110
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.RELAYER_PORT||4110)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS agents
WORKDIR /app/services/agents
ENV AGENTS_PORT=4300
EXPOSE 4300
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.AGENTS_PORT||4300)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS mcp
WORKDIR /app/services/mcp
ENV MCP_HOST=0.0.0.0 MCP_PORT=4400
EXPOSE 4400
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.MCP_PORT||4400)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS world
WORKDIR /app/services/world
ENV WORLD_HOST=0.0.0.0 WORLD_PORT=4500
EXPOSE 4500
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.WORLD_PORT||4500)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS desk
WORKDIR /app/services/desk
ENV DESK_HOST=0.0.0.0 DESK_PORT=4600 DESK_LOG_FILE=-
EXPOSE 4600
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.DESK_PORT||4600)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS nav
WORKDIR /app/services/nav
ENV NAV_HOST=0.0.0.0 NAV_PORT=4700
EXPOSE 4700
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.NAV_PORT||4700)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM app AS migrate
WORKDIR /app/packages/db
CMD ["node", "--import", "tsx", "src/migrate.ts"]

FROM app AS tools
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node contracts/funds/res ./contracts/funds/res
WORKDIR /app
ENTRYPOINT ["/app/packages/chain/node_modules/.bin/tsx"]
CMD ["scripts/deploy-funds.ts", "--plan"]
