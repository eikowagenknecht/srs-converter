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

### (2026-07-10) Card scheduling state silently reset in Anki→SRS→Anki round-trip (Priority: High)

**Problem:** `toSrsPackage` captures only `due`/`queue`/`type` into `applicationSpecificData` (`anki-package.ts:1647-1658`) and never captures `ivl`, `factor`, `reps`, `lapses`, `left`, `odue`, `odid`, `flags`, `mod`. `fromSrsPackage` hardcodes all of them (including the three that were stored) to 0 (`anki-package.ts:1052-1071`).
**Steps to reproduce:** Round-trip any package with a reviewed card (e.g. `type 2, queue 2, due 150, ivl 30, factor 2600, reps 10, lapses 2, flags 1`) → output card is all zeros; suspended cards (`queue -1`) come back unsuspended. Status is `success`, issues empty. (Audit F1)
**Impact:** Complete loss of scheduling history, suspensions, buries, flags, and filtered-deck state for every card — silently. Contradicts README "Cards: Full" and "Round-trip: Working".
**Notes:** Restore path for `ankiDue`/`ankiQueue`/`ankiType` was never implemented; the remaining columns need to be captured first. Must be fixed together with `col.crt` (see collection-defaults issue) because review `due` is relative to `crt`.

### (2026-07-10) Review log fields zeroed in round-trip (Priority: High)

**Problem:** Reviews keep only timestamp and ease. `toSrsPackage` (`anki-package.ts:1741-1748`) drops `ivl`, `lastIvl`, `factor`, `time`, `type`; `fromSrsPackage` writes them as 0 (`anki-package.ts:1125-1135`, has a TODO).
**Steps to reproduce:** Round-trip a revlog row `{ivl:30,lastIvl:15,factor:2600,time:4500,type:1}` → `{0,0,0,0,0}`. (Audit F2)
**Impact:** Review history unusable for statistics/FSRS after round-trip; silent. Contradicts README "Review History: Full".

### (2026-07-10) All media files silently dropped in Anki→SRS→Anki round-trip (Priority: High)

**Problem:** `SrsPackage` has no media representation; `toSrsPackage` ignores `mediaFiles`; `fromSrsPackage` builds on `fromDefault()` (empty media).
**Steps to reproduce:** Round-trip a package with media → output zip contains no media entries, manifest is `{}`; no warning. (Audit F3)
**Impact:** Every `<img>`/`[sound:]` reference in the output is broken. Contradicts README "Media Files: Full".

### (2026-07-10) Note GUIDs regenerated instead of restored (Priority: High)

**Problem:** `fromSrsPackage` writes `guid: guid64()` (`anki-package.ts:922`) although the original guid is captured as `ankiGuid` (`anki-package.ts:1615`).
**Steps to reproduce:** Round-trip a note with guid `ABCdef1234` → new random guid. (Audit F4)
**Impact:** Re-importing the round-tripped package duplicates every note instead of updating; sync identity broken. Silent.

### (2026-07-10) Note tags dropped in round-trip (Priority: High)

**Problem:** `fromSrsPackage` writes `tags: ""` (`anki-package.ts:926`); captured `ankiTags` never restored; universal format's `tags` field is commented out (`srs-package.ts:173-175`).
**Steps to reproduce:** Round-trip a note with tags → empty tags. (Audit F5)
**Impact:** Silent tag loss. Contradicts README "Notes: Full (… tags …)".

### (2026-07-10) SRS→Anki writes fieldValues by position, ignoring field names (Priority: High)

**Problem:** `anki-package.ts:927` joins `fieldValues` in array order; `createNote` (`srs-package.ts:327-335`) validates names only as a set, so out-of-order input passes.
**Steps to reproduce:** `createNote({fieldValues: [["Back","b"],["Front","f"]]}, noteType)` → `flds === "b\x1ff"` — Front shows the Back content. Status success. (Audit F8)
**Impact:** Silent content swap for SRS-authored packages (documented, supported flow).
**Notes:** Fix: sort `fieldValues` by `noteType.fields` order before joining.

### (2026-07-10) Cloze cards silently dropped when cloze content contains "}" (Priority: High)

**Problem:** `analyzeClozeOrdinals` regex `\{\{c(\d+)::[^}]*\}\}` (`anki-package.ts:343`) cannot match `}` inside the cloze body; Anki's own pattern is non-greedy `.*?`.
**Steps to reproduce:** SRS→Anki with cloze content `{{c1::\(x^{2}\)}}` (any MathJax with braces) → zero cards generated, orphan note written, status success, no issues. In a full round-trip a two-card cloze note came back with one card. (Audit F9)
**Impact:** Silent card loss for a very common cloze pattern (math).

### (2026-07-10) BasicAndReverseNote constant: reverse template is not reversed (Priority: High)

**Problem:** In `srs-package.ts:382-403` both templates have `questionTemplate: "{{Front}}"`, `answerTemplate: "{{Back}}"`. The second ("Back > Front") should be swapped.
**Steps to reproduce:** Inspect the constant or build a package with it: two identical Front→Back cards. (Audit F10)
**Impact:** Users of the shipped constant never get a reverse card.
**Notes:** `constants.ts` `basicAndReversedCardModel` has the correct swapped templates — copy from there.

### (2026-07-10) Note type internals replaced by hardcoded defaults in round-trip (Priority: Medium)

**Problem:** `toSrsPackage` keeps only name/fields/templates(qfmt,afmt) (`anki-package.ts:1524-1554`); `fromSrsPackage` rebuilds everything else from constants (`anki-package.ts:852-894`): css, latexPre/Post, latexsvg, sortf, req, originalStockKind, template bqfmt/bafmt/deck-override/bfont/bsize, all field props (font/size/rtl/sticky/plainText/…), template/field 64-bit ids, and unknown plugin keys on the model.
**Steps to reproduce:** Round-trip a model with custom css/`sortf:1`/`bqfmt`/`font:"Courier"` → all reset to defaults. (Audit F11)
**Impact:** Custom styling and note-type configuration silently lost; model-level plugin data dropped (contradicts "Plugin Data: Full" for round-trips).
**Notes:** `ankiTemplateData` is captured but never restored — the restore half was never implemented. Cloze `type` is re-derived via a `{{cloze:` substring heuristic.

### (2026-07-10) Deck properties reset and custom deck presets (dconf) dropped in round-trip (Priority: Medium)

**Problem:** `fromSrsPackage` rebuilds decks with defaults (`anki-package.ts:803-824`): `conf:1`, limits null, counters zeroed, `dyn:0`; `col.dconf` is never converted, so custom presets vanish. Captured `ankiDeckData` never restored.
**Steps to reproduce:** Round-trip a deck with `conf:7` + custom preset 7 → deck points at default preset 1; preset 7 gone. (Audit F12)
**Impact:** All deck options (learning steps, daily limits, FSRS weights, leech settings) silently lost; filtered decks become static.

### (2026-07-10) Collection metadata (crt, conf, tags, graves) replaced by defaults in round-trip (Priority: Medium)

**Problem:** `fromSrsPackage` starts from `fromDefault()`; `toSrsPackage` never captures `col`. `crt`, `conf` (incl. `creationOffset` and plugin keys), `col.tags`, and the `graves` table are all replaced/dropped.
**Steps to reproduce:** Round-trip → `crt` becomes `1681178400`, custom conf keys gone, graves empty. (Audit F13)
**Impact:** `crt` anchors review due-days — any future fix restoring card `due` must restore `crt` too, or all due dates shift. Sync tombstones lost.

### (2026-07-10) csum written as 0; note mod/usn/flags zeroed on SRS→Anki (Priority: Medium)

**Problem:** `anki-package.ts:924-931` writes `csum: 0` (TODO in code), `mod: 0`, `usn: 0`, `flags: 0`.
**Steps to reproduce:** Round-trip any note. (Audit F14)
**Impact:** Anki duplicate detection (sha1-based `csum`) sees wrong values until "Check Database" recomputes; note modification timestamps lost (contradicts README).
**Notes:** csum = first 8 hex digits of SHA1 of the HTML-stripped first field.

### (2026-07-10) Empty decks and card-less notes silently removed with status success (Priority: Medium)

**Problem:** `removeUnused()` (`srs-package.ts:139-151`) is called in both `toSrsPackage` (`anki-package.ts:1766`) and `fromSrsPackage` (`anki-package.ts:778`) and drops decks without notes and notes without cards — no issue is emitted.
**Steps to reproduce:** `toSrsPackage` on `tests/fixtures/anki/mixed-legacy-2.apkg` (2 decks) returns 1 deck, status success, issues []. SRS package with 2 notes / 1 card converts to 1 note, status success. (Audit F15)
**Impact:** Empty decks (incl. structural parent decks) and card-less notes vanish silently.
**Notes:** Should at least emit a warning issue per removed entity.

### (2026-07-10) Reviews with identical timestamps crash export with UNIQUE constraint (Priority: Medium)

**Problem:** Review IDs get no collision-bumping (unlike decks/note types/notes/cards, `anki-package.ts:1120-1136`); `revlog.id` is the primary key.
**Steps to reproduce:** Two `createReview` with the same ms timestamp → `fromSrsPackage` succeeds (both id = timestamp) → `toAnkiExport` throws `UNIQUE constraint failed: revlog.id`. (Audit F16)
**Impact:** Deferred crash after conversion reported success; realistic for sources with second-granularity review timestamps.

### (2026-07-10) sfld rebuilt from raw first field (HTML kept, sortf ignored) (Priority: Low)

**Problem:** `anki-package.ts:928` uses `fieldValues[0]` verbatim; Anki uses the `sortf`-selected field, HTML-stripped. Original `sfld` is discarded on Anki→SRS.
**Impact:** Browse-view sort order differs from native collections. (Audit F17)

### (2026-07-10) req and originalStockKind hardcoded on SRS→Anki (Priority: Low)

**Problem:** `anki-package.ts:892-893` writes `req: [[0,"any",[0]]]` regardless of template count and `originalStockKind: 1` even for cloze note types.
**Impact:** Old 2.1.x clients (the target of Legacy 2) read `req`; "restore to default" uses originalStockKind. (Audit F18)

### (2026-07-10) Cloze regeneration fabricates cards / can misattach reviews (Priority: Medium, suspected)

**Problem:** `anki-package.ts:1018-1029` clones the note's first card for every content ordinal lacking an SRS card; `cardIDs.set(srsCard.id, …)` (`:1050`) overwrites when one SRS card maps to several ordinals, so its reviews attach only to the last generated card.
**Impact:** Fabricated cards; review history attached to the wrong card. Code-reading finding (audit S1), no repro executed.

### (2026-07-10) Cloze ordinals scanned across all fields, not just cloze-templated fields (Priority: Low, suspected)

**Problem:** `anki-package.ts:1014` joins all field values before scanning for `{{cN::…}}`; Anki only generates cards from fields referenced by `{{cloze:Field}}` in the template.
**Impact:** Cloze-looking text in an "Extra" field fabricates an extra card on SRS→Anki. (Audit S2)

### (2026-07-10) Field/template ord ignored when converting note types (Priority: Low, suspected)

**Problem:** `toSrsPackage` maps `flds`/`tmpls` by array index (`anki-package.ts:1531,1542,1606`) instead of their `ord` property.
**Impact:** A model whose arrays are stored out of `ord` order (legal JSON) gets every field value and card silently attached to the wrong field/template. (Audit S3)

### (2026-07-10) extractTimestampFromUuid accepts non-UUID ids and produces tiny collision-prone Anki ids (Priority: Low, suspected)

**Problem:** `util.ts:89-97` hex-parses the first 12 chars of any string; `"deck-1"` → `parseInt("deck1",16)` = 3564. SRS ids are not validated as UUIDv7.
**Impact:** Hand-authored SRS ids yield near-constant Anki ids; collisions are only mitigated per entity type by the increment loop. (Audit S5)

### (2026-07-10) Docs reference non-existent exportToAnkiFile method (Priority: Low)

**Problem:** `docs/usage/converting/srs-to-anki.md` examples call `ankiResult.data.exportToAnkiFile(...)`; the actual method is `toAnkiExport`.
**Impact:** Copy-pasted example code fails at runtime.
