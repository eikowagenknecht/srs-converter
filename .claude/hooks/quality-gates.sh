#!/usr/bin/env bash
# Stop hook: run the quality gates (type-check, format, lint, test) at the end
# of any turn in which code files were edited (tracked by track-edits.sh).
# Takes well under a minute on this repo; turns without code edits skip in
# <100ms.
#
# The gates run in the repo root derived from the hook input's cwd, so a
# session working in a worktree (.claude/worktrees/<name>) validates the
# worktree, not the main checkout. In a worktree the hook also waits for the
# background `pnpm install` started by setup-worktree.sh before invoking pnpm.
#
# On failure the hook blocks the stop (exit 2) and feeds the output back so
# Claude fixes the issues. stop_hook_active guards against endless loops:
# after one automatic fix round the turn is allowed to end with a warning.

set -u

INPUT=$(cat)
META=$(printf "%s" "$INPUT" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  const lines = [
    input.session_id || "default",
    input.stop_hook_active ? "1" : "0",
    input.cwd || "",
  ];
  process.stdout.write(lines.join("\n"));
});
')
SESSION_ID=$(printf "%s\n" "$META" | sed -n 1p)
STOP_ACTIVE=$(printf "%s\n" "$META" | sed -n 2p)
HOOK_CWD=$(printf "%s\n" "$META" | sed -n 3p)

ROOT=""
if [ -n "$HOOK_CWD" ] && [ -d "$HOOK_CWD" ]; then
  ROOT=$(git -C "$HOOK_CWD" rev-parse --show-toplevel 2>/dev/null || true)
fi
[ -n "$ROOT" ] || ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0

MARKER="/tmp/claude-quality-gates-${SESSION_ID}"
[ -s "$MARKER" ] || exit 0

FAILURES=""

# In a worktree, the background install from setup-worktree.sh may still be
# running — wait for its exit marker (if an install log exists) before
# invoking pnpm.
case "$ROOT" in
  */.claude/worktrees/*)
    WT_NAME=$(basename "$ROOT")
    INSTALL_MARKER="/tmp/srs-wt-install-${WT_NAME}.exitcode"
    INSTALL_LOG="/tmp/srs-wt-install-${WT_NAME}.log"
    WAITED=0
    while [ ! -f "$INSTALL_MARKER" ] && [ -f "$INSTALL_LOG" ] && [ "$WAITED" -lt 180 ]; do
      sleep 2
      WAITED=$((WAITED + 2))
    done
    if [ -f "$INSTALL_MARKER" ] && [ "$(cat "$INSTALL_MARKER" 2>/dev/null)" != "0" ]; then
      FAILURES="
--- worktree pnpm install failed (log: ${INSTALL_LOG}) ---
$(tail -n 30 "$INSTALL_LOG" 2>/dev/null)
Fix it with: CI=1 pnpm install --frozen-lockfile
"
    fi
    ;;
esac

if [ -z "$FAILURES" ]; then
  for GATE in type-check format lint:oxlint test; do
    if ! OUTPUT=$(pnpm "$GATE" 2>&1); then
      FAILURES="${FAILURES}
--- pnpm ${GATE} failed ---
$(printf "%s" "$OUTPUT" | tail -n 60)
"
    fi
  done
fi

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
