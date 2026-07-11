#!/bin/bash
# PreToolUse hook for Edit|Write|NotebookEdit.
#
# When Claude is working inside a worktree (CWD under .claude/worktrees/<wt>/),
# block tool calls that pass an absolute file_path pointing back at the main
# repo. Those calls bypass the worktree and silently mutate main. The fix is
# to use a relative path or the worktree's absolute path.
#
# Allowed: relative paths, absolute paths inside any worktree, absolute paths
# outside the repo entirely. Denied: absolute paths under the main repo that
# are not under .claude/worktrees/.
#
# Additionally, background sessions (CLAUDE_CODE_SESSION_KIND=bg) spawned
# with bgIsolation "none" are told by the harness to "work in place" and
# lose its built-in shared-checkout edit guard. Repo policy still requires a
# worktree for code changes, so when a bg session's CWD is the main repo,
# this hook denies edits to repo files — except git-ignored/excluded paths
# (settings.local.json, ...), which are local-only config, not code.
#
# For interactive sessions with CWD in the main repo this stays a no-op —
# the user may legitimately be editing main.

set -euo pipefail

REPO_ROOT="/home/eiko/repos/srs-converter"
WORKTREE_ROOT="${REPO_ROOT}/.claude/worktrees/"

INPUT=$(cat)

extract() {
  printf '%s' "$INPUT" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/\"$1\"[[:space:]]*:[[:space:]]*\"//;s/\"$//" || true
}

CWD=$(extract cwd)
FILE_PATH=$(extract file_path)
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(extract notebook_path)
fi

# Background session working directly in the main repo: repo policy requires
# a worktree for code changes, even though the harness told this session to
# work in place. Deny edits to non-ignored repo files.
if [ "${CLAUDE_CODE_SESSION_KIND:-}" = "bg" ]; then
  case "$CWD" in
    "${WORKTREE_ROOT}"*) ;; # already isolated — fall through to the path check below
    "$REPO_ROOT" | "${REPO_ROOT}/"*)
      # Resolve the target path relative to the main repo.
      TARGET="$FILE_PATH"
      case "$TARGET" in
        /*) ;;
        *) TARGET="${CWD%/}/$TARGET" ;;
      esac
      case "$TARGET" in
        "${WORKTREE_ROOT}"*) exit 0 ;; # writing into a worktree is fine
        "${REPO_ROOT}/"*)
          REL="${TARGET#${REPO_ROOT}/}"
          # git-ignored/excluded paths are local-only config, not repo code —
          # allow those.
          if git -C "$REPO_ROOT" check-ignore -q -- "$REL" 2>/dev/null; then
            exit 0
          fi
          cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE POLICY: this is a background session editing the shared main checkout ('${REL}'). Repo policy requires a worktree for any code change, even though the session harness says it is configured to work in place. Call EnterWorktree first, then make this edit inside the worktree."}}
EOF
          exit 0
          ;;
        *) exit 0 ;; # outside the repo — fine
      esac
      ;;
  esac
fi

# Only enforce the remaining checks when CWD is inside a worktree.
case "$CWD" in
  "${WORKTREE_ROOT}"*) ;;
  *) exit 0 ;;
esac

# Only inspect absolute paths — relative paths resolve against CWD (the worktree).
case "$FILE_PATH" in
  /*) ;;
  *) exit 0 ;;
esac

# Allow paths inside any worktree.
case "$FILE_PATH" in
  "${WORKTREE_ROOT}"*) exit 0 ;;
esac

# Allow paths outside the main repo entirely.
case "$FILE_PATH" in
  "${REPO_ROOT}/"*) ;;
  *) exit 0 ;;
esac

# In a worktree, absolute file_path points at main repo, not at any worktree. Block.
RELATIVE="${FILE_PATH#${REPO_ROOT}/}"
WORKTREE_PATH="${CWD%/}/${RELATIVE}"

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE PATH CHECK FAILED: file_path '${FILE_PATH}' points at the main repo, but CWD is the worktree '${CWD}'. Use a relative path ('${RELATIVE}') or the worktree's absolute path ('${WORKTREE_PATH}') instead."}}
EOF
exit 0
