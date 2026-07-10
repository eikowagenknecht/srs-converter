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

### (2026-07-10) All media files silently dropped in Anki→SRS→Anki round-trip (Priority: High)

**Problem:** `SrsPackage` has no media representation; `toSrsPackage` ignores `mediaFiles`; `fromSrsPackage` builds on `fromDefault()` (empty media).
**Steps to reproduce:** Round-trip a package with media → output zip contains no media entries, manifest is `{}`; no warning. (Audit F3)
**Impact:** Every `<img>`/`[sound:]` reference in the output is broken. Contradicts README "Media Files: Full".

### (2026-07-10) SRS→Anki writes fieldValues by position, ignoring field names (Priority: High)

**Problem:** `anki-package.ts:927` joins `fieldValues` in array order; `createNote` (`srs-package.ts:327-335`) validates names only as a set, so out-of-order input passes.
**Steps to reproduce:** `createNote({fieldValues: [["Back","b"],["Front","f"]]}, noteType)` → `flds === "b\x1ff"` — Front shows the Back content. Status success. (Audit F8)
**Impact:** Silent content swap for SRS-authored packages (documented, supported flow).
**Notes:** Fix: sort `fieldValues` by `noteType.fields` order before joining.

### (2026-07-10) BasicAndReverseNote constant: reverse template is not reversed (Priority: High)

**Problem:** In `srs-package.ts:382-403` both templates have `questionTemplate: "{{Front}}"`, `answerTemplate: "{{Back}}"`. The second ("Back > Front") should be swapped.
**Steps to reproduce:** Inspect the constant or build a package with it: two identical Front→Back cards. (Audit F10)
**Impact:** Users of the shipped constant never get a reverse card.
**Notes:** `constants.ts` `basicAndReversedCardModel` has the correct swapped templates — copy from there.

### (2026-07-10) Empty decks and card-less notes silently removed with status success (Priority: Medium)

**Problem:** `removeUnused()` (`srs-package.ts:139-151`) is called in both `toSrsPackage` (`anki-package.ts:1766`) and `fromSrsPackage` (`anki-package.ts:778`) and drops decks without notes and notes without cards — no issue is emitted.
**Steps to reproduce:** `toSrsPackage` on `tests/fixtures/anki/mixed-legacy-2.apkg` (2 decks) returns 1 deck, status success, issues []. SRS package with 2 notes / 1 card converts to 1 note, status success. (Audit F15)
**Impact:** Empty decks (incl. structural parent decks) and card-less notes vanish silently.
**Notes:** Should at least emit a warning issue per removed entity.

### (2026-07-10) Reviews with identical timestamps crash export with UNIQUE constraint (Priority: Medium)

**Problem:** Review IDs get no collision-bumping (unlike decks/note types/notes/cards, `anki-package.ts:1120-1136`); `revlog.id` is the primary key.
**Steps to reproduce:** Two `createReview` with the same ms timestamp → `fromSrsPackage` succeeds (both id = timestamp) → `toAnkiExport` throws `UNIQUE constraint failed: revlog.id`. (Audit F16)
**Impact:** Deferred crash after conversion reported success; realistic for sources with second-granularity review timestamps.

### (2026-07-10) extractTimestampFromUuid accepts non-UUID ids and produces tiny collision-prone Anki ids (Priority: Low, suspected)

**Problem:** `util.ts:89-97` hex-parses the first 12 chars of any string; `"deck-1"` → `parseInt("deck1",16)` = 3564. SRS ids are not validated as UUIDv7.
**Impact:** Hand-authored SRS ids yield near-constant Anki ids; collisions are only mitigated per entity type by the increment loop. (Audit S5)

### (2026-07-10) Docs reference non-existent exportToAnkiFile method (Priority: Low)

**Problem:** `docs/usage/converting/srs-to-anki.md` examples call `ankiResult.data.exportToAnkiFile(...)`; the actual method is `toAnkiExport`.
**Impact:** Copy-pasted example code fails at runtime.
