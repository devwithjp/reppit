#!/usr/bin/env bash
# One desk tick, run from cron every 15 minutes:
#   */15 * * * * bash $HOME/Desktop/Projects/gitit/bip/run-desk.sh
#
# Cheap when idle: it asks desk.py whether a post or a metric snapshot is due and exits
# without starting Claude if nothing is. When something is due it makes sure the desk Chrome
# is up and runs one headless desk session, which follows bip/CLAUDE.md.
set -uo pipefail
REPO="$HOME/Desktop/Projects/gitit"
STATE="$HOME/.local/share/reppit-desk"
LOG="$STATE/logs/$(date +%Y-%m-%d).log"
mkdir -p "$STATE/logs"

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

# Never two ticks at once.
exec 9>"$STATE/desk.lock"
flock -n 9 || exit 0

cd "$REPO" || exit 1
DUE="$(python3 bip/desk.py due)"
SNAPS="$(python3 bip/desk.py checkpoints)"
if [[ "$DUE" == "nothing due" && "$SNAPS" == "no snapshots due" ]]; then
  exit 0
fi

{
  echo "=== $(date -Is) tick"
  echo "due: $DUE"
  echo "snapshots: $SNAPS"
} >>"$LOG"

bash bip/chrome.sh >>"$LOG" 2>&1 || { echo "chrome failed to start, skipping tick" >>"$LOG"; exit 1; }

cd "$REPO/bip" || exit 1
claude -p "Run one desk tick. Due posts: $DUE. Snapshots due: $SNAPS. Follow CLAUDE.md exactly: post what is due through the desk Chrome, record every URL, take the due snapshots, sync the tracker, and append a short note of what you did to bip/learnings.md under Readouts. Stop at the first warning, captcha or failure and write what happened to bip/drafts.md." \
  --permission-mode dontAsk \
  --allowedTools "Bash(node --experimental-websocket:*)" "Bash(python3 ../bip/desk.py:*)" "Bash(python3 bip/desk.py:*)" \
    "Bash(../bip/desk.py:*)" "Bash(../scripts/xpost.py:*)" "Bash(bash chrome.sh)" "Bash(sleep:*)" \
    "Read" "Edit(./learnings.md)" "Edit(./drafts.md)" "Edit(./queue.json)" "Artifact" \
  >>"$LOG" 2>&1
echo "=== $(date -Is) tick done (exit $?)" >>"$LOG"
