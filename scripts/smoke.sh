#!/usr/bin/env bash
# End-to-end smoke test against a running dev server (dev login enabled, no GitHub OAuth).
# Usage: scripts/smoke.sh [base_url]
set -euo pipefail
BASE="${1:-http://localhost:3100}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
step() { printf '\n== %s\n' "$*"; }

step "health"; curl -sf "$BASE/api/health"; echo

step "dev sign-in as 'smoke'"
CSRF=$(curl -sf -c "$JAR" -b "$JAR" "$BASE/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
curl -s -o /dev/null -w "callback status %{http_code}\n" -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "login=smoke" --data-urlencode "redirect=false"
curl -sf -b "$JAR" "$BASE/api/auth/session" | head -c 300; echo

step "list hot items"
SLUG=$(curl -sf "$BASE/api/items?sort=hot&limit=1" | sed -E 's/.*"slug":"([^"]+)".*/\1/')
echo "top item: $SLUG"

step "upvote $SLUG"; curl -s -b "$JAR" -X POST "$BASE/api/items/by-slug/$SLUG/vote" -H 'content-type: application/json' -d '{"direction":"up"}'; echo
step "downvote without reason (must fail)"; curl -s -b "$JAR" -X POST "$BASE/api/items/by-slug/$SLUG/vote" -H 'content-type: application/json' -d '{"direction":"down"}'; echo
step "downvote with reason"; curl -s -b "$JAR" -X POST "$BASE/api/items/by-slug/$SLUG/vote" -H 'content-type: application/json' -d '{"direction":"down","reason":"unmaintained"}'; echo
step "comment"; curl -s -b "$JAR" -X POST "$BASE/api/items/by-slug/$SLUG/comments" -H 'content-type: application/json' -d '{"body":"Smoke test comment: works well, watch the API changes in v2."}' | head -c 200; echo
step "compat report"; curl -s -b "$JAR" -X POST "$BASE/api/items/by-slug/$SLUG/compat" -H 'content-type: application/json' -d '{"agent":"claude-code","status":"works","note":"smoke"}'; echo
step "item detail"; curl -sf "$BASE/api/items/by-slug/$SLUG" | head -c 400; echo
step "anonymous search"
curl -sf "$BASE/api/search?q=extract+tables+from+pdf+files+in+python&limit=3" | python3 -c '
import sys, json
for r in json.load(sys.stdin)["results"]:
    print("  %s  score=%s  why=%s" % (r["item"]["slug"], r["score"], r["why"]))
'
step "unauthenticated vote (must 401)"; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/items/by-slug/$SLUG/vote" -H 'content-type: application/json' -d '{"direction":"up"}'
step "pages render"; for p in / "/search?q=web+scraping" "/r/$SLUG" /submit "/?kind=skill"; do printf '  %-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"; done
echo; echo "smoke OK"
