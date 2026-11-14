#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/res"
mkdir -p "$OUT"
export CARGO_TARGET_DIR="${LISTED_WASM_TARGET_DIR:-$HERE/../target/wasm}"
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

if cargo near --version >/dev/null 2>&1; then
  (cd "$HERE" && cargo near build non-reproducible-wasm --no-abi --out-dir "$OUT")
else
  echo "cargo-near not found; using cargo build --release --target wasm32-unknown-unknown" >&2
  (cd "$HERE/.." && RUSTFLAGS="--cfg near -C link-arg=-s" cargo build --release --target wasm32-unknown-unknown -p drixie-funds)
  cp "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/drixie_funds.wasm" "$OUT/drixie_funds.wasm"
  if command -v wasm-opt >/dev/null 2>&1; then
    wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int "$OUT/drixie_funds.wasm" -o "$OUT/drixie_funds.wasm"
  fi
fi

test -s "$OUT/drixie_funds.wasm" || { echo "missing $OUT/drixie_funds.wasm" >&2; exit 1; }
printf '%-18s %8d bytes  sha256 %s\n' "drixie_funds.wasm" "$(wc -c < "$OUT/drixie_funds.wasm")" \
  "$(shasum -a 256 "$OUT/drixie_funds.wasm" | cut -d' ' -f1)"
