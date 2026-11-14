#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.data"
VERSION="${NEAR_SANDBOX_VERSION:-2.14.0}"
RPC_ADDR="${SANDBOX_RPC_ADDR:-127.0.0.1:3030}"
NET_ADDR="${SANDBOX_NET_ADDR:-127.0.0.1:24567}"
HOME_DIR="${SANDBOX_HOME:-$DATA_DIR/sandbox}"
LOG_FILE="$DATA_DIR/sandbox.log"
PID_FILE="$DATA_DIR/sandbox.pid"
KEYS_DIR="$DATA_DIR/keys/sandbox"
RPC_URL="http://$RPC_ADDR"

log() { printf '[sandbox] %s\n' "$*"; }
die() { printf '[sandbox] error: %s\n' "$*" >&2; exit 1; }

platform() {
  local os arch
  os="$(uname -s)"; arch="$(uname -m)"
  case "$os-$arch" in
    Darwin-arm64) echo "Darwin-arm64" ;;
    Linux-x86_64 | Linux-amd64) echo "Linux-x86_64" ;;
    Linux-aarch64 | Linux-arm64) echo "Linux-aarch64" ;;
    *) die "unsupported platform $os-$arch (near-sandbox ships macOS arm64 and Linux x86_64/aarch64)" ;;
  esac
}

BIN_DIR="$DATA_DIR/bin/near-sandbox-$VERSION-$(platform)"
BIN="$BIN_DIR/near-sandbox"

ensure_binary() {
  if [ -x "$BIN" ]; then return 0; fi
  command -v curl >/dev/null || die "curl is required to download near-sandbox"
  local url="https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/$(platform)/$VERSION/near-sandbox.tar.gz"
  local tmp
  tmp="$(mktemp -d)"
  log "downloading near-sandbox $VERSION for $(platform)"
  curl -fSL --retry 3 --max-time 600 "$url" -o "$tmp/near-sandbox.tar.gz" || die "download failed: $url"
  mkdir -p "$BIN_DIR"
  tar -xzf "$tmp/near-sandbox.tar.gz" -C "$tmp"
  local found
  found="$(find "$tmp" -type f -name near-sandbox | head -n 1)"
  [ -n "$found" ] || die "near-sandbox binary not found in archive"
  mv "$found" "$BIN"
  chmod +x "$BIN"
  rm -rf "$tmp"
  log "installed $("$BIN" --version | head -n 1)"
}

patch_config() {
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const c = JSON.parse(fs.readFileSync(p, "utf8"));
    delete c.archive;
    c.gc_num_epochs_to_keep = Math.max(c.gc_num_epochs_to_keep ?? 5, 1000);
    c.rpc = c.rpc ?? {};
    c.rpc.limits_config = { ...(c.rpc.limits_config ?? {}), json_payload_max_size: 1024 * 1024 * 1024 };
    c.store = c.store ?? {};
    c.store.max_open_files = 3000;
    c.log_summary_period = { secs: 60, nanos: 0 };
    fs.writeFileSync(p, JSON.stringify(c, null, 2));
  ' "$HOME_DIR/config.json"
}

ensure_home() {
  if [ -f "$HOME_DIR/config.json" ] && [ -f "$HOME_DIR/genesis.json" ]; then return 0; fi
  mkdir -p "$HOME_DIR"
  log "initializing chain home at $HOME_DIR"
  "$BIN" --home "$HOME_DIR" init >>"$LOG_FILE" 2>&1 || die "init failed (see $LOG_FILE)"
  patch_config
}

export_validator_key() {
  mkdir -p "$KEYS_DIR"
  chmod 700 "$DATA_DIR/keys" "$KEYS_DIR" 2>/dev/null || true
  node -e '
    const fs = require("fs");
    const [src, dir] = process.argv.slice(1);
    const k = JSON.parse(fs.readFileSync(src, "utf8"));
    const out = { account_id: k.account_id, public_key: k.public_key, private_key: k.secret_key ?? k.private_key };
    const dest = `${dir}/${k.account_id}.json`;
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", { mode: 0o600 });
  ' "$HOME_DIR/validator_key.json" "$KEYS_DIR"
}

pid_alive() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

rpc_up() { curl -sf --max-time 2 "$RPC_URL/status" >/dev/null 2>&1; }

wait_rpc() {
  local tries="${1:-120}"
  for _ in $(seq 1 "$tries"); do
    if rpc_up; then
      local h
      h="$(curl -sf --max-time 2 "$RPC_URL/status" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).sync_info.latest_block_height)}catch{console.log(0)}})')"
      if [ "${h:-0}" -gt 1 ]; then return 0; fi
    fi
    if ! pid_alive; then return 2; fi
    sleep 0.5
  done
  return 1
}

start() {
  mkdir -p "$DATA_DIR"
  if pid_alive && rpc_up; then
    log "already running (pid $(cat "$PID_FILE")) at $RPC_URL"
    export_validator_key
    return 0
  fi
  if rpc_up; then
    die "something else is serving $RPC_URL; stop it first"
  fi
  ensure_binary
  ensure_home
  export_validator_key
  log "starting node, rpc $RPC_URL, log $LOG_FILE"
  {
    echo "----- $(date -u +%Y-%m-%dT%H:%M:%SZ) start ($VERSION) -----"
  } >>"$LOG_FILE"
  nohup "$BIN" --home "$HOME_DIR" run --rpc-addr "$RPC_ADDR" --network-addr "$NET_ADDR" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  local rc=0
  wait_rpc 240 || rc=$?
  if [ "$rc" -eq 0 ]; then
    log "ready: $(height_line)"
  elif [ "$rc" -eq 2 ]; then
    tail -n 30 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    die "node exited during startup (see $LOG_FILE)"
  else
    die "RPC did not come up within 120 s (see $LOG_FILE)"
  fi
}

stop() {
  if ! pid_alive; then
    rm -f "$PID_FILE"
    log "not running"
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  log "stopping pid $pid"
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    log "did not exit after 30 s, sending SIGKILL"
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  log "stopped (state kept in $HOME_DIR)"
}

height_line() {
  curl -sf --max-time 2 "$RPC_URL/status" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      const j = JSON.parse(s);
      console.log(`height ${j.sync_info.latest_block_height}, chain ${j.chain_id}, protocol ${j.protocol_version}, node ${j.version.version}`);
    })'
}

status() {
  if pid_alive && rpc_up; then
    log "running (pid $(cat "$PID_FILE")) at $RPC_URL: $(height_line)"
  elif rpc_up; then
    log "RPC at $RPC_URL is up but not started by this script: $(height_line)"
  elif pid_alive; then
    log "process $(cat "$PID_FILE") alive but RPC not responding (starting up?)"
    exit 1
  else
    log "stopped"
    exit 1
  fi
}

reset() {
  stop
  log "wiping $HOME_DIR, $KEYS_DIR and $DATA_DIR/deployment.sandbox.json"
  rm -rf "$HOME_DIR" "$KEYS_DIR" "$DATA_DIR/deployment.sandbox.json" "$DATA_DIR/seed.sandbox.json"
  start
  log "fresh chain. Re-run: pnpm tsx scripts/deploy-local.ts && pnpm tsx scripts/deploy-funds.ts (the indexer re-indexes on its own)"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  reset) reset ;;
  status) status ;;
  logs) tail -n "${2:-100}" -f "$LOG_FILE" ;;
  bin) ensure_binary; echo "$BIN" ;;
  *) echo "usage: $0 {start|stop|restart|reset|status|logs|bin}" >&2; exit 2 ;;
esac
