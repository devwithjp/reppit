#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.16.0/bin:/usr/local/bin:/usr/bin:/bin"
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
cd "$(dirname "$0")/.."
STATE="$HOME/.local/share/reppit-desk"
mkdir -p "$STATE/logs"
exec 9>"$STATE/campaign.lock"
flock -n 9 || exit 0
# The scheduler only creates a local review packet. It never opens or posts to X.
node bip/campaign.mjs tick >>"$STATE/logs/campaign.log" 2>&1
