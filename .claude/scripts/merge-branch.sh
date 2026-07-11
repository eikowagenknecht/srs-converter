#!/bin/bash
# Deterministic merge mechanics for the /merge and /done flows.
#
# Usage: merge-branch.sh <branch> <commit-message-file>
#
# Runs the mechanical tail of /merge as one call: verifies preconditions,
# ensures the branch is rebased onto local main (rebasing inside its
# worktree if needed), squash-merges, commits with the approved message
# (hooks run and the commit is GPG-signed — never bypassed), then cleans up
# the worktree and branch. Cleanup failures warn but do not abort: the merge
# itself already succeeded.
#
# Run this ONLY after the user has confirmed the merge plan.

set -uo pipefail

REPO="/home/eiko/repos/srs-converter"
BRANCH="${1:?usage: merge-branch.sh <branch> <message-file>}"
MSG_FILE="${2:?usage: merge-branch.sh <branch> <message-file>}"

fail() {
  echo "MERGE SCRIPT FAILED: $*" >&2
  exit 1
}

cd "$REPO" || fail "cannot cd to $REPO"

[ -s "$MSG_FILE" ] || fail "message file '$MSG_FILE' is missing or empty"
[ "$(git symbolic-ref --short HEAD 2>/dev/null)" = "main" ] || fail "HEAD is not on main"
git show-ref --verify --quiet "refs/heads/$BRANCH" || fail "branch '$BRANCH' does not exist"
[ -z "$(git status --porcelain -uno)" ] || fail "main has uncommitted tracked changes — commit or clean them before merging"

# Worktree path holding this branch, if any (needed for in-place rebase and cleanup).
WT_PATH=$(git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '$1=="worktree"{wt=$2} $1=="branch" && $2==b {print wt}')

# Ensure the branch contains the main tip so the squash applies cleanly.
if ! git merge-base --is-ancestor main "$BRANCH"; then
  if [ -n "$WT_PATH" ] && [ -d "$WT_PATH" ]; then
    echo "Branch is behind main — rebasing inside its worktree..."
    if ! git -C "$WT_PATH" rebase main; then
      git -C "$WT_PATH" rebase --abort >/dev/null 2>&1 || true
      fail "rebase of '$BRANCH' onto main hit conflicts (aborted). Resolve manually in $WT_PATH, then re-run."
    fi
  else
    fail "branch '$BRANCH' is behind main and has no worktree to rebase in. Rebase it manually, then re-run."
  fi
fi

git merge --squash "$BRANCH" || fail "git merge --squash '$BRANCH' failed"
git commit -F "$MSG_FILE" || fail "commit failed (see hook output above — if GPG signing failed, wait for the user and retry 'git commit -F $MSG_FILE'; never --no-gpg-sign). The squashed changes are still staged on main."

COMMIT=$(git rev-parse --short HEAD)
echo "MERGED: $BRANCH -> main as $COMMIT"

if [ -n "$WT_PATH" ] && [ -d "$WT_PATH" ]; then
  if git worktree remove "$WT_PATH" 2>&1; then
    echo "CLEANED: worktree $WT_PATH removed"
  else
    echo "WARN: could not remove worktree $WT_PATH (merge itself succeeded — remove it manually)"
  fi
fi
if git branch -D "$BRANCH" >/dev/null 2>&1; then
  echo "CLEANED: branch $BRANCH deleted"
else
  echo "WARN: could not delete branch $BRANCH (merge itself succeeded)"
fi

echo "== git status --short =="
git status --short | head -20
exit 0
