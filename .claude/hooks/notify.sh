#!/usr/bin/env bash
# notify.sh — push a short message to your phone during an unattended Kira run.
#
# Usage:
#   .claude/hooks/notify.sh "Phase 0 audit done — scorecard ready"   # direct call
#   (also runs as a Claude Code `Notification` hook: reads JSON on stdin)
#
# Configure ONE of these env vars on the machine that runs Claude Code:
#   KIRA_NOTIFY_URL   full webhook URL that accepts a POST body as the message.
#                     Easiest: an ntfy.sh topic, e.g.
#                       export KIRA_NOTIFY_URL="https://ntfy.sh/monopilot-kira-<your-secret>"
#                     then install the ntfy app on your phone and subscribe to that topic.
#                     (Any service that takes a plain POST body works: Pushover proxy, a
#                      Telegram bot webhook wrapper, your own endpoint, etc.)
#
# If KIRA_NOTIFY_URL is unset, this is a silent no-op so runs never break.

set -uo pipefail

msg="${1:-}"

# When invoked as a hook there's JSON on stdin; pull a human field out of it.
if [ -z "$msg" ] && [ ! -t 0 ]; then
  input="$(cat 2>/dev/null || true)"
  if command -v jq >/dev/null 2>&1; then
    msg="$(printf '%s' "$input" | jq -r '.message // .prompt // .notification // empty' 2>/dev/null)"
  fi
  [ -z "$msg" ] && msg="$(printf '%s' "$input" | tr -d '\n' | cut -c1-300)"
fi
[ -z "$msg" ] && msg="MonoPilot Kira: Claude needs your attention."

url="${KIRA_NOTIFY_URL:-}"
[ -z "$url" ] && exit 0

curl -fsS -m 10 \
  -H "Title: MonoPilot Kira" \
  -H "Tags: robot" \
  -d "$msg" \
  "$url" >/dev/null 2>&1 || true

exit 0
