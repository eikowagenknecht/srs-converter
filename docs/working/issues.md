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

All issues below were found by the 2026-07-10 round-trip fidelity audit.
Full analysis, executed repros, and a field-by-field mapping table:
`docs/working/audit-2026-07-10-roundtrip.md` (finding numbers F1–F18, S1–S5
referenced below).

Fixes for all of these have been agreed with the maintainer and are specified
in `docs/working/fixplan-2026-07-10.md` (work packages WP1–WP7 with a
findings→WP mapping, decision log, and per-WP acceptance criteria). The
executable repro harness is preserved in
`docs/working/audit-2026-07-10-repros.md`. Remove entries here as the
corresponding work packages complete.

### (2026-07-10) Docs reference non-existent exportToAnkiFile method (Priority: Low)

**Problem:** `docs/usage/converting/srs-to-anki.md` examples call `ankiResult.data.exportToAnkiFile(...)`; the actual method is `toAnkiExport`.
**Impact:** Copy-pasted example code fails at runtime.
