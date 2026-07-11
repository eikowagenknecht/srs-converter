#!/bin/bash
# UserPromptSubmit hook.
#
# When the prompt is a /done, /merge, or /commit invocation, pre-gather the
# mechanical git context those flows would otherwise fetch one Bash call at
# a time (branch, status, numstat, commit log, diff stats, worktree list)
# and inject it into the conversation. This saves 4-6 model round-trips at
# the start of each flow.
#
# For any other prompt this exits immediately with no output.

set -uo pipefail

INPUT=$(cat)

# Match the prompt prefix without fully parsing JSON (no jq dependency).
# Tolerates whitespace around the colon.
MODE=""
if printf '%s' "$INPUT" | grep -qE '"prompt"[[:space:]]*:[[:space:]]*"/done'; then
  MODE="done"
elif printf '%s' "$INPUT" | grep -qE '"prompt"[[:space:]]*:[[:space:]]*"/merge'; then
  MODE="merge"
elif printf '%s' "$INPUT" | grep -qE '"prompt"[[:space:]]*:[[:space:]]*"/commit'; then
  MODE="commit"
else
  exit 0
fi

CWD=$(printf '%s' "$INPUT" | grep -oE '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/"cwd"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
[ -n "$CWD" ] && [ -d "$CWD" ] || exit 0
cd "$CWD" || exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")

echo "PREFLIGHT (/$MODE) — pre-gathered git context injected by hook. Use this instead of re-running these commands; only re-run something if you change state (new commits, rebase) after this point."
echo ""
echo "Current branch: $BRANCH"
echo "CWD: $CWD"

if [ "$MODE" = "commit" ]; then
  echo ""
  echo "== git status --short (incl. untracked) =="
  git status --short 2>/dev/null | head -100 || true
  echo ""
  echo "== git diff HEAD --numstat (per-file +/-, staged + unstaged) =="
  git diff HEAD --numstat 2>/dev/null | head -100 || true
  echo ""
  echo "== recent commit subjects (for message style) =="
  git log --oneline -8 2>/dev/null || true
  exit 0
fi

if [ "$MODE" = "done" ]; then
  if [ "$BRANCH" = "main" ]; then
    echo ""
    echo "NOTE: HEAD is on main — /done requires a worktree branch. Abort and point the user at /commit."
    exit 0
  fi
  echo ""
  echo "== git status --short (uncommitted work, incl. untracked) =="
  git status --short 2>/dev/null | head -100 || true
  echo ""
  echo "== git diff HEAD --numstat (per-file +/-, staged + unstaged) =="
  git diff HEAD --numstat 2>/dev/null | head -100 || true
  echo ""
  echo "== git log main..HEAD --oneline (commits on this branch) =="
  git log main..HEAD --oneline 2>/dev/null | head -50 || true
  echo ""
  echo "== git diff main...HEAD --stat (branch diff summary) =="
  git diff main...HEAD --stat 2>/dev/null | tail -40 || true
  echo ""
  if git merge-base --is-ancestor main HEAD 2>/dev/null; then
    echo "Rebase state: branch already contains main tip (rebase will be a no-op)."
  else
    echo "Rebase state: branch is BEHIND main tip — 'git rebase main' is required."
  fi
else
  # /merge — enumerate worktree branches with per-branch summaries.
  echo ""
  echo "== git worktree list =="
  git worktree list 2>/dev/null || true
  BRANCHES=$(git for-each-ref --format='%(refname:short)' 'refs/heads/worktree-*' 2>/dev/null || true)
  if [ -z "$BRANCHES" ]; then
    echo ""
    echo "No worktree-* branches exist — nothing to merge."
    exit 0
  fi
  for BR in $BRANCHES; do
    echo ""
    echo "== branch: $BR =="
    echo "-- git log main..$BR --oneline --"
    git log "main..$BR" --oneline 2>/dev/null | head -30 || true
    echo "-- git diff main...$BR --stat --"
    git diff "main...$BR" --stat 2>/dev/null | tail -25 || true
    if git merge-base --is-ancestor main "$BR" 2>/dev/null; then
      echo "-- rebase state: contains main tip (squash will apply cleanly)"
    else
      echo "-- rebase state: BEHIND main tip (merge-branch.sh will rebase it in its worktree)"
    fi
  done
fi

exit 0
