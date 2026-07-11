Finalize work in a worktree — run checks, rebase, and squash-merge into main.

## Arguments

- `yolo` — skip checks and the merge confirmation. Only does the minimum: commit uncommitted work, rebase onto main, exit worktree, squash-merge. Use when the user passes `yolo` as an argument.
- `nolint` — skip the checks step (step 2). Still runs rebase and merge confirmation. Use for docs-only or other non-code changes where checks would be pointless. Can combine with other arguments.

## Prerequisites

Must be on a worktree branch, not main. If on main, abort and tell the user to use `/commit` instead.

For story work, `/done` comes **after** maintainer verification (see `docs/README.workflow.md`). Don't merge unverified story work unless the user says to.

## Preflight context

When invoked as a slash command, a UserPromptSubmit hook injects a `PREFLIGHT (/done)` block containing the current branch, `git status --short`, uncommitted diff stat, the branch's commit log, `git diff main...HEAD --stat`, and the rebase state. **Use that block instead of re-running those commands.** Only re-gather what you change yourself (e.g. status after new commits). If no preflight block is present, gather the same context manually.

## Steps (default)

1. **Commit any uncommitted work** using the `/commit all yolo` flow (stage everything, commit without approval — the merge confirmation in step 5 is the real gate). The preflight block's status and diff stat tell you whether there's anything to commit and what it touches.

2. **Run checks:** `pnpm build && pnpm format && pnpm lint && pnpm test` — sequentially, never in parallel. `build` matters here: the quality-gates Stop hook doesn't run it. If anything fails, fix the issues, commit the fixes, and re-run until it passes. **Skip entirely when invoked with `nolint` or `yolo`**, or when the branch contains only docs/non-code changes.

3. **Rebase onto main.** While still in the worktree, rebase the branch so the squash-merge will be a clean fast-forward (the preflight block says whether this is a no-op):
   - `git rebase main` — this works because worktrees share refs with the main repo, so `main` is always the current local main ref.
   - If the rebase has conflicts, resolve them and continue. If you truly cannot resolve a conflict, abort (`git rebase --abort`) and tell the user.
   - Note: Do NOT use `git fetch . main:main` — it fails because main is checked out in the main worktree.

4. **Exit the worktree.** Use `ExitWorktree` with `action: "keep"` to return to main. Remember the branch name — you'll need it for the merge.

5. **Squash-merge into main.** Run the `/merge` flow from here (draft message from the commits you already know, present plan, wait for confirmation, then execute via `/home/eiko/repos/srs-converter/.claude/scripts/merge-branch.sh <branch> <message-file>` as one Bash call — see `/merge` step 6 for the exact invocation). Do NOT invoke `/merge` as a separate skill — execute its steps inline. You already have all the context; no re-gathering is needed.

## Steps (yolo)

When invoked with `yolo`, do only these steps — no asking, no checks:

1. **Commit any uncommitted work** via `/commit all yolo`.
2. **Rebase onto main** (`git rebase main`). If there are conflicts, abort and tell the user — yolo does not resolve conflicts.
3. **Exit the worktree** with `ExitWorktree` action `keep`.
4. **Squash-merge into main:** write the squash message to a temp file and run `/home/eiko/repos/srs-converter/.claude/scripts/merge-branch.sh <branch> <message-file>` — no confirmation gate in yolo mode.
