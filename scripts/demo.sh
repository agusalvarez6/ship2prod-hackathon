#!/usr/bin/env bash
# End-to-end demo: create a briefing for the Sarah fixture meeting, poll
# until it's ready, print the result.
#
# Requires the stack to be running (pnpm battleStation:start).

set -euo pipefail

GRAPH="${GRAPH:-http://localhost:4001/graphql}"
MEETING_ID="${MEETING_ID:-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-180}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }

for bin in curl python3; do
  command -v "$bin" >/dev/null 2>&1 || { red "missing: $bin"; exit 1; }
done

cyan "POST createBriefingFromMeeting meetingId=$MEETING_ID"

RESPONSE=$(curl -sS -X POST "$GRAPH" \
  -H 'content-type: application/json' \
  -d "{\"query\":\"mutation(\$m:ID!){createBriefingFromMeeting(meetingId:\$m){id status}}\",\"variables\":{\"m\":\"$MEETING_ID\"}}")

BRIEFING_ID=$(printf '%s' "$RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
errors = data.get('errors')
if errors:
    sys.stderr.write(f'graphql error: {errors}\n')
    sys.exit(1)
print(data['data']['createBriefingFromMeeting']['id'])
")

green "briefing id: $BRIEFING_ID"
echo

cyan "polling briefing status (max ${MAX_WAIT_SECONDS}s)..."
START=$(date +%s)
LAST_STATUS=""
while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))
  if [ "$ELAPSED" -gt "$MAX_WAIT_SECONDS" ]; then
    red "timeout after ${MAX_WAIT_SECONDS}s. Worker may have failed — check its terminal."
    exit 1
  fi

  RESP=$(curl -sS -X POST "$GRAPH" \
    -H 'content-type: application/json' \
    -d "{\"query\":\"query(\$b:ID!){getBriefing(id:\$b){status}}\",\"variables\":{\"b\":\"$BRIEFING_ID\"}}")

  STATUS=$(printf '%s' "$RESP" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    b = d.get('data', {}).get('getBriefing') or {}
    print(b.get('status', 'unknown'))
except Exception:
    print('unknown')
")

  if [ "$STATUS" != "$LAST_STATUS" ]; then
    printf "  [%3ds] %s\n" "$ELAPSED" "$STATUS"
    LAST_STATUS="$STATUS"
  fi

  case "$STATUS" in
    ready)  break ;;
    failed) red "briefing failed — check worker logs"; exit 1 ;;
  esac
  sleep 2
done

echo
cyan "fetching finished briefing..."
curl -sS -X POST "$GRAPH" \
  -H 'content-type: application/json' \
  -d "{\"query\":\"query(\$b:ID!){getBriefing(id:\$b){id status sections}}\",\"variables\":{\"b\":\"$BRIEFING_ID\"}}" \
  | python3 -m json.tool

echo
green "done. briefing id: $BRIEFING_ID"
