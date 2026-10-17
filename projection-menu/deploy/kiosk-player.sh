#!/usr/bin/env bash
# Starts the projector player fullscreen on a mini-PC / Raspberry Pi wired to
# the ceiling projector over HDMI (instead of the Android app). Add it to the
# desktop session's autostart (e.g. ~/.config/autostart or the labwc/wayfire
# autostart on Raspberry Pi OS).
#
# The player link of each projector is in the staff app (owner ← الطاولات
# وأجهزة العرض) and is printed by `npm run seed`:
#
#   PLAYER_URL="http://192.168.1.10:3000/player/?device=XXXXXXXXXXXXXXXXXXXXXXXX" ./kiosk-player.sh
set -euo pipefail

: "${PLAYER_URL:?Set PLAYER_URL to the projector link from the staff app (/player/?device=...)}"

# Never blank the screen / turn off the HDMI signal (X11; ignored on Wayland).
xset s off -dpms s noblank 2>/dev/null || true

BROWSER=$(command -v chromium || command -v chromium-browser || command -v google-chrome)

exec "$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --user-data-dir="$HOME/.config/projection-player" \
  "$PLAYER_URL"
