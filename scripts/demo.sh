#!/usr/bin/env bash
# End-to-end demo: create a briefing for the Sarah fixture meeting, watch it
# run, print the result.
#
# Requires the stack to be running: `pnpm infra:up` + `pnpm graph:dev` +
# `pnpm worker:dev` in other terminals (or `pnpm stack:dev`).

set -euo pipefail

GRAPH="${GRAPH:-http://localhost:4001/graphql}"
MEETING_ID="${MEETING_ID:-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-120}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }

require() {
  command -v "$1" >/dev/null 2>&1 || { red "missing: $1"; exit 1; }
}
require curl
require python3

cyan "POST createBriefingFromMeeting meetingId=$MEETING_ID"

RESPONSE=$(curl -sS -X POST "$GRAPH" \
  -H 'content-type: application/json' \
  -d "{\"query\":\"mutation(\$m:ID!){createBriefingFromMeeting(meetingId:\$m){id status}}\",\"variables\":{\"m\":\"$MEETING_ID\"}}")

BRIEFING_ID=$(printf '%s' "$RESPONSE" | python3 -c \
  "import json, sys; data = json.load(sys.stdin); \
   errors = data.get('errors'); \
   print(f'ERROR: {errors}', file=sys.stderr) or sys.exit(1) if errors else None; \
   print(data['data']['createBriefingFromMeeting']['id'])")

green "briefing id: $BRIEFING_ID"
echo

cyan "polling progress (max ${MAX_WAIT_SECONDS}s)..."
START=$(date +%s)
LAST_STEP=""
while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))
  if [ "$ELAPSED" -gt "$MAX_WAIT_SECONDS" ]; then
    red "timeout after ${MAX_WAIT_SECONDS}s"
    exit 1
  fi

  PROGRESS=$(curl -sS -X POST "$GRAPH" \
    -H 'content-type: application/json' \
    -d "{\"query\":\"query(\$b:ID!){getBriefingProgress(briefingId:\$b){step}}\",\"variables\":{\"b\":\"$BRIEFING_ID\"}}")

  STEP=$(printf '%s' "$PROGRESS" | python3 -c \
    "import json, sys; d = json.load(sys.stdin); \
     events = d.get('data', {}).get('getBriefingProgress', []) or []; \
     print(events[-1]['step'] if events else 'waiting')" 2>/dev/null || echo "unknown")

  if [ "$STEP" != "$LAST_STEP" ]; then
    printf "  [%3ds] %s\n" "$ELAPSED" "$STEP"
    LAST_STEP="$STEP"
  fi

  case "$STEP" in
    done)   break ;;
    failed) red "pipeline failed"; exit 1 ;;
  esac
  sleep 2
done

echo
cyan "fetching finished briefing..."
curl -sS -X POST "$GRAPH" \
  -H 'content-type: application/json' \
  -d "{\"query\":\"query(\$b:ID!){getBriefing(id:\$b){id status sections}}\",\"variables\":{\"b\":\"$BRIEFING_ID\"}}" \
  | python3 -m json.tool

green
green "done. briefing id: $BRIEFING_ID"
