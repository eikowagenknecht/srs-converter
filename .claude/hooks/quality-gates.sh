#!/usr/bin/env bash
# Stop hook: run the quality gates (type-check, format, lint, test) at the end
# of any turn in which code files were edited (tracked by track-edits.sh).
# Takes ~4s on this repo; turns without code edits skip in <100ms.
#
# On failure the hook blocks the stop (exit 2) and feeds the output back so
# Claude fixes the issues. stop_hook_active guards against endless loops:
# after one automatic fix round the turn is allowed to end with a warning.

set -u
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}" || exit 0

INPUT=$(cat)
META=$(printf "%s" "$INPUT" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  process.stdout.write((input.session_id || "default") + " " + (input.stop_hook_active ? "1" : "0"));
});
')
SESSION_ID=${META% *}
STOP_ACTIVE=${META#* }

MARKER="/tmp/claude-quality-gates-${SESSION_ID}"
[ -s "$MARKER" ] || exit 0

FAILURES=""
for GATE in type-check format lint:oxlint test; do
  if ! OUTPUT=$(pnpm "$GATE" 2>&1); then
    FAILURES="${FAILURES}
--- pnpm ${GATE} failed ---
$(printf "%s" "$OUTPUT" | tail -n 60)
"
  fi
done

if [ -z "$FAILURES" ]; then
  rm -f "$MARKER"
  exit 0
fi

if [ "$STOP_ACTIVE" = "1" ]; then
  rm -f "$MARKER"
  printf "%s" '{"systemMessage": "Quality gates are still failing after an automatic fix round - please check manually (pnpm type-check / lint / test)."}'
  exit 0
fi

{
  echo "Quality gates failed. Fix the issues below, then verify by re-running the failing commands until they pass."
  printf "%s\n" "$FAILURES"
} >&2
exit 2
