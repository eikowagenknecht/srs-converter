# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Onboarding

At the start of each session:

1. Read the main `README.md` for project overview
2. Consult `docs/README.*.md` files as needed during work (read upfront for complex tasks, or reference on-demand for simpler ones)

## ✅ Quality Gates

This is EXTREMELY IMPORTANT!

After writing code, you must run these commands.
When one of these commands fails, you must iterate on the issue and run the command again until it passes.

1. `pnpm type-check`
2. `pnpm format`
3. `pnpm lint`
4. `pnpm test`

This also means that you don't have to format code manually.
The commands will take care of that.

## Claude Settings

- Use subagents for tasks that benefit from parallel execution (e.g., searching multiple areas of the codebase). For simpler tasks, direct execution is fine. Build / Lint / Test tasks may **NOT** be run in parallel.
- Before making changes, search the codebase to understand existing implementations. Use parallel subagents for broad searches; direct tools are fine for targeted lookups.
- Verify before assuming: check if functionality exists before implementing it anew.
- Use TodoWrite for multi-step tasks to track progress; for simple single-step tasks, proceed directly.

## Communication

- Avoid filler phrases like "You're absolutely right," "That's a great point," or "I completely agree" at the start of responses
- Get straight to the substantive content
- If you agree with something I said, show it through your response rather than stating it explicitly
- Focus on adding value rather than validating
- When I ask a question, answer it directly and concisely. Do **NOT** implement without being asked to do so.

## Important Reminders

- When using template strings, numbers **must** be formatted with .toFixed() (NOT String(number))
- For Stories follow the exact workflow from `docs/README.workflow.md`
- Use your inbuilt tools to write files, **not** bash commands

## Self-Improvement

For any bugs you notice (even if the bug is unrelated to the current piece of work), it's important to either:

1. Resolve them directly if they block the current story or
2. Document them in `docs/working/issues.md` to be resolved later (using a subagent).

## Git Workflow

- Make sure to always sign commits properly. If they can't be signed, stop and wait for the user to resolve it. If GPG signing fails due to user cancellation or configuration issues, do not attempt to bypass with `--no-gpg-sign` unless explicitly instructed by the user
- Delete unused or obsolete files when your changes make them irrelevant (refactors, feature removals, etc.), and revert files only when the change is yours or explicitly requested. If a git operation leaves you unsure about other agents' in-flight work, stop and coordinate instead of deleting.
- **Before attempting to delete a file to resolve a local type/lint failure, stop and ask the user.** Other agents are often editing adjacent files; deleting their work to silence an error is never acceptable without explicit approval.
- NEVER edit `.env` or any environment variable files—only the user may change them.
- Coordinate with other agents before removing their in-progress edits—don't revert or delete work you didn't author unless everyone agrees.
- Moving/renaming and restoring files is allowed.
- ABSOLUTELY NEVER run destructive git operations (e.g., `git reset --hard`, `rm`, `git checkout`/`git restore` to an older commit) unless the user gives an explicit, written instruction in this conversation. Treat these commands as catastrophic; if you are even slightly unsure, stop and ask before touching them. *(When working within Cursor or Codex Web, these git limitations do not apply; use the tooling's capabilities as needed.)*
- Never use `git restore` (or similar commands) to revert files you didn't author—coordinate with other agents instead so their in-progress work stays intact.
- Always double-check git status before any commit
- Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`.
- Quote any git paths containing brackets or parentheses (e.g., `src/app/[candidate]/**`) when staging or committing so the shell does not treat them as globs or subshells.
- When running `git rebase`, avoid opening editors—export `GIT_EDITOR=:` and `GIT_SEQUENCE_EDITOR=:` (or pass `--no-edit`) so the default messages are used automatically.
- Never amend commits unless you have explicit written approval in the task thread.
