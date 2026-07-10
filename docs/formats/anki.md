# Anki Format Research

Part of Story 5.0.1 (format analysis for the universal SRS format design).
Ground truth for the legacy schema comes from this repository's own implementation
(`src/anki/types.ts`, `src/anki/database.ts`) and the maintainer's format write-up:
[Understanding the Anki .apkg Format (Legacy 2)](https://eikowagenknecht.com/posts/understanding-the-anki-apkg-format-legacy-2/).

## Container Formats

| File      | Contents                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `.apkg`   | ZIP: one or more decks exported for sharing (optionally with scheduling) |
| `.colpkg` | ZIP: full collection backup (always includes scheduling)                 |

Inside the ZIP:

- `meta` — protobuf, single `version` field (`ExportVersion`): 1 = legacy 1 (`collection.anki2`), 2 = legacy 2 (`collection.anki21`), 3 = latest (`collection.anki21b`, zstd-compressed — see Modern section)
- `collection.anki2` / `collection.anki21` — SQLite database
- `media` — legacy: JSON map of `"<n>" -> "<real filename>"`; the media files themselves are stored as files named `0`, `1`, `2`, …
- This library currently reads and writes **legacy 2 only**.

## Legacy 2 Database Schema

Single SQLite database, five tables of interest:

### `col` (single row — collection metadata)

- `crt` — collection creation time (**seconds**, start of day). Anchors all `due` day-offsets. Any converter restoring card `due` values must restore `crt` too.
- `mod`, `scm` (schema modification), `ver` (schema version = 11 inside legacy packages), `usn`, `ls` (last sync)
- `conf` — JSON: collection configuration (current deck, scheduler version, new-card spread, `creationOffset`, plugin keys)
- `models` — JSON map `mid -> NoteType`: the note types (see below)
- `decks` — JSON map `did -> Deck`
- `dconf` — JSON map `id -> DeckConfig`: deck option presets (learning steps, daily limits, leech handling, FSRS weights in newer exports)
- `tags` — JSON: tag registry cache

### `notes`

- `id` — epoch **milliseconds** of creation (primary key, also the de-facto creation timestamp)
- `guid` — globally unique id (base91), used for **duplicate detection / update on re-import**. Identity across collections.
- `mid` — note type id; `mod` (seconds), `usn`
- `tags` — space-separated string, hierarchical tags use `::`
- `flds` — all field values joined with `\x1f` (unit separator); order = note type field order
- `sfld` — sort field: the `sortf`-selected field value, HTML-stripped (integer-typed column with text affinity quirks)
- `csum` — first 8 hex digits of SHA1 of the stripped first field (dupe check)
- `data` — usually empty; plugin space

### `cards`

- `id` — epoch ms of creation; `nid` — note id; `did` — deck id; `ord` — template ordinal (or cloze index for cloze note types)
- `type` (`CardType`): 0 new, 1 learning, 2 review, 3 relearning
- `queue` (`QueueType`): 0 new, 1 learning (due = timestamp), 2 review (due = days), 3 day-learning, 4 preview; -1 suspended, -2 user-buried, -3 sched-buried
- `due` — polymorphic: new → position; learning → epoch seconds; review → **days since `col.crt`**
- `ivl` — interval; **negative = seconds, positive = days**
- `factor` — ease in permille (2500 = 250%)
- `reps`, `lapses`, `left` (learning steps remaining, encoded), `odue`/`odid` (original due/deck for filtered decks), `flags` (colored flags 1-7), `data` (JSON; modern: FSRS memory state)

### `revlog` (review history)

- `id` — epoch **ms** of the review (primary key → collisions possible on import from second-granularity sources)
- `cid` — card id; `usn`
- `ease` — the answer button: 1 Again, 2 Hard, 3 Good, 4 Easy (old scheduler used 1-3 for learning cards)
- `ivl` — new interval (negative = seconds), `lastIvl` — previous interval
- `factor` — ease after the review (permille)
- `time` — answer duration in **ms** (capped by deck preset)
- `type` (`ReviewType`): 0 learn, 1 review, 2 relearn, 3 filtered/cram, 4 manual/rescheduled

### `graves`

Sync tombstones (`usn`, `oid`, `type` 0=card 1=note 2=deck). Irrelevant for interchange, relevant for full-collection fidelity.

## Data Model Semantics

- **Note vs card split**: notes hold content (fields); cards are review units generated from note × template (`ord`). Cloze note types generate one card per `{{c<n>::…}}` deletion found in the fields referenced by `{{cloze:Field}}` templates.
- **Note types** (`models`): named field list (`flds`: name, ord, font, size, rtl, sticky, description, plainText, …), template list (`tmpls`: name, ord, `qfmt`/`afmt` HTML templates, browser variants `bqfmt`/`bafmt`, per-template deck override `did`), shared `css`, `latexPre`/`latexPost`, `sortf`, `type` (0 standard / 1 cloze), `req` (card-generation requirements, legacy clients), 64-bit `id`s on templates/fields in newer exports (schema-matching on import; precision-critical — see audit F6).
- **Decks**: flat map; hierarchy purely by name convention `Parent::Child`. Deck holds `conf` (preset id), daily counters, `dyn` (filtered deck flag + search terms). **Cards, not notes, belong to decks** — siblings can live in different decks (template deck overrides, moved cards).
- **Content**: fields are **HTML** (with `[sound:file.mp3]` and `[anki:play:…]` pseudo-tags, `<img src="…">` media refs, LaTeX `[latex]…[/latex]`, MathJax `\(...\)`). Template language: `{{Field}}`, `{{#Field}}…{{/Field}}` conditionals, `{{cloze:Field}}`, `{{type:Field}}`, `{{hint:Field}}`, `{{tts …}}`, special fields `{{Tags}}`, `{{Deck}}`, `{{Subdeck}}`, `{{Card}}`, `{{FrontSide}}`.
- **Media**: referenced by bare filename from HTML/templates; no subdirectories; unused-media detection is by scanning field text. No content hashes in legacy manifest.

## Identity & Sync

- All primary ids are creation-epoch-ms integers → they double as creation timestamps but are only unique per collection. Cross-collection identity: note `guid` only. Deck/note-type identity across collections: name (+ 64-bit template/field ids in newer versions).
- `usn`/`mod` drive AnkiWeb sync; safe to reset for interchange, must be preserved for backup fidelity.

## Scheduling Algorithm

SM-2 derivative (v2/v3 scheduler): ease factor per card (permille, floor 1300), interval growth `ivl * factor` with fuzz, 4 answer buttons, lapses reset to relearning with configurable steps from the deck preset. Modern Anki optionally replaces the ease-factor system with **FSRS** (see Modern section): per-card memory state (stability/difficulty) stored in `cards.data` JSON, per-preset weights, trained from the full revlog — which makes **complete review history the most valuable asset to preserve** in any conversion.

## What This Library Currently Covers (ground truth, 2026-07-10)

- Reads/writes legacy 2 only; `ExportVersion` 3 (zstd) unsupported.
- Anki → SRS keeps: deck name/description, note type name/fields/templates (qfmt/afmt), field values, review timestamp + ease. Raw JSON escape-hatched into `applicationSpecificData` (`ankiDeckData`, `ankiTemplateData`, `ankiGuid`, `ankiTags`, `ankiDue`/`ankiQueue`/`ankiType`, `ankiData`, `originalAnkiId`).
- The full fidelity audit (`docs/working/audit-2026-07-10-roundtrip.md`, issues in `docs/working/issues.md`) found the write-back path restores almost none of the escape-hatched data: scheduling state, review details, tags, GUIDs, media, CSS, deck presets, and collection metadata are all reset (findings F1–F5, F11–F13). The universal format must model these **natively** — the escape-hatch pattern (ADR-0003) demonstrably does not survive round-trips in practice.
- `fromSrsPackage` currently requires exactly one deck per package (`src/anki/anki-package.ts:783`) — multi-deck export is a design gap, not just a bug.

## Modern Schema (Anki 23.10+ / schema 18)

Researched 2026-07-10 against `ankitects/anki` main (proto files, storage/upgrade SQL, rslib). Tags: **[SRC]** read from Anki source, **[DOC]** manual/wiki, **[SEC]** secondary, **[?]** uncertain.

### Schema evolution [SRC]

`SCHEMA_MIN_VERSION = 11`, `SCHEMA_MAX_VERSION = 18` (versions 12/13 never existed). Modern desktop (23.10–25.x) runs collections at schema 18 on disk; downgrade to 11 only happens explicitly (profile downgrade or legacy export).

- 11→14: creates `deck_config`, `config`, `tags` tables (moves `col.dconf`/`conf`/`tags` out)
- 14→15: creates `notetypes`, `fields`, `templates`, `decks` tables (moves `col.models`/`decks` out)
- 15→17: in-code fixups, no new tables [SEC/?]
- 17→18: reworks `graves` + usn index

Modern table blobs are **protobuf** (`notetypes/fields/templates.config`, `decks.common`/`kind`, `deck_config.config`) — but `config.val` is **JSON**. The legacy `col.models`/`col.decks`/etc. text columns still exist and are **stale/non-authoritative** at schema ≥15; readers must use the tables.

**`notes`/`cards`/`revlog` shapes are unchanged from schema 11 through 18** — new data rides inside the existing `cards.data` JSON column.

### Key protobuf facts [SRC]

- `Notetype.Config`: `kind` (0 normal / 1 cloze), `sort_field_idx`, `css`, `latex_*`, `reqs`, `original_stock_kind`, `original_id`, `other` (opaque plugin bytes). Fields/templates carry optional stable 64-bit `id`s in their configs (import schema-matching).
- `Deck`: `common` + oneof `normal` (with `config_id` → preset, description, limits, **per-deck `desired_retention` override**) / `filtered` (search terms, delays, preview secs).
- `DeckConfig.Config`: learn/relearn steps, all SM-2 limits, **three parallel FSRS weight arrays** — `fsrs_params_4` (17), `fsrs_params_5` (19), `fsrs_params_6` (21) — plus `desired_retention` (default 0.9), `historical_retention`, `ignore_revlogs_before_date`. [?] exact proto field numbers should be re-diffed before codegen.

### Package format v3 [SRC]

`meta` file = `PackageMetadata` proto: version 1 = `collection.anki2` (schema 11), 2 = `collection.anki21` (schema 11), **3 = `collection.anki21b` (schema 18, whole-file zstd)**. Modern media manifest = zstd-compressed protobuf `MediaEntries { name, size, sha1 }` (legacy: plain JSON map); media blobs individually zstd-compressed under numeric names. Export options: `with_scheduling`, `with_deck_configs`, `with_media`, `legacy` (the "Support older Anki versions" checkbox → emits Legacy 2).

### `cards.data` JSON [SRC] — present even in legacy schema-11 files

```
"pos"   original new-card position
"s"     FSRS stability (days)        "d"    FSRS difficulty
"dr"    per-card desired retention   "decay" FSRS-6 decay
"lrt"   last review time (secs)
"cd"    custom_data (add-on JSON; string ≤100 bytes, keys ≤8 bytes — hard import limits)
```

**This means srs-converter is already silently passing through (via the `ankiData` escape hatch) but not modeling FSRS per-card state in the legacy files it reads today.**

### Revlog modern semantics [SRC]

`RevlogReviewKind`: 0 learning, 1 review, 2 relearning, 3 filtered, 4 manual/set-due, **5 rescheduled** (FSRS reschedule bookkeeping). `ease` 0 = manual reschedule, else buttons 1–4. `ivl`/`lastIvl` negative = seconds. Under FSRS, `factor` holds difficulty normalized to 100–1100 (distinguishable from SM-2 rows). FSRS training consumes kinds 0–2 honoring `ignore_revlogs_before_date`; converters must preserve **all** rows incl. types 4/5 and seconds encoding, or FSRS re-optimization changes.

### FSRS integration [SRC/SEC]

Global enable: JSON bool key `"fsrs"` in `config` (also `"sched2021"`, `"schedVer"`). Params per preset (see above), retention overridable per deck and per card. Timeline [SEC]: FSRS-4.5 ~23.10; FSRS-5 in 24.11; FSRS-6 in 25.07. "Reschedule on change" recomputes intervals from stored (s, d) and writes type-5 revlog rows.

### Import behavior [DOC/SEC]

- Modern Anki still **imports legacy v2 first-class**; no deprecation announced as of 2026-07. Writing legacy 2 remains a safe output target.
- `.apkg` merge dedups notes by `guid` (most recent `mod` wins); cards update only if the notetype's field/template name/count/order is unchanged.
- Notetype schema mismatch on import → incoming notetype added under a **new id on every import** (duplicate-notetype churn; ankitects/anki#2482) — third-party exporters must keep notetype schemas stable.

### Recommendations for srs-converter

1. **Cheapest high-value step: model `cards.data` JSON (`pos,s,d,dr,decay,lrt,cd`)** — it exists in the legacy schema-11 files the library already reads; FSRS per-card state is currently unmodeled.
2. **Reading schema 18**: worth doing — detect `meta` version; for v3, zstd-decompress `collection.anki21b`, read split tables, decode protobuf blobs (needs protobuf + zstd; a distinct reader path).
3. **Writing**: keep legacy 2 as default target (what Anki's own legacy checkbox emits), include `cards.data` FSRS JSON; optional schema-18 writer later for deck-preset/protobuf fidelity.

## Mapping Notes (Anki → universal format concepts)

| Universal concept | Anki equivalent                  | Notes for the universal format                                                                                                                             |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck              | `decks` entry                    | Hierarchy by name (`::`); deck belongs to **cards**, not notes → universal format should attach deck at card level or explicitly document the lossy choice |
| Deck config       | `dconf` preset                   | Referenced by id from deck; contains scheduler params incl. FSRS weights — needs a home (currently dropped)                                                |
| Note type         | model                            | Fields + templates + CSS + cloze kind; template lang is Anki-specific → universal format needs a portability strategy (keep verbatim + declare dialect?)   |
| Note              | `notes` row                      | Fields (HTML), tags, guid, created (id), modified (mod) — universal format lacks tags/timestamps today                                                     |
| Card              | `cards` row                      | ord/templateId ✔; scheduling state (type/queue/due/ivl/factor/lapses/left/flags/original-deck) has **no universal home today**                             |
| Review            | `revlog` row                     | timestamp + rating ✔; missing: duration, review type, resulting interval/factor. FSRS retraining needs at minimum (card, timestamp, rating, type)          |
| Media             | `media` map + files              | No universal media entity exists yet; references are format-specific (HTML `src`, `[sound:]`)                                                              |
| Tags              | `notes.tags`                     | Space-separated, `::` hierarchy; universal format has none                                                                                                 |
| App-specific data | `data` columns, plugin JSON keys | ADR-0003 escape hatch exists but restore paths must be specified by the format, not left to implementations                                                |

## Sources

- `src/anki/types.ts` (comprehensive, column-level documentation) — verified against code
- `docs/working/audit-2026-07-10-roundtrip.md` — executed round-trip repros
- <https://eikowagenknecht.com/posts/understanding-the-anki-apkg-format-legacy-2/>
- Modern schema: `ankitects/anki` main — `proto/anki/{notetypes,decks,deck_config,cards,import_export}.proto`, `rslib/src/storage/upgrades/` (+ schema SQL files), `rslib/src/import_export/package/meta.rs`, `rslib/src/storage/card/data.rs`, `rslib/src/revlog/mod.rs`, `rslib/src/config/bool.rs`; docs.ankiweb.net (exporting); AnkiDroid DB wiki (note: its "`cards.data` unused" claim is stale)
