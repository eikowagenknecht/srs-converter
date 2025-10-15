# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Onboarding

At the start of each session, read:

1. The main `README.md` for project overview
2. Any `docs/README.*.md` files for detailed development information

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

- You (Claude) should extensively use subagents for tasks that can be run in parallel. Build / Lint / Test tasks may **NOT** be run in parallel, though.
- Before making changes, search the codebase using parallel subagents.
- Don't assume an item is not implemented.
- Use the TodoWrite whereever possible to track your progress.

## Communication

When I ask a question, you (Claude) should answer it directly and concisely. You should **NOT** jump to implementation without being asked to do so.

## Common Pitfalls and Reminders

- When using template strings, numbers **must** be formatted with .toFixed() (NOT String(number))
- For Stories follow the exact workflow from `docs/README.workflow.md`

## Self-Improvement

For any bugs you notice (even if the bug is unrelated to the current piece of work), it's important to either:

1. Resolve them directly if they block the current story or
2. Document them in `docs/working/issues.md` to be resolved later (using a subagent).
