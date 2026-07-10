# Adversarial Round-Trip Fidelity Audit: Anki ↔ Universal SRS (2026-07-10)

Audit of silent data loss/corruption across the four paths: read (`.apkg` →
internal model), convert (internal ↔ `SrsPackage`), write (internal →
`.apkg`), and full round-trip. All findings below marked **CONFIRMED** were
proven by execution: a hand-built adversarial legacy-v2 `.apkg` (plus the real
`tests/fixtures/anki/mixed-legacy-2.apkg`) was pushed through the relevant
path and the output SQLite/zip contents were diffed against ground truth
(read back with `sql.js`/`unzipper` directly, bypassing the library).
Repro scripts were run from a scratch directory via vitest with the repo's
`@` alias; they are not part of the test suite. Each finding includes a
minimal inline repro.

Every conversion step in the main round-trip repro reported
`status: "success"` with an **empty issues array** — none of the losses below
is surfaced to the caller.

## Summary (ranked by severity)

| #   | Severity | Class                  | Path                                   | Finding                                                                                                                                               | Status    |
| --- | -------- | ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| F1  | Critical | Data loss              | Anki→SRS→Anki                          | Entire card scheduling state reset to "new" (due, ivl, factor, reps, lapses, left, queue incl. suspended/buried, type, odid/odue, flags, mod)         | CONFIRMED |
| F2  | Critical | Data loss              | Anki→SRS→Anki                          | Review log gutted: ivl, lastIvl, factor, time, type all written as 0                                                                                  | CONFIRMED |
| F3  | Critical | Data loss              | Anki→SRS→Anki                          | All media files silently dropped (universal format has no media model)                                                                                | CONFIRMED |
| F4  | High     | Data loss              | Anki→SRS→Anki                          | Note GUIDs regenerated instead of restored — breaks Anki sync/dedup/re-import                                                                         | CONFIRMED |
| F5  | High     | Data loss              | Anki→SRS→Anki                          | Note tags dropped (written back as `""`)                                                                                                              | CONFIRMED |
| F6  | High     | Corruption             | **every read**, incl. direct Anki→Anki | 64-bit template/field IDs in `col.models` lose precision (`parseWithBigInts` path bug)                                                                | CONFIRMED |
| F7  | High     | Corruption / data loss | **every read**                         | Digit-only _string_ values anywhere in `col.models` coerced to `Number`; a note type named `"007"` is dropped together with all its notes and cards   | CONFIRMED |
| F8  | High     | Corruption             | SRS→Anki                               | `fieldValues` written by array position; names ignored → silently swapped field content                                                               | CONFIRMED |
| F9  | High     | Data loss              | SRS→Anki                               | Cloze cards silently dropped when cloze content contains `}` (MathJax `x^{2}`, nested braces)                                                         | CONFIRMED |
| F10 | High     | Corruption             | shipped constant                       | `BasicAndReverseNote` "Back > Front" template is identical to "Front > Back" — reverse card never reversed                                            | CONFIRMED |
| F11 | Medium   | Data loss              | Anki→SRS→Anki                          | Note type internals replaced by hardcoded defaults (css, LaTeX, sortf, req, browser fmts, field props, plugin keys, template/field ids)               | CONFIRMED |
| F12 | Medium   | Data loss              | Anki→SRS→Anki                          | Deck properties reset; custom deck presets (`dconf`) dropped entirely                                                                                 | CONFIRMED |
| F13 | Medium   | Corruption             | Anki→SRS→Anki                          | `col` replaced by defaults: `crt` (due-day anchor), `conf` (incl. plugin keys), `tags`, `graves` tombstones                                           | CONFIRMED |
| F14 | Medium   | Data loss              | SRS→Anki                               | `csum` written as 0; note `mod`/`usn`/`flags` zeroed                                                                                                  | CONFIRMED |
| F15 | Medium   | Data loss              | Anki→SRS                               | Empty decks and card-less notes silently removed (`removeUnused`), status stays `success`                                                             | CONFIRMED |
| F16 | Medium   | Crash (late)           | SRS→Anki                               | Two reviews in the same millisecond → `UNIQUE constraint failed: revlog.id` at export time, after conversion reported success                         | CONFIRMED |
| F17 | Low      | Fidelity drift         | SRS→Anki                               | `sfld` rebuilt from raw first field: HTML not stripped, `sortf` ignored                                                                               | CONFIRMED |
| F18 | Low      | Fidelity drift         | SRS→Anki                               | `req` always `[[0,"any",[0]]]` regardless of template count; `originalStockKind` hardcoded to 1 (even for cloze)                                      | CONFIRMED |
| S1  | Medium   | Corruption             | SRS→Anki                               | Cloze regeneration fabricates cards for ordinals without an SRS card and can re-attach reviews to the wrong generated card                            | SUSPECTED |
| S2  | Low      | Corruption             | SRS→Anki                               | Cloze ordinals scanned across _all_ fields joined; clozes in fields not referenced by a `{{cloze:...}}` template still generate cards (Anki does not) | SUSPECTED |
| S3  | Low      | Corruption             | Anki→SRS                               | Fields/templates mapped by array index, `ord` ignored — mis-sorted `flds`/`tmpls` arrays remap content to wrong fields                                | SUSPECTED |
| S4  | Low      | Corruption             | write                                  | `serializeWithBigInts` marker collision: a string literally containing `__BIGINT__123__BIGINT__` is rewritten as a bare number                        | SUSPECTED |
| S5  | Low      | Corruption             | SRS→Anki                               | `extractTimestampFromUuid` on non-UUIDv7 ids parses arbitrary leading hex chars into a small "timestamp" id                                           | SUSPECTED |

The repro harness used throughout builds a single-deck `.apkg` (to satisfy the
one-deck limit of `fromSrsPackage`) with: a standard note type (2 templates,
custom css/LaTeX/`sortf: 1`/browser formats/field props/64-bit ids/plugin
key/a field named `"2024"`), a cloze note type, a tagged note with guid/csum/
flags/add-on data, a review card / an intraday learning card / a suspended
card / a card with `odid`/`odue`, three revlog rows with real values, a grave,
custom `conf`/`dconf`/`col.tags`, and two media files.

---

## F1 (Critical): Card scheduling state silently reset

**Locations:**

- `src/anki/anki-package.ts:1647-1658` — Anki→SRS captures only `due`,
  `queue`, `type` (as strings in `applicationSpecificData`) and `data`.
  `ivl`, `factor`, `reps`, `lapses`, `left`, `odue`, `odid`, `flags`, `mod`,
  `usn` are never captured — irrecoverably gone after this step.
- `src/anki/anki-package.ts:1052-1071` — SRS→Anki hardcodes
  `type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0,
odue: 0, odid: 0, flags: 0, mod: 0`. Even the values that _were_ stored
  (`ankiDue`, `ankiQueue`, `ankiType`) are never read back.

**Effect:** After a round-trip, every card is a brand-new card. A user with
years of scheduling history gets all intervals/ease factors erased, all
suspended (`queue = -1`) and buried (`-2`/`-3`) cards unsuspended, all flags
cleared, filtered-deck state (`odid`/`odue`) dropped. Nothing is reported —
`status` is `"success"` with zero issues.

**Repro (executed, passed):**

```ts
// source card: type 2, queue 2, due 150, ivl 30, factor 2600, reps 10, lapses 2, flags 1
const srs = expectSuccess(src.toSrsPackage());
const back = expectSuccess(await AnkiPackage.fromSrsPackage(srs));
await back.toAnkiExport(outPath);
// raw sql.js readback of output:
// {"type":0,"queue":0,"due":0,"ivl":0,"factor":0,"reps":0,"lapses":0,"flags":0,...}
```

Observed output row for card `1650000020000`:
`before: type 2, queue 2, due 150, ivl 30, factor 2600, reps 10, lapses 2, flags 1`
→ `after: all 0`. Suspended card `queue: -1` → `0`.

Note the README claims Cards: "✅ Full … due dates, intervals, ease factors"
and Round-trip "✅ Working".

## F2 (Critical): Review history reduced to timestamp + button

**Locations:**

- `src/anki/anki-package.ts:1741-1748` — Anki→SRS stores only `timestamp`
  (= revlog id), `score` (ease) and `originalAnkiId`. `ivl`, `lastIvl`,
  `factor`, `time`, `type`, `usn` never captured.
- `src/anki/anki-package.ts:1125-1135` — SRS→Anki writes
  `ivl: 0, lastIvl: 0, factor: 0, time: 0, type: 0` (has a TODO admitting it).

**Effect:** Review _rows_ survive, but their content is destroyed. Any
downstream consumer (FSRS optimization, statistics, learning-step
reconstruction) sees garbage: every review becomes a "learning review with
0-day interval, factor 0, 0 ms duration". README claims Review History:
"✅ Full — Complete review logs with timestamps and scores" — the scores and
timestamps are indeed the _only_ things preserved.

**Repro evidence:** source `{ivl: 30, lastIvl: 15, factor: 2600, time: 4500,
type: 1}` → output `{ivl: 0, lastIvl: 0, factor: 0, time: 0, type: 0}` for
review id `1650000030000` (id and `ease: 3` preserved).

## F3 (Critical): All media silently dropped in SRS round-trip

**Locations:**

- `src/anki/anki-package.ts:1488-1769` (`toSrsPackage`) — never touches
  `this.mediaFiles`; `SrsPackage` (`src/srs-package.ts`) has no media
  representation at all.
- `src/anki/anki-package.ts:757-772` (`fromSrsPackage`) — builds the result
  from `AnkiPackage.fromDefault()`, whose `mediaFiles` is `{}`.

**Effect:** Anki→SRS→Anki round-trip of a package with media produces an
output `.apkg` whose media manifest is `{}` and which contains no media
entries. Notes still reference `<img src=...>`/`[sound:...]` — all broken.
No warning of any kind. README claims Media Files: "✅ Full".

**Repro evidence:** source zip entries `["0","1","collection.anki21","media","meta"]`
with manifest `{"0":"image üñï.png","1":"sound.mp3"}` → output zip entries
`["collection.anki21","media","meta"]`, manifest `{}`.

## F4 (High): Note GUID regenerated instead of restored

**Location:** `src/anki/anki-package.ts:922` — `guid: guid64()` on SRS→Anki.
The original guid _is_ captured on Anki→SRS (`ankiGuid`,
`src/anki/anki-package.ts:1615`) but never read back.

**Effect:** Anki identifies notes across collections/syncs/re-imports by
`guid`. After a round-trip, re-importing the package into the original
collection **duplicates every note** instead of updating in place; AnkiWeb
sync identity is severed. Silent.

**Repro evidence:** source guid `"ABCdef1234"` → output guid `"c+;NHm}jZ8"`
(random, different every run).

## F5 (High): Note tags dropped

**Location:** `src/anki/anki-package.ts:926` — `tags: ""` hardcoded.
Captured as `ankiTags` at `src/anki/anki-package.ts:1616`, never restored.
The universal format's own `tags` field is commented out
(`src/srs-package.ts:173-175`).

**Repro evidence:** source `tags: " vocab important "` → output `""`.
README claims Notes: "✅ Full — … tags …".

## F6 (High): 64-bit template/field IDs corrupted on every read (`parseWithBigInts` never fires)

**Location:** `src/anki/util.ts:253-267` + `:388-430`, used at
`src/anki/database.ts:299` with paths `["tmpls[].id", "flds[].id"]`.

`col.models` is a dict keyed by note-type id: the real path to a template id
is `"1650000001000.tmpls[].id"`. The path match in
`processValueWithPrecisePaths` is an exact string comparison against
`"tmpls[].id"`, which never matches, so **no value is ever converted to
BigInt**. Instead:

1. Phase 2 (`quoteNumbersForFieldName`) quotes every `"id": <digits>` in the
   whole JSON (negative ids aren't even quoted, since the regex is `(\d+)`).
2. Phase 3 hits the "not a target path" branch (`src/anki/util.ts:406-408`)
   and converts the quoted string back via `Number(...)` — reintroducing the
   exact precision loss the function exists to prevent.

Anki (2.1.55+) assigns random 64-bit ids to templates/fields and uses them to
match schema changes when importing/merging note types. Values beyond 2^53
are silently altered — **even in a pure read→write pass with no SRS
conversion**.

**Repro (unit, executed):**

```ts
const modelsJson = `{"1650000001000":{"id":1650000001000,"name":"Vocab",
  "tmpls":[{"id":6134417914424963362,...}],"flds":[{"id":-8113853199325282904,...}]}}`;
const parsed = parseWithBigInts(modelsJson, ["tmpls[].id", "flds[].id"]);
// tmpls[0].id === 6134417914424963000   (number, NOT 6134417914424963362n)
// flds[0].id  === -8113853199325283000
```

**Repro (real fixture, executed):** direct
`fromAnkiExport(mixed-legacy-2.apkg)` → `toAnkiExport` alters **all six**
large ids present in the fixture's models JSON, e.g.
`5245795061146246729 → 5245795061146247000`,
`-2304464671626195269 → -2304464671626195200`.

The existing unit tests in `util.test.ts` only exercise root-level shapes
(`{"tmpls":[...]}`), where the paths do match — which is why this passes CI.

## F7 (High): Digit-only strings in `col.models` coerced to numbers; note types with digit-only names destroyed

**Location:** `src/anki/util.ts:406-408` — _any_ string value in the parsed
models JSON that matches `/^\d+$/` is converted with `Number(...)`, because
`shouldConvert` is always false (see F6). This applies to values the
preprocessing never quoted — i.e. strings that were quoted in the source
JSON.

Two confirmed consequences:

1. **Silent type corruption:** a _field_ (or template) named `"2024"` becomes
   the JSON number `2024` in the internal model and is written back as
   `"name":2024` — observed in the exported models JSON of both the direct
   and the SRS round-trip. Anki's rust parser expects `name` to be a string;
   leading zeros are also destroyed (`"007"` → `7`).
2. **Data loss with misleading diagnostics:** a _note type_ named `"007"`
   fails `validateNoteTypeEntry` ("missing or invalid 'name' field") and is
   dropped together with **all of its notes and cards**:

```text
status: partial
"Note type '1650000001000' is invalid: missing or invalid 'name' field. ..."
"Note 1650000010000 is invalid: references non-existent note type ..."
"Card 1650000020000 is invalid: references non-existent note ..."
```

That is perfectly valid Anki data being rejected while blaming the input file.

## F8 (High): `fieldValues` order silently overrides field names (SRS→Anki)

**Location:** `src/anki/anki-package.ts:927` —
`flds: joinAnkiFields(note.fieldValues.map(([, value]) => value))` writes
values in array order and ignores the names. `createNote`
(`src/srs-package.ts:327-335`) validates names only as a **set**, so
out-of-order input is accepted.

**Effect:** For SRS-authored packages (a documented, supported flow),

```ts
createNote({ fieldValues: [["Back", "back-value"], ["Front", "front-value"]], ... }, noteType)
```

passes validation and produces `flds === "back-valuefront-value"` —
the Front card face shows the Back content. Status `"success"`. Confirmed by
execution.

**Fix direction:** order `fieldValues` by `noteType.fields` before joining
(or reject mismatched order).

## F9 (High): Cloze cards with `}` in content silently dropped (SRS→Anki)

**Location:** `src/anki/anki-package.ts:343` —
`/\{\{c(?<ordinal>[1-9]\d*)::[^}]*\}\}/gu`. The `[^}]*` cannot match any `}`
inside the cloze body. Anki's own pattern (rslib `cloze.rs`) is non-greedy
`.*?`, which handles single `}` characters.

**Effect:** Content like `{{c1::\(x^{2}\)}}` (any MathJax with braces — an
extremely common cloze pattern) yields no detected ordinals, so
`fromSrsPackage` creates **zero cards** for the note; the orphaned note is
still written. Confirmed: conversion status `"success"`, `issues: []`,
`getCards().length === 0`. In the full round-trip, a note with
`{{c1::\(x^{2}\)}} and {{c2::simple}}` and two source cards came back with
only the ord-1 card — the ord-0 card (id `1650000024000`) vanished silently.

Any reviews attached to a dropped card are subsequently dropped too (those at
least generate error issues).

## F10 (High): Shipped `BasicAndReverseNote` reverse template is not reversed

**Location:** `src/srs-package.ts:382-403`:

```ts
templates: [
  { answerTemplate: "{{Back}}", id: 0, name: "Front > Back", questionTemplate: "{{Front}}" },
  { answerTemplate: "{{Back}}", id: 1, name: "Back > Front", questionTemplate: "{{Front}}" }, // ← identical
];
```

The second template should be `questionTemplate: "{{Back}}"`,
`answerTemplate: "{{Front}}"`. Anyone building a package with this constant
gets two identical Front→Back cards and never a reverse card. Confirmed by
assertion; contrast with `constants.ts` `basicAndReversedCardModel`
(`src/anki/constants.ts:365-390`), which has the correct swapped templates.

## F11 (Medium): Note type internals replaced by hardcoded defaults

**Locations:** capture `src/anki/anki-package.ts:1524-1554`; rebuild
`src/anki/anki-package.ts:852-894`.

Anki→SRS keeps only: name, field names/descriptions, template names,
`qfmt`/`afmt`. Everything else is rebuilt from constants on the way back:

- `css`, `latexPre`, `latexPost`, `latexsvg` → library defaults (custom
  styling lost; confirmed: `.card { color: red; }` → default css,
  `latexsvg: true` → `false`)
- `sortf` → 0, `mod`/`usn` → 0, `req` → `[[0,"any",[0]]]`,
  `originalStockKind` → 1
- `type` re-derived by a `{{cloze:` substring heuristic (works for standard
  cloze templates; an add-on cloze variant without that literal string would
  silently become a standard note type)
- templates: `bqfmt`/`bafmt` → `""` (confirmed `"BQ-OVERRIDE"` lost), deck
  override `did` → null, `bfont`/`bsize` reset; template `id` → small index
  (64-bit id lost)
- fields: `sticky`, `rtl`, `font`, `size`, `plainText`, `collapsed`,
  `excludeFromSearch`, `tag`, `preventDeletion` all reset (confirmed
  `font: "Courier"`, `rtl: true`, `sticky: true` lost); field `id` → index
- unknown/plugin keys on the model object dropped (confirmed `addonKey`
  gone; note this contradicts the "Plugin Data ✅ Full … round-trip
  conversions" README claim — only note/card `data` survives)

`ankiTemplateData` (full template JSON) is stored in
`applicationSpecificData` at `src/anki/anki-package.ts:1545` but never read
during `fromSrsPackage` — the restore half was simply never implemented.

## F12 (Medium): Deck properties reset; custom deck presets dropped

**Locations:** capture `src/anki/anki-package.ts:1503-1519` (only name,
desc, id, full JSON in `ankiDeckData`); rebuild
`src/anki/anki-package.ts:803-824`.

Confirmed on round-trip: `conf: 7 → 1` (deck now points at the default
preset), `extendNew: 5 → 0`, `newLimit: 40 → null`, `mod`/`usn` → 0,
`collapsed`/`browserCollapsed` → true, `lrnToday` etc. → `[0,0]`, plugin key
`deckPluginKey` dropped. The referenced custom preset itself (`dconf["7"]`,
"Hard Preset" — new/rev/lapse steps, FSRS weights, leech settings …) is gone
entirely because `col.dconf` is never converted (see F13). `ankiDeckData` is
write-only, like `ankiTemplateData`.

Dynamic decks (`dyn: 1`) also collapse to `dyn: 0` — filtered decks cannot
survive the round-trip.

## F13 (Medium): Collection metadata replaced by defaults

**Location:** `fromSrsPackage` starts from `AnkiPackage.fromDefault()`
(`src/anki/anki-package.ts:764`), which seeds `col` from
`ankiDefaultCollectionInsert` (`src/anki/constants.ts:225-246`). `toSrsPackage`
never captures `col` at all.

Confirmed on round-trip:

- `crt: 1600000000 → 1681178400`. `crt` anchors every review card's `due`
  (days since creation). Since due values are zeroed anyway (F1) this is
  currently self-consistent, but any future fix of F1 that restores `due`
  without restoring `crt` will shift all due dates by the difference — the
  two must be fixed together.
- `conf` fully replaced: `creationOffset: 300 → -120` (timezone semantics),
  custom `sortType`, `curDeck`, plugin key `confPluginKey` all gone.
- `col.tags` (`{"leech": -1}`) → `{}`.
- `graves` (sync tombstones) → empty.
- `mod`/`scm`/`ls`/`usn` → library-default constants.

## F14 (Medium): `csum` zeroed; note `mod`/`usn`/`flags` zeroed

**Location:** `src/anki/anki-package.ts:924-931` (`mod: 0`, `usn: 0`,
`csum: 0` with TODO, `flags: 0`).

Anki's `csum` is the first 8 hex digits of the SHA1 of the stripped first
field (`pylib/anki/utils.py: fieldChecksum`) and backs duplicate detection.
Writing 0 makes every note look identical to dedup logic until Anki's
"Check Database" recomputes it. Note modification timestamps (README:
"✅ Full … modification timestamps") are also lost. Confirmed:
`mod: 1650000011 → 0`, `csum: 2645262690 → 0`, `flags: 3 → 0`.

## F15 (Medium): Empty decks and card-less notes silently removed on Anki→SRS

**Location:** `src/anki/anki-package.ts:1766` (`srsPackage.removeUnused()`),
`src/srs-package.ts:139-151` (decks kept only if referenced by a note; notes
kept only if referenced by a card).

Confirmed with the real fixture `mixed-legacy-2.apkg`: the package contains
decks `["Default", "Test - Mixed Types"]`; `toSrsPackage` returns **1 deck**,
`status: "success"`, `issues: []`. Also confirmed synthetically: an added
"Empty Deck" (and even the Default deck) vanish without any warning. Deck
hierarchies with structural parent decks that hold no cards themselves would
lose those parents. The same `removeUnused()` call in `fromSrsPackage`
(`src/anki/anki-package.ts:778`) silently discards SRS notes that have no
cards (confirmed: 2 notes, 1 card → 1 note, zero issues).

At minimum this deserves a warning issue per removed entity.

## F16 (Medium): Same-millisecond reviews crash export with `UNIQUE constraint failed`

**Location:** `src/anki/anki-package.ts:1120-1136` — unlike decks
(`:797-799`), note types, notes, and cards, review IDs get **no
collision-bumping loop**; `revlog.id` is the primary key.

**Repro (executed):** two `createReview` calls with the same `timestamp` on
the same card (also applies to different cards) → `fromSrsPackage` returns
`status: "success"` with both reviews sharing id `1650000040000` →
`toAnkiExport` throws `Error: UNIQUE constraint failed: revlog.id`. The
failure is loud but deferred to export, after the caller was told conversion
succeeded; with `Promise.all`-style batch flows the partially written temp
dir is abandoned. Same-ms timestamps are realistic when importing from
sources with second-granularity timestamps.

## F17 (Low): `sfld` rebuilt as raw first field

**Location:** `src/anki/anki-package.ts:928`.

`sfld` should be the content of the field selected by the model's `sortf`,
HTML-stripped (Anki strips markup when building the sort column). The library
writes the raw first field (`front<br>HTML` observed) and ignores `sortf`
(which it also resets to 0, F11). Browse-view sorting differs from a native
Anki collection. Original `sfld` is discarded on Anki→SRS.

## F18 (Low): `req` and `originalStockKind` wrong for multi-template/cloze models

**Location:** `src/anki/anki-package.ts:892-893`.

`req: [[0, "any", [0]]]` regardless of template count (source model with two
templates had `[[0,"any",[0]],[1,"any",[1]]]`), and `originalStockKind: 1`
(BASIC) even for the cloze model (should be 5). `req` is unused by modern
Anki but still read by older 2.1.x clients — the stated target of the
Legacy 2 format.

---

## Suspected findings (code-reading, no repro executed)

### S1 (Medium): Cloze regeneration fabricates cards and can misattach reviews

`src/anki/anki-package.ts:1018-1029`: for each ordinal found in the note
content that has no matching SRS card, the **first** card of the note is
cloned as a fallback, fabricating a card that never existed. Because
`cardIDs.set(srsCard.id, cardId)` (`:1050`) keys by SRS card id, the same SRS
card mapped to several ordinals overwrites its entry, so reviews of that card
attach only to the **last** generated Anki card (and the fabricated cards get
bumped ids via the collision loop). Requires an SRS package whose cloze cards
don't cover all ordinals — possible after partial edits or third-party
generation.

### S2 (Low): Cloze ordinals scanned across all fields

`src/anki/anki-package.ts:1014` joins _all_ field values and scans for
`{{cN::}}`. Anki generates cloze cards only from fields referenced via
`{{cloze:Field}}` in the template. A cloze-looking snippet in an "Extra"
field (e.g. quoted example text) fabricates an extra card on SRS→Anki.

### S3 (Low): `ord` ignored when mapping fields/templates

`src/anki/anki-package.ts:1531` and `:1542` use the array index as the SRS
field/template id and `:1606` pairs note values by index. Anki's format
orders `flds`/`tmpls` by their `ord` property; the arrays are conventionally
sorted but nothing guarantees it. A model whose arrays are stored out of
`ord` order would have every field value attached to the wrong field name and
every card attached to the wrong template — silently.

### S4 (Low): `serializeWithBigInts` marker collision

`src/anki/util.ts:207-214`: any _string_ value that literally matches
`__BIGINT__<digits>__BIGINT__` (e.g. inside add-on data stored in a model)
is un-quoted into a bare number on write, corrupting the JSON structure.

### S5 (Low): `extractTimestampFromUuid` on non-UUID input

`src/anki/util.ts:89-97`: hand-authored SRS ids (the type is `string`, not
validated) are hex-parsed after hyphen-stripping; `"deck-1"` yields
`parseInt("deck1", 16) = 3564` — a tiny, collision-prone Anki id. All entity
kinds funnel through this fallback when `originalAnkiId` is absent.

---

## Other observations (not data loss)

- `docs/usage/converting/srs-to-anki.md` calls `ankiResult.data.exportToAnkiFile(...)`
  — no such method exists (`toAnkiExport`). Doc-only bug.
- The `ankiGuid`, `ankiTags`, `ankiDeckData`, `ankiTemplateData`, `ankiDue`,
  `ankiQueue`, `ankiType` keys are all **write-only**: captured on Anki→SRS,
  never consumed by `fromSrsPackage`. The preservation architecture
  (ADR 0003) is half-implemented; only `originalAnkiId` and `ankiData` have
  a working restore path.
- Unicode: the library performs no NFC normalization (Anki normalizes on
  import). Content passes through byte-identical, so this is fidelity-neutral;
  round-tripped NFD content will be normalized by Anki itself on import.

---

## Appendix A: Field-by-field mapping (Anki → SRS → Anki)

Legend: ✅ preserved · ⚠️ altered · ❌ lost (replaced by default) ·
✳ stored in `applicationSpecificData` but **never restored**

### `notes` table

| Column  | Anki→SRS                    | SRS→Anki                                  | Verdict                     |
| ------- | --------------------------- | ----------------------------------------- | --------------------------- |
| `id`    | `originalAnkiId`            | restored (fallback: UUID timestamp)       | ✅                          |
| `guid`  | `ankiGuid`                  | `guid64()` regenerated                    | ❌✳ F4                      |
| `mid`   | note-type mapping           | restored via note type's `originalAnkiId` | ✅                          |
| `mod`   | —                           | `0`                                       | ❌ F14                      |
| `usn`   | —                           | `0`                                       | ❌ F14                      |
| `tags`  | `ankiTags`                  | `""`                                      | ❌✳ F5                      |
| `flds`  | `fieldValues` (by position) | rejoined                                  | ✅ (⚠️ F8 for SRS-authored) |
| `sfld`  | —                           | raw first field value                     | ⚠️ F17                      |
| `csum`  | —                           | `0`                                       | ❌ F14                      |
| `flags` | —                           | `0`                                       | ❌ F14                      |
| `data`  | `ankiData`                  | restored                                  | ✅                          |

### `cards` table

| Column                                     | Anki→SRS                      | SRS→Anki                               | Verdict               |
| ------------------------------------------ | ----------------------------- | -------------------------------------- | --------------------- |
| `id`                                       | `originalAnkiId`              | restored                               | ✅                    |
| `nid`                                      | note mapping                  | restored                               | ✅                    |
| `did`                                      | note's deck (first card wins) | note's deck                            | ✅ (single-deck only) |
| `ord`                                      | `templateId`                  | restored (⚠️ cloze regeneration F9/S1) | ✅/⚠️                 |
| `mod`                                      | —                             | `0`                                    | ❌ F1                 |
| `usn`                                      | —                             | `0`                                    | ❌ F1                 |
| `type`                                     | `ankiType`                    | `0`                                    | ❌✳ F1                |
| `queue` (incl. suspended −1, buried −2/−3) | `ankiQueue`                   | `0`                                    | ❌✳ F1                |
| `due` (position / epoch / days-since-crt)  | `ankiDue`                     | `0`                                    | ❌✳ F1                |
| `ivl` (days; negative = seconds)           | —                             | `0`                                    | ❌ F1                 |
| `factor`                                   | —                             | `0`                                    | ❌ F1                 |
| `reps`                                     | —                             | `0`                                    | ❌ F1                 |
| `lapses`                                   | —                             | `0`                                    | ❌ F1                 |
| `left` (learning steps remaining)          | —                             | `0`                                    | ❌ F1                 |
| `odue`                                     | —                             | `0`                                    | ❌ F1                 |
| `odid` (filtered deck)                     | —                             | `0`                                    | ❌ F1                 |
| `flags` (colors)                           | —                             | `0`                                    | ❌ F1                 |
| `data`                                     | `ankiData`                    | restored                               | ✅                    |

### `revlog` table

| Column                                        | Anki→SRS                       | SRS→Anki                               | Verdict |
| --------------------------------------------- | ------------------------------ | -------------------------------------- | ------- |
| `id`                                          | `timestamp` + `originalAnkiId` | restored (no collision handling → F16) | ✅/⚠️   |
| `cid`                                         | card mapping                   | restored                               | ✅      |
| `usn`                                         | —                              | `0`                                    | ❌      |
| `ease`                                        | `score` (1:1)                  | restored                               | ✅      |
| `ivl`                                         | —                              | `0`                                    | ❌ F2   |
| `lastIvl`                                     | —                              | `0`                                    | ❌ F2   |
| `factor`                                      | —                              | `0`                                    | ❌ F2   |
| `time`                                        | —                              | `0`                                    | ❌ F2   |
| `type` (learn/review/relearn/filtered/manual) | —                              | `0`                                    | ❌ F2   |

### `col` table

| Column                                                        | Verdict on round-trip                 |
| ------------------------------------------------------------- | ------------------------------------- |
| `id`, `ver`, `dty`                                            | ✅ (constants)                        |
| `crt`                                                         | ❌ default `1681178400` (F13)         |
| `mod`, `scm`, `ls`, `usn`                                     | ❌ library defaults                   |
| `conf` (incl. `creationOffset`, scheduler flags, plugin keys) | ❌ default (F13)                      |
| `models`                                                      | see note-type table below             |
| `decks`                                                       | see deck table below                  |
| `dconf` (deck presets)                                        | ❌ replaced by default preset 1 (F12) |
| `tags`                                                        | ❌ `{}`                               |
| `graves` table                                                | ❌ dropped (F13)                      |
| media (zip + manifest)                                        | ❌ dropped (F3)                       |

### Deck JSON (per deck)

| Key                                          | Verdict                                 |
| -------------------------------------------- | --------------------------------------- |
| `id`                                         | ✅ (`originalAnkiId`)                   |
| `name`, `desc`                               | ✅                                      |
| `mod`, `usn`                                 | ❌ 0                                    |
| `lrnToday`/`revToday`/`newToday`/`timeToday` | ❌ `[0,0]`                              |
| `collapsed`, `browserCollapsed`              | ❌ `true`                               |
| `dyn` (filtered decks)                       | ❌ `0`                                  |
| `conf` (preset ref)                          | ❌ `1`                                  |
| `extendNew`, `extendRev`                     | ❌ 0                                    |
| `reviewLimit`, `newLimit`, `*Today`          | ❌ `null`                               |
| unknown/plugin keys                          | ❌✳ dropped (`ankiDeckData` write-only) |

### Note type JSON (per model)

| Key                                                                                     | Verdict                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `id`                                                                                    | ✅ (`originalAnkiId`)                                 |
| `name`                                                                                  | ✅ (⚠️ digit-only names destroyed, F7)                |
| `type`                                                                                  | ⚠️ re-derived from `{{cloze:` heuristic               |
| `mod`, `usn`, `sortf`, `did`                                                            | ❌ defaults                                           |
| `tmpls[].name`, `qfmt`, `afmt`                                                          | ✅                                                    |
| `tmpls[].id`                                                                            | ❌ index (64-bit id lost; also corrupted on read, F6) |
| `tmpls[].ord`                                                                           | ⚠️ index (S3)                                         |
| `tmpls[].bqfmt`, `bafmt`, `did`, `bfont`, `bsize`                                       | ❌✳ (`ankiTemplateData` write-only)                   |
| `flds[].name`, `description`                                                            | ✅ (⚠️ digit-only names coerced, F7)                  |
| `flds[].id`                                                                             | ❌ index (F6)                                         |
| `flds[].ord`                                                                            | ⚠️ index (S3)                                         |
| `flds[].sticky/rtl/font/size/plainText/collapsed/excludeFromSearch/tag/preventDeletion` | ❌ defaults                                           |
| `css`, `latexPre`, `latexPost`, `latexsvg`                                              | ❌ defaults                                           |
| `req`, `originalStockKind`                                                              | ❌ hardcoded (F18)                                    |
| unknown/plugin keys                                                                     | ❌ dropped                                            |

## Appendix B: Checked and found CLEAN

Verified by execution (synthetic package and/or `mixed-legacy-2.apkg`):

- **Direct read→write (no SRS):** `notes`, `cards`, `revlog`, `graves`
  tables round-trip semantically identical (every column, including
  suspended/buried queues, negative `ivl`, `odid`/`odue`, flags, `usn`,
  `sfld`, `csum`); `col` scalars (`crt`, `mod`, `scm`, `ver`, `dty`, `usn`,
  `ls`) preserved; `conf`/`decks`/`dconf`/`col.tags` JSON preserved
  **including unknown/plugin keys** ("Plugin Data: preserved in direct
  operations" holds, with the sole exceptions F6/F7 inside `models`);
  media manifest and file bytes preserved; non-digit string plugin values
  inside models preserved. Real fixture: 0 semantic diffs outside the
  documented `models` id corruption.
- **Anki→SRS→Anki:** entity IDs (deck/note type/note/card/review) preserved
  via `originalAnkiId` (ADR 0003 works for IDs); note field contents
  byte-identical incl. HTML and `\x1f` layout; field `description`
  preserved; deck `name`/`desc` preserved; note `data` and card `data`
  (add-on payload) preserved; review `ease` mapping bijective (1→Again …
  4→Easy); cloze note _type_ re-detected as `type: 1` via `{{cloze:`
  templates; `ord`↔`templateId` stable for standard notes.
- **Loud (non-silent) failure paths behave as designed:** multi-deck SRS
  packages (critical error), version-3 exports (`empty-latest.apkg`
  rejected), non-zip/truncated/corrupted files, missing meta/media/db zip
  members, DB version ≠ 11, invalid ease values in revlog (error issue +
  skip), reviews referencing missing cards (error issue + skip),
  notes/cards/decks/note types failing structural validation (error issue +
  skip; but see F7 for a false-positive trigger).
- **Meta/protobuf:** version 2 meta parsed and re-written correctly.
- **Media API (direct ops):** add/remove/list/size/stream, id allocation
  after removal, unicode filenames in manifest values.
- **`filterValidDatabaseItems` referential checks** (note→model, card→note,
  card→deck, review→card) drop only genuinely dangling rows, with error
  issues.

Not verified (out of scope / no execution): behavior of actual Anki clients
importing the round-tripped output; `.colpkg` variants beyond the fixture;
scheduler-v1 collections; browser/Bun/Deno runtimes.

## Repro harness

Scratch files (vitest, run against `src/` via the repo's `@` alias, kept out
of the test suite): `01-roundtrip.audit.ts` (F1–F5, F11–F14, F17, F18 —
single adversarial apkg through the full round-trip),
`02-direct.audit.ts` (F6/F7 direct path + plugin-data CLEAN checks),
`03-unit.audit.ts` (F6–F10, F15, F16 unit level),
`04-fixture.audit.ts` (real-fixture diff, F6, F15),
`05-numeric-name.audit.ts` (F7 note-type-name variant). Each test asserts the
_buggy_ value, so a green run confirms the finding.
