#!/usr/bin/env bash
# Deploy apps/web to Vercel as project "reppit". Run `vercel login` once first (as jpds111111).
# Reads Supabase settings from ~/.local/share/reppit-setup/supabase.env; secrets never touch the repo.
#
#   scripts/deploy-vercel.sh            # production deploy
#   scripts/deploy-vercel.sh --preview  # preview deploy
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL_CLI_VERSION=65.8.0

case "${1:-}" in
  "") DEPLOY_CONTEXT=production ;;
  --preview) DEPLOY_CONTEXT=preview ;;
  *) echo "usage: $0 [--preview]"; exit 2 ;;
esac

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if (( NODE_MAJOR < 22 )); then
  echo "Node 22 or newer is required. Run: nvm use 22"
  exit 1
fi
vc() { npx --yes "vercel@$VERCEL_CLI_VERSION" "$@"; }

ENVF="$HOME/.local/share/reppit-setup/supabase.env"
[ -f "$ENVF" ] || { echo "missing $ENVF"; exit 1; }
set -a; . "$ENVF"; set +a
vc whoami --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.loggedIn!==true&&!j.username)process.exit(1)})' \
  || { echo "not logged in: run npx vercel@$VERCEL_CLI_VERSION login"; exit 1; }
export EMBEDDING_PROVIDER=supabase
export EMBEDDING_FUNCTION_URL="$NEXT_PUBLIC_SUPABASE_URL/functions/v1/embed"
: "${EMBEDDING_FUNCTION_KEY:?missing dedicated EMBEDDING_FUNCTION_KEY}"
export DATABASE_POOL_MAX="${DATABASE_POOL_MAX:-1}"
# Fail before changing any remote settings if the backend cannot serve the app.
( cd apps/web; pnpm exec tsx scripts/launch-preflight.ts )

# Link once. The project builds from apps/web inside the pnpm workspace.
if [ ! -f .vercel/project.json ]; then
  echo "missing the reviewed web project link; run: npx vercel@$VERCEL_CLI_VERSION link --project reppit"
  exit 1
fi
INSPECT=$(vc project inspect --json --yes)
PROJECT_NAME=$(printf '%s' "$INSPECT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.name??j.project?.name??"")})')
[ "$PROJECT_NAME" = reppit ] || { echo "linked Vercel project is '$PROJECT_NAME', expected 'reppit'"; exit 1; }
# The app lives in apps/web; Vercel installs the whole pnpm workspace from the root.
PROJ=$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['projectId'])")
TEAM=$(python3 -c "import json;print(json.load(open('.vercel/project.json')).get('orgId',''))")
vc api "/v9/projects/$PROJ?teamId=$TEAM" --method PATCH \
  --raw-field rootDirectory=apps/web --raw-field framework=nextjs --raw-field nodeVersion=22.x --silent
echo "project root: apps/web, Node 22"

put() { # name value [secret]: configure the environment being deployed
  local kind=(--no-sensitive)
  [ "${3:-}" = secret ] && kind=(--sensitive)
  vc env add "$1" --environment "$DEPLOY_CONTEXT" --value="$2" --force --yes "${kind[@]}" >/dev/null
  echo "env $1 set"
}
put NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
put NEXT_PUBLIC_SITE_URL "https://reppit.dev"
put SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY" secret
put DATABASE_URL "$DATABASE_URL" secret
put DATABASE_SSL_CA "$DATABASE_SSL_CA" secret
put DATABASE_POOL_MAX "$DATABASE_POOL_MAX"
put GITIT_AUTO_MIGRATE 0
put EMBEDDING_PROVIDER supabase
put EMBEDDING_FUNCTION_URL "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/embed"
put EMBEDDING_FUNCTION_KEY "$EMBEDDING_FUNCTION_KEY" secret

if [ "$DEPLOY_CONTEXT" = preview ]; then
  URL=$(vc deploy --yes)
  vc inspect "$URL" --wait --timeout 10m >/dev/null
  echo "preview ready: $URL"
  exit 0
fi

# Stage the production build without moving the domain, prove the database and
# search path on that exact build, then promote it without rebuilding.
URL=$(vc deploy --prod --skip-domain --yes)
vc inspect "$URL" --wait --timeout 10m >/dev/null
HEALTH=$(vc curl /api/health --deployment "$URL")
printf '%s' "$HEALTH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.ok!==true||!(j.items>0)||j.embedding!=="supabase")process.exit(1)})'
SEARCH=$(vc curl '/api/search?q=video%20editing%20to%20make%20cinematic%20videos&kind=skill&limit=1' --deployment "$URL")
printf '%s' "$SEARCH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!Array.isArray(j.results)||j.results.length<1)process.exit(1)})'
vc promote "$URL" --yes
echo "production promoted: $URL"
