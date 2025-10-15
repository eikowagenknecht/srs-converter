# Development Workflow

This document outlines the development workflow for srs-converter.

> [!important]
> This workflow is mainly designed to guide AI agents.
>
> If you are a human reading this, please don't take it too literally and adapt as needed.

## Overview

srs-converter uses a story-driven development approach where features are implemented as discrete user stories with clear acceptance criteria and testing requirements.

**Key Principles:**

- Work one story at a time, start to finish
- Always test before marking complete
- Get project maintainer verification for all user-facing changes
- Update documentation as you go

## Quick Start

1. **Pick a story** from `docs/stories/README.md` (look for ⏳ Pending status)
2. **Plan your approach** (2-3 bullet points)
3. **Get approval** from project maintainer
4. **Implement** following the detailed workflow below
5. **Test** and request verification from project maintainer
6. **Mark complete** and move to next story

## Detailed Workflow

### Step 1: Story Selection & Planning

**What to do:**

- Open `docs/stories/README.md`
- Find the next story with ⏳ **Pending** status
- Read the story description and acceptance criteria
- Create a brief implementation plan (2-3 bullet points)

Get plan approved by project maintainer before proceeding.

**Example plan:**

```plaintext
Story 1.2.3: Add Mnemosyne Format Support
Plan:
- Implement MnemosynePackage class with fromFile() method
- Add data parsing for Mnemosyne .db format
- Create conversion to universal SRS format
```

### Step 2: Implementation Preparation

**What to do:**

- Update story status to 🔄 **In Progress** in `docs/stories/README.md`
- If you haven't done so alreay, read the project README files instructions in `docs/README.**.md`
- Read any existing related files to understand the current implementation

**For AI agents:** Use the TodoWrite tool to create detailed implementation checklist.

### Step 3: Implementation

**Coding Guidelines:**

- Follow the architecture and guidelines layed out in `docs/README.architecture.md`, existing code patterns and conventions
- Write clean, self-documenting code
- Handle errors gracefully
- Keep functions small and focused
- Note any changes you would want to make to the documentation (`README` files) in `docs/working/pending.md`
- Document any bugs found that were not introduced by this story in `docs/working/issues.md`

**Key Files to Check:**

- `package.json` - Available dependencies and scripts
- `docs/README.architecture.md` - Architecture decisions
- `docs/decisions/` - ADRs for context

### Step 4: Testing & Verification

Run all quality gates and build verification as specified in [README.testing.md](README.testing.md).

**If any tests fail:** Fix the issues and re-run until all pass.

### Step 5: Project Maintainer Verification Request

**Required format for verification request:**

```markdown
## Story X.Y Implementation Complete!

**Changes made:**

- [Bulleted list of key changes]
- [What files were modified]
- [New features/functionality added]

**Please verify the implementation:**

- [Specific steps to test the functionality]
- [Expected behavior/output]

**Expected results:**

- [What should happen if working correctly]
- [Any specific UI changes to look for]

**Ready for your verification!**
```

### Step 6: Project Maintainer Testing & Response

**Project maintainer should:**

- Follow the provided test steps
- Verify acceptance criteria are met
- Respond with either:
  - "Perfect! That worked!" (or similar approval)
  - Describe specific issues found

**If issues are found:**

- Return to Step 3 (Implementation)
- Fix the reported issues
- Re-run Step 4 (Testing)
- Submit new verification request

### Step 7: Documentation Updates

Write up any changes you want to make to the documentation and present them to the project maintainer for approval:

- Take into account the notes you made in `docs/working/pending.md` during implementation.
- Make sure that all README.\* files including examples, usage instructions, and architecture docs reflect the new changes.
- If any examples were added or modified, make sure they pass teh automated tests.

After the project maintainer approves the documentation changes, update the relevant files.

### Step 8: Story Completion

Before marking any story complete, verify:

- [ ] All acceptance criteria met
- [ ] All quality gates pass (`type-check`, `format`, `lint`, `test`)
- [ ] No new console errors or warnings
- [ ] Code follows project conventions
- [ ] Project maintainer verification completed successfully
- [ ] Relevant documentation updates suggested and implemented if approved
- [ ] That there are no leftover files artifacts from development (e.g. debug code, console logs). Use git status to check this.

Ask the project maintainer for final approval to mark the story as complete. If given:

- Mark story as ✅ **Completed** in `docs/stories/README.md` and update the contents of this story document to reflect the completed work.

## Emergency Procedures

### Story Too Complex

**Problem:** Story cannot be completed in reasonable time or becomes unwieldy.

**Solution:**

1. Break story into smaller sub-stories
2. Get project maintainer approval for the breakdown approach
3. Create individual stories documents in `docs/stories/README.md` for each sub-task
4. Complete sub-stories one by one

### Architecture Changes Needed

**Problem:** Implementation requires significant changes to existing architecture.

**Solution:**

1. Document the proposed change and rationale
2. Create new ADR in `docs/decisions/`
3. Get approval before making major changes
4. Update `docs/README.architecture.md` after implementation

### Technical Roadblock

**Problem:** Stuck on technical issue that blocks progress.

**Solution:**

1. Document the issue in `docs/working/issues.md`
2. Research 2-3 alternative approaches
3. Ask project maintainer for guidance

## Success Metrics

**Story completion should achieve:**

- 100% build success rate (all quality gates pass)
- All acceptance criteria met
- Clean human verification (no issues found)
- Complete documentation updates
- Effective knowledge capture

## Communication Patterns

**Starting a story:**

- "Ready for Story X.Y: [Title]. My plan: [brief plan]. Does this approach sound good?"

**During implementation:**

- Work through implementation, testing, and verification systematically
- Keep progress updates in TodoWrite tool (AI agents)

**Requesting verification:**

- Use the required format above with specific testing instructions

**After completion:**

- "Great! Story X.Y complete. Moving to next story..."

---

This workflow ensures consistent quality, proper testing, and effective collaboration between agents / developers and project maintainers while maintaining clear progress tracking and knowledge capture.
