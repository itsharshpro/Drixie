#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"
facts=".data/ec2.json"
fact() { [ -f "$facts" ] && node -e "const f=require('./$facts');process.stdout.write(String(f['$1']??''))" || true; }

HOST="${EC2_HOST:-$(fact eip)}"
USER_="${EC2_USER:-$(fact sshUser)}"
KEY="${EC2_KEY:-$(fact keyPath)}"
KEY="${KEY/#\~/$HOME}"
APP_DIR="${APP_DIR:-$(fact appDir)}"
APP_DIR="${APP_DIR:-/opt/drixie}"
NETWORK="${NEAR_NETWORK:-testnet}"
SERVER_RPC_URL="${SERVER_RPC_URL:-http://rpc-signers:3031}"
[ -n "$HOST" ] && [ -n "$USER_" ] && [ -f "$KEY" ] || { echo "deploy.sh: set EC2_HOST / EC2_USER / EC2_KEY (or write .data/ec2.json)" >&2; exit 1; }

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 "$USER_@$HOST")
RSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"
log() { printf '\033[1m[deploy]\033[0m %s\n' "$*"; }
remote() { "${SSH[@]}" "cd '$APP_DIR' && $*"; }

sync_code() {
  log "rsync repo -> $USER_@$HOST:$APP_DIR"
  rsync -az --delete -e "$RSH" \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.next/' --exclude 'target/' --exclude 'test-results/' \
    --exclude '.turbo/' --exclude 'coverage/' --exclude '*.log' --exclude '.DS_Store' --exclude 'tsconfig.tsbuildinfo' \
    --exclude '/.data/' --exclude '.env' --exclude '.env.*' --exclude '/https:/' \
    --exclude '/submission/' --exclude '/reviews/' --exclude '/version.md' \
    ./ "$USER_@$HOST:$APP_DIR/"
}

copy_keys() {
  local dep=".data/deployment.funds.$NETWORK.json"
  [ -f "$dep" ] || { echo "deploy.sh: $dep is missing" >&2; exit 1; }
  local root
  root="$(node -e "process.stdout.write(require('./$dep').contract)")"
  log "copy $dep + service keys for $root (nav, managers, house, dna, relayer, players)"
  local list
  list="$(mktemp)"
  {
    echo "deployment.funds.$NETWORK.json"
    for d in nav managers house dna; do [ -d ".data/keys/$NETWORK/$d" ] && find ".data/keys/$NETWORK/$d" -type f | sed 's#^\.data/##'; done
    for a in "relayer.$root" "players.$root"; do [ -f ".data/keys/$NETWORK/$a.json" ] && echo "keys/$NETWORK/$a.json"; done
  } >"$list"
  "${SSH[@]}" "umask 077 && mkdir -p '$APP_DIR/.data/keys/$NETWORK' '$APP_DIR/.data/agents' '$APP_DIR/.data/desk' '$APP_DIR/.data/mcp'"
  rsync -a --files-from="$list" -e "$RSH" .data/ "$USER_@$HOST:$APP_DIR/.data/"
  rm -f "$list"
  "${SSH[@]}" "chmod 700 '$APP_DIR/.data/keys' && find '$APP_DIR/.data/keys' -type d -exec chmod 700 {} + && find '$APP_DIR/.data/keys' -type f -exec chmod 600 {} + && chmod 600 '$APP_DIR/.data/deployment.funds.$NETWORK.json'"
  "${SSH[@]}" "cd '$APP_DIR' && node -e '
    const fs = require(\"fs\"), p = \".data/deployment.funds.$NETWORK.json\", d = JSON.parse(fs.readFileSync(p, \"utf8\"));
    if (d.rpcUrl !== \"$SERVER_RPC_URL\") { d.publicRpcUrl = d.publicRpcUrl || d.rpcUrl; d.rpcUrl = \"$SERVER_RPC_URL\";
      fs.writeFileSync(p + \".tmp\", JSON.stringify(d, null, 2) + \"\\n\", { mode: 0o600 }); fs.renameSync(p + \".tmp\", p); }'"
}

install_caddy() {
  log "install deploy/Caddyfile -> /etc/caddy/Caddyfile"
  remote "test -f .env || { echo 'server .env missing: create it from deploy/env.prod.example' >&2; exit 1; }
    PUBLIC_HOST=\$(grep -E '^PUBLIC_HOST=' .env | tail -1 | cut -d= -f2-)
    BACKUP_HOST=\$(grep -E '^BACKUP_HOST=' .env | tail -1 | cut -d= -f2-)
    : \"\${PUBLIC_HOST:?PUBLIC_HOST missing in .env}\" \"\${BACKUP_HOST:?BACKUP_HOST missing in .env}\"
    printf 'PUBLIC_HOST=%s\nBACKUP_HOST=%s\n' \"\$PUBLIC_HOST\" \"\$BACKUP_HOST\" | sudo tee /etc/caddy/drixie.env >/dev/null
    sudo mkdir -p /etc/systemd/system/caddy.service.d
    printf '[Service]\nEnvironmentFile=/etc/caddy/drixie.env\n' | sudo tee /etc/systemd/system/caddy.service.d/drixie.conf >/dev/null
    sudo install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
    sudo systemctl daemon-reload
    sudo env PUBLIC_HOST=\"\$PUBLIC_HOST\" BACKUP_HOST=\"\$BACKUP_HOST\" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    sudo systemctl enable caddy >/dev/null 2>&1 || true
    if systemctl is-active --quiet caddy; then sudo systemctl reload caddy || sudo systemctl restart caddy; else sudo systemctl start caddy; fi"
}

up() {
  log "build images on the server (services, then web) and start the stack"
  remote "test -f .env && chmod 600 .env
    ./deploy/compose.sh build migrate relayer api indexer world nav agents desk mcp
    ./deploy/compose.sh up -d --remove-orphans postgres redis migrate relayer api indexer world nav agents desk mcp
    ./deploy/compose.sh build web
    ./deploy/compose.sh up -d web
    ./deploy/compose.sh ps"
}

case "${1:-all}" in
  sync) sync_code ;;
  keys) copy_keys ;;
  caddy) install_caddy ;;
  up) up ;;
  ps) remote "./deploy/compose.sh ps" ;;
  all)
    sync_code
    "${SSH[@]}" "test -f '$APP_DIR/.data/deployment.funds.$NETWORK.json'" || copy_keys
    install_caddy
    up
    ;;
  *) echo "usage: deploy.sh [all|sync|keys|caddy|up|ps]" >&2; exit 2 ;;
esac
