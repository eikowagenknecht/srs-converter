#!/bin/bash
# PostToolUse hook for EnterWorktree.
#
# Automates worktree setup so it costs no model turns: kicks off
# `CI=1 pnpm install --frozen-lockfile` in the background (CI=1 makes the
# lefthook postinstall skip hook installation; git hooks live in the shared
# git dir, so lefthook from main applies). Installs are fast because pnpm
# hardlinks from its global content-addressable store.
#
# Emits additionalContext telling the model setup is handled and how to
# wait for the install before running anything that needs node_modules.

set -uo pipefail

REPO="/home/eiko/repos/srs-converter"
WORKTREE_ROOT="${REPO}/.claude/worktrees"

INPUT=$(cat)

# Find the worktree path anywhere in the hook input (tool_response or cwd).
# Take the first candidate that is an existing directory.
WT=""
for CAND in $(printf '%s' "$INPUT" | grep -oE "${WORKTREE_ROOT}/[A-Za-z0-9._-]+" | sort -u); do
  if [ -d "$CAND" ]; then
    WT="$CAND"
    break
  fi
done
[ -n "$WT" ] || exit 0

NAME=$(basename "$WT")

LOG="/tmp/srs-wt-install-${NAME}.log"
MARKER="/tmp/srs-wt-install-${NAME}.exitcode"
rm -f "$MARKER"
nohup bash -c "cd '$WT' && CI=1 pnpm install --frozen-lockfile >'$LOG' 2>&1; echo \$? >'$MARKER'" >/dev/null 2>&1 &

MSG="WORKTREE SETUP HOOK: CI=1 pnpm install --frozen-lockfile is running in the background in $WT (log: $LOG). Do NOT run any manual worktree setup. Before the first command that needs node_modules (type-check, lint, test, build), wait for it: until [ -f $MARKER ]; do sleep 2; done && cat $MARKER (0 means success; on non-zero, read the log and retry with CI=1 pnpm install). Docs-only work never needs to wait. The quality-gates Stop hook waits for this marker on its own."

printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$MSG"
exit 0
