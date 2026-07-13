# Development Workflow

This document outlines the story-driven development workflow for srs-converter.

> [!important]
> This workflow is mainly designed to guide AI agents.
>
> If you are a human reading this, please don't take it too literally and adapt as needed.

> [!note]
> **For AI agents**: Scale ceremony to complexity — a simple change needs a two-line plan, a complex feature deserves thorough analysis. The approval gates below are fixed; everything else is judgment.

## Principles

- Work one story at a time, start to finish.
- Understand before implementing: read the story, its acceptance criteria, and the relevant code and docs first. The more completely the task is understood up front, the better the result.
- The maintainer stays in the loop: plan approval before implementation, verification before completion. When in doubt at any point, ask — one question too many is better than a wrong guess.
- Quality gates must pass before anything is considered done (enforced by a Stop hook; see `CLAUDE.md` and [README.testing.md](README.testing.md)).

## The Loop

### 1. Pick and plan

- Take the next ⏳ **Pending** story from `docs/stories/README.md` (or the one the maintainer names).
- Read the story description and acceptance criteria. Read related code, `docs/README.architecture.md`, and relevant ADRs in `docs/decisions/` until the current state is clear.
- Present an implementation plan scaled to the task and **get maintainer approval before implementing**. Plan mode is a good fit for this step.
- Set the story to 🔄 **In Progress** in `docs/stories/README.md`.

### 2. Implement

- Follow the architecture laid out in `docs/README.architecture.md` and existing code patterns and conventions.
- Write clean, self-documenting code; handle errors gracefully; keep functions small and focused.
- Note documentation changes you'll want to make as GitHub issues (`gh issue create --label documentation`, following the docs-change issue template); file unrelated bugs as GitHub issues (`--label bug --label agent-found`, following the bug-report template).
- Run the quality gates while iterating; all of them must pass before moving on.

### 3. Request verification

Every user-facing change needs maintainer verification. The verification request must contain:

- **What changed** — key changes, modified files, new functionality
- **How to test it** — concrete steps the maintainer can follow
- **Expected results** — what should happen if everything works

If the maintainer reports issues: fix them, re-run the gates, and request verification again.

### 4. Update documentation

Propose documentation updates and apply them once approved:

- Work from the open `documentation`-labeled GitHub issues (`gh issue list --label documentation`); close each one (`fixes #<n>` in the commit or `gh issue close`) when its change lands.
- Make sure all `README.*` files — examples, usage instructions, architecture docs — reflect the changes.
- Modified or added examples must pass the automated tests.

### 5. Complete

Before asking the maintainer for final approval to mark a story complete, verify:

- [ ] All acceptance criteria met
- [ ] All quality gates pass
- [ ] No new console errors or warnings
- [ ] Code follows project conventions
- [ ] Maintainer verification completed successfully
- [ ] Documentation updates proposed and, if approved, implemented
- [ ] No leftover development artifacts (debug code, console logs, stray files — check `git status`)

Once approved, mark the story ✅ **Completed** in `docs/stories/README.md` and update the story document to reflect the completed work.

## Handling Complications

- **Story too complex** — propose a breakdown into smaller sub-stories and agree on it with the maintainer before proceeding.
- **Architecture change needed** — document the proposed change and rationale, create an ADR in `docs/decisions/` for major decisions, get approval before sweeping changes, and update `docs/README.architecture.md` after implementation.
- **Technical roadblock** — file a GitHub issue describing it, research alternative approaches, and ask the maintainer for guidance.
