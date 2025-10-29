# Known Issues & Bugs

This file tracks bugs and technical issues discovered during development that need to be resolved later.
We're keeping this as a simple living markdown document for now.
When the project matures, we may switch to a more formal issue tracking system like GitHub Issues.

## Usage

When you discover a bug or technical issue during development, add it to the "Current Issues" section below using the format from the "Format Example".
When the issue is resolved, remove it from the "Current Issues" section again.

## Format Example

```markdown
### (YYYY-MM-DD) Issue Title (Priority: High/Medium/Low)

**Problem:** Clear description of the issue
**Steps to reproduce:** (if applicable)
**Impact:** Description of impact
**Notes:** Additional context or dependencies
```

---

## Current Issues

### (2025-10-29) Flaky test in util.test.ts - "should cleanup output stream on error" (Priority: Low)

**Problem:** Test `createSelectiveZip archiver warning handling > should cleanup output stream on error` in src/anki/util.test.ts consistently fails with "expected undefined to be defined"

**Steps to reproduce:**

1. Run `pnpm test src/anki/util.test.ts`
2. Test at line 231 fails with assertion error

**Impact:** Low - does not affect functionality, only test reliability. All other tests pass (47/48 in util.test.ts pass). This test appears to be checking error cleanup paths.

**Notes:** Discovered during Story 1.1.6.3 implementation. Not introduced by media file removal API changes. Test failure is consistent across multiple runs.
