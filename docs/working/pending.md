# Pending Documentation Updates

This file tracks documentation changes that need to be made to keep the project documentation current and accurate.
We're keeping this as a simple living markdown document for now.
When the project matures, we may switch to a more formal tracking system like GitHub Issues.

## Usage

When you identify documentation that needs to be updated, add it to the "Pending Changes" section below using the format from the example.
When the changes are implemented, delete it from "Pending Changes" section.

## Guidelines

- Prioritize changes that affect user onboarding or development workflow
- Consider if changes warrant a new ADR in `docs/decisions/`

## Format Example

```markdown
### (YYYY-MM-DD) Documentation Update Title (Priority: High/Medium/Low)

**File(s):** Path to file(s) that need updating
**Changes needed:** Clear description of what needs to change
**Reason:** Why this change is needed
**Notes:** Additional context or dependencies
```

---

## Pending Changes

### (2026-07-11) Document the worktree-based multi-agent workflow (Priority: Medium)

**File(s):** docs/README.workflow.md, docs/README.git.md
**Changes needed:** Document the Claude Code worktree workflow ported from the openrift repo: agents make all code changes in worktrees under `.claude/worktrees/` (via the `EnterWorktree` tool), setup is automated by `.claude/hooks/setup-worktree.sh` (background pnpm install), maintainer verification runs from the worktree path, and work lands on main as a squash-merge via the `/done` and `/merge` commands (`.claude/scripts/merge-branch.sh`). Note that the squash commit is what semantic-release reads for releases/changelog.
**Reason:** README.workflow.md and README.git.md still describe working directly on main; the new workflow (added 2026-07-11) is currently only documented in CLAUDE.md.
