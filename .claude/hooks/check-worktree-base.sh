#!/bin/bash
# PreToolUse hook for EnterWorktree.
#
# Claude Code's EnterWorktree branches new worktrees from `origin/main`, not
# from local HEAD. When local main is ahead of origin/main (merges happen
# locally first, pushes are sporadic), new worktrees come up on a stale base
# and miss recently-merged work.
#
# This hook fixes that by fast-forwarding the local `origin/main` ref to
# match local `main` whenever local main is a strict descendant of
# origin/main. We only touch the local tracking ref, never the actual remote;
# the next `git fetch` will reconcile it.
#
# It also denies the call if HEAD isn't on local main, since branching from
# a feature branch's view of origin/main is almost never what we want.

set -euo pipefail

# Read stdin (required) and extract cwd with grep/sed (no jq dependency).
# Tolerate pretty-printed JSON with whitespace around the colon, and don't
# let an unmatched grep trip pipefail.
INPUT=$(cat)
REPO_DIR=$(printf '%s' "$INPUT" | grep -oE '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/"cwd"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
if [ -z "$REPO_DIR" ]; then
  exit 0
fi

cd "$REPO_DIR"

CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")

if [ "$CURRENT_BRANCH" != "main" ]; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE BASE CHECK FAILED: HEAD is on '${CURRENT_BRANCH}', not 'main'. Switch to local main before creating a worktree."}}
EOF
  exit 0
fi

LOCAL_MAIN=$(git rev-parse main 2>/dev/null || echo "")
REMOTE_MAIN=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ -z "$LOCAL_MAIN" ]; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE BASE CHECK FAILED: cannot resolve local 'main' ref."}}
EOF
  exit 0
fi

ACTION="origin/main already in sync at ${LOCAL_MAIN:0:8}"
if [ -n "$REMOTE_MAIN" ] && [ "$LOCAL_MAIN" != "$REMOTE_MAIN" ]; then
  if git merge-base --is-ancestor "$REMOTE_MAIN" "$LOCAL_MAIN" 2>/dev/null; then
    # Fast-forward local origin/main tracking ref to local main so
    # EnterWorktree (which branches from origin/main) picks up the latest work.
    git update-ref refs/remotes/origin/main "$LOCAL_MAIN" "$REMOTE_MAIN"
    ACTION="advanced origin/main from ${REMOTE_MAIN:0:8} to ${LOCAL_MAIN:0:8}"
  else
    cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE BASE CHECK FAILED: local main (${LOCAL_MAIN:0:8}) and origin/main (${REMOTE_MAIN:0:8}) have diverged (not a fast-forward). Resolve before creating a worktree."}}
EOF
    exit 0
  fi
fi

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"WORKTREE BASE OK: ${ACTION}. Worktree will branch from ${LOCAL_MAIN:0:8}."}}
EOF
exit 0
