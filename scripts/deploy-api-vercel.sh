#!/usr/bin/env bash
# Deploy the Rust agent API to the linked Vercel project "reppit-api".
#
#   scripts/deploy-api-vercel.sh            # production
#   scripts/deploy-api-vercel.sh --preview  # preview
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL_CLI_VERSION=65.8.0

DEPLOY_CONTEXT=production
case "${1:-}" in
  "") ;;
  --preview) DEPLOY_CONTEXT=preview ;;
  *) echo "usage: $0 [--preview]"; exit 2 ;;
esac

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if (( NODE_MAJOR < 22 )); then
  echo "Node 22 or newer is required. Run: nvm use 22"
  exit 1
fi
vc() { npx --yes "vercel@$VERCEL_CLI_VERSION" "$@"; }

if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
command -v cargo >/dev/null 2>&1 || { echo "Rust is missing: install it from https://rustup.rs"; exit 1; }
vc whoami --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.loggedIn!==true&&!j.username)process.exit(1)})' \
  || { echo "not logged in: run npx vercel@$VERCEL_CLI_VERSION login"; exit 1; }

cargo fmt --manifest-path apps/api/Cargo.toml --check
cargo clippy --manifest-path apps/api/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path apps/api/Cargo.toml
cargo build --release --locked --manifest-path apps/api/Cargo.toml
cargo build --release --locked --manifest-path packages/cli-rs/Cargo.toml

LEGACY_API_URL="${LEGACY_API_URL:-https://reppit.dev}"
(
  cd apps/api
  [ -f .vercel/project.json ] || { echo "missing the reviewed API project link"; exit 1; }
  INSPECT=$(vc project inspect --json --yes)
  PROJECT_NAME=$(printf '%s' "$INSPECT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.name??j.project?.name??"")})')
  [ "$PROJECT_NAME" = reppit-api ] || { echo "linked Vercel project is '$PROJECT_NAME', expected 'reppit-api'"; exit 1; }
  vc env add LEGACY_API_URL --environment "$DEPLOY_CONTEXT" --value="$LEGACY_API_URL" --force --yes --no-sensitive >/dev/null

  if [ "$DEPLOY_CONTEXT" = preview ]; then
    URL=$(vc deploy --yes)
  else
    URL=$(vc deploy --prod --skip-domain --yes)
  fi
  vc inspect "$URL" --wait --timeout 10m >/dev/null
  HEALTH=$(vc curl /api/v1/health --deployment "$URL")
  printf '%s' "$HEALTH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.ok!==true||j.backend!=="rust"||j.version!=="v1")process.exit(1)})'
  REPPIT_API_URL="$URL" ../../packages/cli-rs/target/release/reppit get skills "video editing to make cinematic videos" --json --limit 1 \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!Array.isArray(j.results)||j.results.length<1)process.exit(1)})'
  if [ "$DEPLOY_CONTEXT" = production ]; then
    vc promote "$URL" --yes
    echo "production promoted: $URL"
  else
    echo "preview ready: $URL"
  fi
)
