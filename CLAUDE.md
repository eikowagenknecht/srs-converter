# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Onboarding

At the start of each session:

1. Read the main `README.md` for project overview
2. Consult `docs/README.*.md` files as needed during work (read upfront for complex tasks, or reference on-demand for simpler ones)

## ✅ Quality Gates

All of these must pass before any code change is considered done:

1. `pnpm type-check`
2. `pnpm format`
3. `pnpm lint`
4. `pnpm test`

A Stop hook (`.claude/hooks/quality-gates.sh`) runs them automatically at the end of every turn in which code files were edited and blocks completion until they pass. When a gate fails, fix the issue and re-run until it passes. Formatting is handled by the commands — never format code manually. Turns that only touch documentation skip the hook.

## 🤝 Working Style

- Prefer asking over guessing: for approach choices (even between seemingly equivalent options), scope questions, or anything ambiguous, ask a brief question before proceeding. One question too many is better than a silent wrong guess.
- When I ask a question, answer it directly and concisely. Do not implement without being asked.
- Skip filler ("You're absolutely right", "Great point") — get straight to the substance. If you agree with something I said, show it through your response rather than stating it.
- Verify before assuming: check whether functionality already exists before implementing it anew.
- Delegate to parallel subagents when work fans out across independent items (searching several areas of the codebase, reading many files). Work directly for single-file or sequential operations.
- Build, lint, and test tasks must never run in parallel.

## 📌 Important Reminders

- In template strings, numbers must be formatted with `.toFixed()` (not `String(number)`)
- For stories, follow the workflow in `docs/README.workflow.md`
- Use your built-in tools to write files, not bash commands

## 🐛 Self-Improvement

When you notice a bug (even if unrelated to the current work): fix it directly if it blocks the current story, otherwise document it in `docs/working/issues.md` to be resolved later.

## 🌿 Git Workflow

- Always sign commits. If signing fails, stop and wait for me to resolve it — never bypass with `--no-gpg-sign` unless I explicitly say so.
- Never run destructive git operations (`git reset --hard`, `rm` on tracked files, `git checkout`/`git restore` to an older commit) without an explicit written instruction in this conversation. _(When working within Cursor or Codex Web, these git limitations do not apply; use the tooling's capabilities as needed.)_
- Never edit `.env` or other environment variable files — only I change those.
- Other agents may be working in this repo in parallel. Never revert, restore, or delete files you didn't author — especially not to silence a local type/lint error; ask first instead. Deleting files that your own changes made obsolete (refactors, feature removals) is fine, as is moving and renaming.
- Commit only when asked, and double-check `git status` first. Keep commits atomic: commit only the files you touched and list each path explicitly (`git commit -m "<scoped message>" -- path/to/file1 path/to/file2`; for brand-new files: `git restore --staged :/ && git add "path/to/file1" && git commit -m "<scoped message>" -- path/to/file1`). Quote paths containing brackets or parentheses so the shell doesn't expand them.
- For `git rebase`, export `GIT_EDITOR=:` and `GIT_SEQUENCE_EDITOR=:` so no editor opens. Never amend commits without explicit written approval.
