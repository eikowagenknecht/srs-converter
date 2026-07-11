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

### (2026-07-11) Filtered decks do not survive the SRS crossing (Priority: Low)

**Problem:** Filtered (dyn) decks are pruned by deck validation during Anki → SRS conversion, so they are absent from round-trip outputs. Cards keep their scheduling state and original-deck assignment (`odid`/`odue` travel in the card blobs), so no study data is lost — only the ephemeral study view itself.
**Impact:** A user re-importing a round-tripped collection has to rebuild their filtered decks. Real-Anki verification (`scripts/anki-fixtures/compare.py`) reports this informationally.
**Notes:** Filtered decks are ephemeral by design in Anki (emptying one returns all cards). Modeling them universally is ADR-0008 territory; revisit with Phase 5 implementation alignment.

### (2026-07-11) Review validation drops ease-0 reschedule revlog rows (Priority: Medium)

**Problem:** The Anki→SRS review conversion drops revlog rows with `ease` 0, which is the value Anki uses for manual-reschedule (type 4) and FSRS-reschedule (type 5) entries (2 of 9 rows in the fixture corpus). Package-level round trips (AnkiPackage → AnkiPackage) keep all rows — verified against real Anki — the loss happens only when crossing through `toSrsPackage`.
**Steps to reproduce:** Read `tests/fixtures/anki/corpus/corpus-v3.apkg` and count `srsPackage.getReviews()` — 7 instead of 9 (see the assertion note in `src/anki/anki-package.modern.test.ts`).
**Impact:** FSRS re-optimization in Anki after a round trip sees an incomplete review history; `docs/formats/anki.md` §Revlog explicitly requires preserving all rows including types 4/5.
**Notes:** Surfaced by the Phase 1.3 fixture corpus; pre-existing behavior, not introduced by the modern reader. Fix belongs with ADR-0004 (review log as scheduling source of truth) work.

The 2026-07-10 round-trip fidelity audit (findings F1–F18, S1–S5) has been fully
resolved by work packages WP1–WP7 in `docs/working/fixplan-2026-07-10.md`. The
full analysis and the executable repro harness are retained for reference in
`docs/working/audit-2026-07-10-roundtrip.md` and
`docs/working/audit-2026-07-10-repros.md`.
