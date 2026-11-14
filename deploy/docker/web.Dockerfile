# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=9.15.0

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
RUN npm install -g "pnpm@${PNPM_VERSION}" --no-fund --no-audit && npm cache clean --force
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS manifests
COPY . /src
RUN mkdir -p /out \
 && cd /src \
 && cp pnpm-lock.yaml pnpm-workspace.yaml package.json /out/ \
 && find packages services apps e2e -name package.json -not -path "*/node_modules/*" -exec cp --parents {} /out/ \;

FROM base AS deps
COPY --from=manifests /out ./
RUN --mount=type=cache,id=drixie-pnpm-store,target=/pnpm/store \
    CI=true pnpm install --frozen-lockfile --store-dir /pnpm/store \
      --filter "web..." \
      --filter "@listed/reputation..."

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MCP_URL
ARG NEXT_PUBLIC_FUNDS_CONTRACT
ARG NEXT_PUBLIC_PROTECT=1
ARG NEXT_PUBLIC_GITHUB_URL=
ARG NEXT_PUBLIC_X_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_MCP_URL=${NEXT_PUBLIC_MCP_URL} \
    NEXT_PUBLIC_FUNDS_CONTRACT=${NEXT_PUBLIC_FUNDS_CONTRACT} \
    NEXT_PUBLIC_PROTECT=${NEXT_PUBLIC_PROTECT} \
    NEXT_PUBLIC_GITHUB_URL=${NEXT_PUBLIC_GITHUB_URL} \
    NEXT_PUBLIC_X_URL=${NEXT_PUBLIC_X_URL}
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN NODE_OPTIONS=--max-old-space-size=3072 pnpm exec next build \
 && rm -rf .next/cache/webpack \
 && chown -R node:node /app/apps/web/.next

FROM build AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/',{headers:{'user-agent':'healthcheck-browser Mozilla/5.0'}}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
