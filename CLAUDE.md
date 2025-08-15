# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Onboarding

At the start of each session, read:

1. The main `README.md` for project overview
2. Any `docs/README.*.md` files for detailed development information

## ✅ Quality Gates

This is EXTREMELY IMPORTANT!

After writing code, Claude must run these commands.
When one of these commands fails, Claude must iterate on the issue and run the command again until it passes.

1. `pnpm type-check`
2. `pnpm format`
3. `pnpm lint`
4. `pnpm test`

This also means that you don't have to format code manually.
The commands will take care of that.

## Settings

Claude may use up 10 subagents for tasks that can be run in parallel.
Build / Lint / Test tasks may **NOT** be run in parallel.
Before making changes, search the codebase using parallel subagents.
Don't assume an item is not implemented.
Think hard.

## Common Pitfalls and Reminders

- When using template strings, numbers **must** be formatted with .toFixed() (NOT String(number))
- For Stories:
  - Always use the TodoWrite tool to track story progress.
  - Follow the exact verification format from `docs/README.workflow.md`
- After you're done, think if the documentation needs to be updated. If you think so, write the changed you think should be made to `docs/working/pending.md` with a short description of the change and why it is needed.

## Self-Improvement

For any bugs you notice (even if the bug is unrelated to the current piece of work), it's important to either:

1. Resolve them directly or
2. Document them in `docs/working/issues.md` to be resolved later (using a subagent).
