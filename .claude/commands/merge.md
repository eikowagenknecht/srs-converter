Squash-merge worktree branches into main.

## Prerequisites

Must be on the `main` branch. If on a worktree branch, abort and tell the user to use `/done` instead (which includes the merge step).

## Preflight context

When invoked as a slash command, a UserPromptSubmit hook injects a `PREFLIGHT (/merge)` block containing the worktree list, every `worktree-*` branch with its commit log, diff stat, and rebase state. **Use that block for steps 1-3 instead of re-running the commands.** Only run the commands manually if no preflight block is present (e.g. when this flow is executed inline from another skill).

## Steps

1. **List available branches.** From the preflight block (or `git worktree list` + `git branch` as fallback), find worktree branches (branches starting with `worktree-`). Exclude the current branch (main).

2. **Select a branch:**
   - If `$ARGUMENTS` specifies a branch name, use that.
   - If there is exactly one worktree branch, use it automatically.
   - If there are multiple, present the list and ask the user to pick one.
   - If there are none, tell the user and abort.

3. **Gather context.** The preflight block already contains the commit log (`git log main..<branch> --oneline`) and diff summary (`git diff main...<branch> --stat`) per branch. Use the commit messages and stat summary to draft the squash message — do **not** read the full diff. (When called inline from `/done`, you already reviewed the changes during the commit step.)

4. **Draft a squash commit message.** Write a single Conventional Commit message (scope rules are in `/commit`). If the work spans multiple types, use the most significant one (`feat:` > `fix:` > `refactor:` > `chore:`). The message should summarize the overall change, not list individual commits. **The squash commit is what semantic-release sees** — a `feat:`/`fix:` subject triggers a release and becomes the `CHANGELOG.md` entry, so write it user-readable and pick the type deliberately.

5. **Present the plan and wait for approval.** Use this format:

   ```
   Squash-merge `<branch>` → `main`

   <N> commits, <files changed> files (+X / -Y)

   Message: <draft commit message>

   **READY TO MERGE — CONFIRM?**
   ```

   Do not proceed until the user confirms.

6. **Execute the merge via the script.** Write the approved commit message to a temp file (use the scratchpad directory or `mktemp`), then run everything as ONE Bash call:

   ```bash
   printf '%s\n' "<approved message>" > "$MSG_FILE" && /home/eiko/repos/srs-converter/.claude/scripts/merge-branch.sh <branch> "$MSG_FILE"
   ```

   The script handles the whole mechanical tail in one shot:
   - verifies HEAD is on main, the branch exists, and main has no uncommitted tracked changes;
   - rebases the branch onto local main **inside its worktree** if it's behind (never onto `origin/main`, never fetches); on rebase conflict it aborts the rebase and exits with an error — resolve the conflict manually in the worktree, then re-run;
   - `git merge --squash` + `git commit -F <file>` (hooks run and the commit is GPG-signed — never `--no-verify`, never `--no-gpg-sign`; if signing fails, wait for the user and retry the commit);
   - removes the worktree and deletes the branch; cleanup failures print `WARN:` lines but don't abort (the merge already succeeded).

   If the script fails, read its error message — each failure mode says what to fix. Do not fall back to running the merge steps by hand unless the script itself is broken.

7. **Report the result.** Show the final commit hash and a one-line summary from the script output. Confirm the worktree and branch were cleaned up (or relay any `WARN:` lines).
