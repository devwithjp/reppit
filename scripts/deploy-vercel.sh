#!/usr/bin/env bash
# Deploy apps/web to Vercel as project "reppit". Run `vercel login` once first (as jpds111111).
# Reads Supabase settings from ~/.local/share/reppit-setup/supabase.env; secrets never touch the repo.
#
#   scripts/deploy-vercel.sh            # production deploy
#   scripts/deploy-vercel.sh --preview  # preview deploy
set -euo pipefail
cd "$(dirname "$0")/.."
ENVF="$HOME/.local/share/reppit-setup/supabase.env"
[ -f "$ENVF" ] || { echo "missing $ENVF"; exit 1; }
set -a; . "$ENVF"; set +a
vercel whoami >/dev/null 2>&1 || { echo "not logged in: run  vercel login"; exit 1; }

# Link once. The project builds from apps/web inside the pnpm workspace.
if [ ! -f .vercel/project.json ]; then
  vercel link --yes --project reppit
fi
# The app lives in apps/web; Vercel installs the whole pnpm workspace from the root.
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.local/share/com.vercel.cli/auth.json')))['token'])")
PROJ=$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['projectId'])")
TEAM=$(python3 -c "import json;print(json.load(open('.vercel/project.json')).get('orgId',''))")
curl -sf -X PATCH "https://api.vercel.com/v9/projects/$PROJ?teamId=$TEAM" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"rootDirectory":"apps/web","framework":"nextjs","nodeVersion":"22.x"}' >/dev/null
echo "project root: apps/web, Node 22"

put() { # name value: replace the production value
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  echo "env $1 set"
}
put NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
put SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY"
put DATABASE_URL "$DATABASE_URL"
put GITIT_AUTO_MIGRATE 0
put EMBEDDING_PROVIDER supabase
put EMBEDDING_FUNCTION_URL "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/embed"
put EMBEDDING_FUNCTION_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

if [ "${1:-}" = "--preview" ]; then vercel deploy; else vercel deploy --prod; fi
