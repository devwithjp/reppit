#!/usr/bin/env bash
# Start the desk's own visible Chrome if it is not already running.
# It runs from a copy of the user's "Jyothiprakash" Chrome profile (cookies, local storage
# and preferences only) kept in ~/.local/share/reppit-desk/chrome, with a control port bound
# to 127.0.0.1:9333. The user's everyday Chrome is never touched.
set -euo pipefail
DATA="$HOME/.local/share/reppit-desk/chrome"
PORT=9333

if curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "desk chrome already running"
  exit 0
fi

# Cron runs without the desktop session's variables; give Chrome the real display.
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

setsid nohup google-chrome --user-data-dir="$DATA" --profile-directory="Profile 1" \
  --remote-debugging-port=$PORT --remote-debugging-address=127.0.0.1 \
  --no-first-run --no-default-browser-check --new-window "https://x.com/home" \
  >"$HOME/.local/share/reppit-desk/chrome.log" 2>&1 </dev/null &

for _ in $(seq 1 30); do
  curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && { echo "desk chrome started"; exit 0; }
  sleep 1
done
echo "desk chrome did not start; see ~/.local/share/reppit-desk/chrome.log" >&2
exit 1
