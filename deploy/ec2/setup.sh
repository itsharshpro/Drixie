#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-}"
REF="${REF:-main}"
APP_DIR="${APP_DIR:-/opt/listed}"
APP_USER="${APP_USER:-ubuntu}"
CONTAINER_UID=1000 # user node in the service images

log() { printf '\033[1m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[setup] warning: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m[setup] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root: sudo REPO_URL=... bash setup.sh"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "this script targets Ubuntu 24.04 (found ${PRETTY_NAME:-unknown})"
[ "${VERSION_ID:-}" = "24.04" ] || warn "tested on Ubuntu 24.04, found ${VERSION_ID:-unknown}"
id "$APP_USER" >/dev/null 2>&1 || die "user $APP_USER does not exist (set APP_USER)"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "installing Docker Engine and the compose plugin"
  apt-get update -y
  apt-get install -y ca-certificates curl git ufw
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "docker present: $(docker --version)"
  if ! command -v git >/dev/null 2>&1 || ! command -v ufw >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y git ufw
  fi
fi
usermod -aG docker "$APP_USER" || true

mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 7000000 ] && ! swapon --show | grep -q '/swapfile'; then
  log "adding a 2 GB swap file (RAM is $((mem_kb / 1024)) MB)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
log "ufw: $(ufw status | head -1)"

if [ -d "$APP_DIR/.git" ]; then
  log "updating $APP_DIR to $REF"
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --prune origin
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$REF"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin "$REF" || log "not a branch (tag or commit): kept $REF"
else
  [ -n "$REPO_URL" ] || die "set REPO_URL for the first run, e.g. REPO_URL=https://github.com/<you>/listed.git"
  log "cloning $REPO_URL into $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$REF" "$REPO_URL" "$APP_DIR" || git clone "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi
cd "$APP_DIR"
COMPOSE=(bash ./deploy/compose.sh)

if [ ! -f .env ]; then
  cp deploy/env.prod.example .env
  chown "$APP_USER:$APP_USER" .env
  chmod 600 .env
  log "created $APP_DIR/.env from deploy/env.prod.example"
  log "fill it in (domains, WEB_URL, WEBAUTHN_RP_ID, secrets, LISTED_ROOT, AI_API_KEY), then re-run this script"
  exit 0
fi
chmod 600 .env
[ -f .env.deployer ] && chmod 600 .env.deployer

envval() {
  local v
  v=$(grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)
  v=$(printf '%s' "$v" | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//')
  v=${v#\"}; v=${v%\"}; v=${v#\'}; v=${v%\'}
  printf '%s' "$v"
}

grep -q $'\r' .env && die ".env has Windows line endings: run  sed -i 's/\\r\$//' $APP_DIR/.env"
bad=$(grep -nE '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*#' .env | cut -d= -f1 | tr '\n' ' ' || true)
[ -z "$bad" ] || die "these .env lines (line:KEY) have a comment where the value should be, and compose would use the comment as the value; move each comment to its own line: ${bad}"

for name in API_DOMAIN RELAYER_DOMAIN MCP_DOMAIN ACME_EMAIL WEB_URL WEBAUTHN_RP_ID SERVICE_TOKEN SESSION_SECRET LISTED_ROOT; do
  [ -n "$(envval "$name")" ] || die "$name is empty in $APP_DIR/.env"
done
[ -n "$(envval DATABASE_URL)" ] || [ -n "$(envval POSTGRES_PASSWORD)" ] || die "POSTGRES_PASSWORD is empty in $APP_DIR/.env (openssl rand -hex 24)"
for name in DATABASE_URL REDIS_URL; do
  case "$(envval "$name")" in
    *localhost* | *127.0.0.1* | *::1*) die "$name points at localhost, which inside a container is the container itself. Leave it empty for the bundled service, or use the managed host." ;;
  esac
done
secret=$(envval SESSION_SECRET)
[ "${#secret}" -ge 16 ] || die "SESSION_SECRET must be at least 16 characters (openssl rand -hex 32)"
unset secret
if [ -n "$(envval NEAR_PRIVATE_KEY)" ]; then
  die "NEAR_PRIVATE_KEY is set in .env, so every container would hold the root account's full-access key. Move NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY to .env.deployer (read only by the tools container; see deploy/env.deployer.example), or delete them."
fi
if [ -n "$(envval MCP_BUYER_ACCOUNT)" ] && [ -z "$(envval MCP_AUTH_TOKEN)" ]; then
  die "MCP_BUYER_ACCOUNT is set but MCP_AUTH_TOKEN is empty: https://$(envval MCP_DOMAIN)/mcp is public and its order tool spends the buyer key. Set MCP_AUTH_TOKEN (openssl rand -hex 32), or clear MCP_BUYER_ACCOUNT to serve read-only tools."
fi
[ -n "$(envval AI_API_KEY)" ] || warn "AI_API_KEY is empty: the fund managers start but hold (and say so) until it is set. After adding it: ./deploy/compose.sh up -d agents"
network=$(envval NEAR_NETWORK)
network=${network:-testnet}
[ "$network" != "mainnet" ] || die "NEAR_NETWORK=mainnet is not supported from this repo"
root=$(envval LISTED_ROOT)

mkdir -p ".data/keys/${network}/house" .data/agents .data/desk
chown -R "${CONTAINER_UID}:${CONTAINER_UID}" .data
chmod 700 .data/keys ".data/keys/${network}"
find .data/keys -type f -exec chmod 600 {} \;
if [ ! -f ".data/deployment.funds.${network}.json" ]; then
  warn ".data/deployment.funds.${network}.json is missing."
  log "  Deploy first (deploy/TESTNET.md), then from that machine:"
  log "    scp .data/deployment.funds.${network}.json ${APP_USER}@<this host>:${APP_DIR}/.data/"
  log "    scp -r .data/keys/${network} ${APP_USER}@<this host>:${APP_DIR}/.data/keys/"
  log "  or deploy from here: deploy/env.deployer.example, then"
  log "    ./deploy/compose.sh --profile tools run --rm tools scripts/deploy-funds.ts"
  log "  and re-run this script."
  exit 0
fi
grep -qE "\"contract\"[[:space:]]*:[[:space:]]*\"${root//./\\.}\"" ".data/deployment.funds.${network}.json" \
  || warn "LISTED_ROOT=${root} does not match \"contract\" in .data/deployment.funds.${network}.json"
[ -f ".data/keys/${network}/relayer.${root}.json" ] || [ -n "$(envval RELAYER_PRIVATE_KEY)" ] \
  || warn "no relayer key (.data/keys/${network}/relayer.${root}.json): sign-up and gasless actions will fail"
ls ".data/keys/${network}/"*".${root}.json" >/dev/null 2>&1 || warn ".data/keys/${network} has no keys for ${root}"
[ ! -f ".data/keys/${network}/${root}.json" ] || [ -f .env.deployer ] \
  || warn ".data/keys/${network}/${root}.json is the root account's full-access key and every container that mounts the keys can read it: delete it from this server (keep your offline copy)"

ls ".data/keys/${network}/house/house-"*".${root}.json" >/dev/null 2>&1 \
  || warn "no house investor keys (.data/keys/${network}/house/): run scripts/deploy-funds.ts and copy the folder, or set DESK_ENABLED=0"

"${COMPOSE[@]}" config -q || die "docker compose rejected the configuration (see above)"
log "building images (first build takes a few minutes)"
"${COMPOSE[@]}" build
log "starting the stack"
"${COMPOSE[@]}" up -d --remove-orphans
log "waiting for the services to report healthy (up to 3 minutes)"
for _ in $(seq 1 90); do
  unhealthy=$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | awk '$2 != "healthy" && $2 != "" {print $1}' | tr '\n' ' ')
  [ -z "$unhealthy" ] && break
  sleep 2
done
"${COMPOSE[@]}" ps
[ -z "$unhealthy" ] || warn "not healthy yet: ${unhealthy}(check: ./deploy/compose.sh logs --tail=100 <service>)"
log "done. Check: curl -fsS https://$(envval API_DOMAIN)/v1/health"
log "logs:    cd ${APP_DIR} && ./deploy/compose.sh logs -f --tail=100 api"
