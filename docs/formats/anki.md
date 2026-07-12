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
- `queue` (`QueueType`): 0 new, 1 learning (due = timestamp), 2 review (due = days), 3 day-learning, 4 preview; -1 suspended, -2 sched-buried (sibling), -3 user-buried (matches Anki rslib and `src/anki/types.ts`)
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
- Anki → SRS keeps deck name/description, note type name/fields/templates (qfmt/afmt), field values, and review score natively, and captures the **full original entity JSON** into `applicationSpecificData` blobs: per-entity `ankiNote`/`ankiCard`/`ankiReview`/`ankiDeck`/`ankiNoteType`, package-level `ankiCol`/`ankiDconf`/`ankiGraves`, plus `ankiData` (add-on `data` column) and `originalAnkiId`. Media files are copied into the `SrsPackage`.
- The 2026-07-10 fidelity audit (`docs/working/audit-2026-07-10-roundtrip.md`) originally found the write-back path restored almost none of this. The fixes (work packages WP1–WP6 in `docs/working/fixplan-2026-07-10.md`) completed the `applicationSpecificData` approach (ADR-0003): `fromSrsPackage` now parses each blob as the base row and overlays the fields the universal format owns, so scheduling state, review details, tags, GUIDs, media, CSS, deck presets, and collection metadata (findings F1–F5, F11–F13) survive the round-trip — verified by `src/anki/anki-package.roundtrip.test.ts`. Migrating these universal fields to first-class SRS model fields remains future (Phase 5) work.
- `fromSrsPackage` currently requires exactly one deck per package (`src/anki/anki-package.ts` `restoreDeck`/deck-count guard) — multi-deck export is a design gap, not just a bug.

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
- `DeckConfig.Config`: learn/relearn steps, all SM-2 limits, **three parallel FSRS weight arrays** — `fsrs_params_4` (17), `fsrs_params_5` (19), `fsrs_params_6` (21) — plus `desired_retention` (default 0.9), `historical_retention`, `ignore_revlogs_before_date`. Exact field numbers pinned below (§Pinned wire-format spec, Anki 26.05).

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

### Pinned wire-format spec (Anki 26.05) [SRC]

Pinned 2026-07-11 against `ankitects/anki` tag **26.05** (commit `e64c6b1aee3e8d668fb8bbe084beada8e070d985`), released 2026-06-16. Sources: `proto/anki/{import_export,notetypes,decks,deck_config,generic}.proto`, `rslib/src/import_export/package/{meta.rs,media.rs,colpkg/export.rs,colpkg/import.rs,apkg/export.rs}`, `rslib/src/storage/schema11.sql` + `upgrades/*.sql`. **Licensing note:** Anki's sources are AGPL-3.0; the tables below restate field numbers, types, and behavior as interoperability facts — no proto text or generated code may be copied into this repo (ADR-0013). Wire-format reference: <https://protobuf.dev/programming-guides/encoding/>.

Only `optional`-annotated fields have explicit presence; everything else is proto3 implicit (defaults omitted on the wire). `bytes other = 255` fields carry add-on data and must round-trip opaquely (ADR-0013 unknown-field passthrough).

#### `PackageMetadata` (zip entry `meta`, NOT zstd-compressed)

| #   | Field     | Type | Notes                                                                  |
| --- | --------- | ---- | ---------------------------------------------------------------------- |
| 1   | `version` | enum | 0 unknown (reject as "too new"), 1 legacy 1, 2 legacy 2, 3 latest (v3) |

#### `MediaEntries` (zip entry `media`, zstd-compressed in v3)

`entries = 1` (repeated `MediaEntry`). Entry position in the list = zip entry name (decimal string).

| #   | Field                 | Type            | Notes                                                               |
| --- | --------------------- | --------------- | ------------------------------------------------------------------- |
| 1   | `name`                | string          | must be NFC-normalized and a safe single path component (see below) |
| 2   | `size`                | uint32          | uncompressed size                                                   |
| 3   | `sha1`                | bytes           | of uncompressed data; must be exactly 20 bytes or import fails      |
| 255 | `legacy_zip_filename` | optional uint32 | in-memory only when importing gappy legacy maps; never written      |

#### `Notetype.Config` (stored in `notetypes.config`)

`id`, `name`, `mtime_secs`, `usn` are table columns, not blob fields.

| #   | Field                   | Type                       | Notes                                                                                                 |
| --- | ----------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `kind`                  | enum                       | 0 normal, 1 cloze                                                                                     |
| 2   | `sort_field_idx`        | uint32                     |                                                                                                       |
| 3   | `css`                   | string                     |                                                                                                       |
| 4   | `target_deck_id_unused` | int64                      | legacy leftover                                                                                       |
| 5   | `latex_pre`             | string                     |                                                                                                       |
| 6   | `latex_post`            | string                     |                                                                                                       |
| 7   | `latex_svg`             | bool                       |                                                                                                       |
| 8   | `reqs`                  | repeated `CardRequirement` | card-generation requirements (schema-11 `req`)                                                        |
| 9   | `original_stock_kind`   | enum                       | 0 unknown, 1 basic, 2 basic+reversed, 3 basic-optional-reversed, 4 typing, 5 cloze, 6 image occlusion |
| 10  | `original_id`           | optional int64             | id in source collection for imports (23.10+)                                                          |
| 255 | `other`                 | bytes                      | opaque add-on data                                                                                    |

`CardRequirement`: `card_ord = 1` (uint32), `kind = 2` (enum: 0 none, 1 any, 2 all), `field_ords = 3` (repeated uint32, packed).

#### `Notetype.Field.Config` (stored in `fields.config`)

`ntid`, `ord`, `name` are table columns.

| #   | Field                 | Type            | Notes                                             |
| --- | --------------------- | --------------- | ------------------------------------------------- |
| 1   | `sticky`              | bool            |                                                   |
| 2   | `rtl`                 | bool            |                                                   |
| 3   | `font_name`           | string          |                                                   |
| 4   | `font_size`           | uint32          |                                                   |
| 5   | `description`         | string          | placeholder text (2.1.50+)                        |
| 6   | `plain_text`          | bool            |                                                   |
| 7   | `collapsed`           | bool            |                                                   |
| 8   | `exclude_from_search` | bool            |                                                   |
| 9   | `id`                  | optional int64  | stable id for import merging (23.10+)             |
| 10  | `tag`                 | optional uint32 | identifies required fields (e.g. image occlusion) |
| 11  | `prevent_deletion`    | bool            |                                                   |
| 255 | `other`               | bytes           | opaque add-on data                                |

#### `Notetype.Template.Config` (stored in `templates.config`)

`ntid`, `ord`, `name`, `mtime_secs`, `usn` are table columns.

| #   | Field               | Type           | Notes                                 |
| --- | ------------------- | -------------- | ------------------------------------- |
| 1   | `q_format`          | string         | question template                     |
| 2   | `a_format`          | string         | answer template                       |
| 3   | `q_format_browser`  | string         |                                       |
| 4   | `a_format_browser`  | string         |                                       |
| 5   | `target_deck_id`    | int64          | schema-11 `did`                       |
| 6   | `browser_font_name` | string         |                                       |
| 7   | `browser_font_size` | uint32         |                                       |
| 8   | `id`                | optional int64 | stable id for import merging (23.10+) |
| 255 | `other`             | bytes          | opaque add-on data                    |

#### `Deck.Common` (stored in `decks.common`)

| #    | Field                  | Type   | Notes                |
| ---- | ---------------------- | ------ | -------------------- |
| 1    | `study_collapsed`      | bool   |                      |
| 2    | `browser_collapsed`    | bool   |                      |
| 3    | `last_day_studied`     | uint32 |                      |
| 4    | `new_studied`          | int32  | today's counts       |
| 5    | `review_studied`       | int32  |                      |
| 6    | `learning_studied`     | int32  | v1 scheduler, unused |
| 7    | `milliseconds_studied` | int32  |                      |
| 8–13 | _reserved_             |        |                      |
| 255  | `other`                | bytes  | opaque add-on data   |

#### `Deck.KindContainer` (stored in `decks.kind`)

Tagged union: `normal = 1` (`Deck.Normal`) / `filtered = 2` (`Deck.Filtered`) — exactly one present.

`Deck.Normal`:

| #     | Field                  | Type            | Notes                                                                                                                |
| ----- | ---------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1     | `config_id`            | int64           | → `deck_config.id`                                                                                                   |
| 2     | `extend_new`           | uint32          |                                                                                                                      |
| 3     | `extend_review`        | uint32          |                                                                                                                      |
| 4     | `description`          | string          |                                                                                                                      |
| 5     | `markdown_description` | bool            |                                                                                                                      |
| 6     | `review_limit`         | optional uint32 | per-deck limit override                                                                                              |
| 7     | `new_limit`            | optional uint32 |                                                                                                                      |
| 8     | `review_limit_today`   | `DayLimit`      | `limit = 1`, `today = 2` (both uint32)                                                                               |
| 9     | `new_limit_today`      | `DayLimit`      |                                                                                                                      |
| 10    | `desired_retention`    | optional float  | per-deck FSRS override; schema-11 `desiredRetention` stores it as integer percent (precision truncates on downgrade) |
| 12–15 | _reserved_             |                 |                                                                                                                      |

`Deck.Filtered`: `reschedule = 1` (bool), `search_terms = 2` (repeated `SearchTerm`), `delays = 3` (repeated float, v1 only), `preview_delay = 4` (uint32, v2/old-v3), `preview_hard_secs = 5`, `preview_good_secs = 6`, `preview_again_secs = 7` (uint32, current v3; 0 = card returned). `SearchTerm`: `search = 1` (string), `limit = 2` (uint32), `order = 3` (enum: 0 oldest-reviewed-first, 1 random, 2 intervals-asc, 3 intervals-desc, 4 lapses, 5 added, 6 due, 7 reverse-added, 8 retrievability-asc, 9 retrievability-desc, 10 relative-overdueness).

#### `DeckConfig.Config` (stored in `deck_config.config`)

`id`, `name`, `mtime_secs`, `usn` are table columns.

| #   | Field                                 | Type           | Notes                                                                                                                                                                                                           |
| --- | ------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `learn_steps`                         | repeated float | minutes                                                                                                                                                                                                         |
| 2   | `relearn_steps`                       | repeated float |                                                                                                                                                                                                                 |
| 3   | `fsrs_params_4`                       | repeated float | 17 weights (FSRS-4.5)                                                                                                                                                                                           |
| 4   | `easy_days_percentages`               | repeated float |                                                                                                                                                                                                                 |
| 5   | `fsrs_params_5`                       | repeated float | 19 weights (FSRS-5)                                                                                                                                                                                             |
| 6   | `fsrs_params_6`                       | repeated float | 21 weights (FSRS-6)                                                                                                                                                                                             |
| 7–8 | _reserved_                            |                | held for future FSRS params                                                                                                                                                                                     |
| 9   | `new_per_day`                         | uint32         |                                                                                                                                                                                                                 |
| 10  | `reviews_per_day`                     | uint32         |                                                                                                                                                                                                                 |
| 11  | `initial_ease`                        | float          |                                                                                                                                                                                                                 |
| 12  | `easy_multiplier`                     | float          |                                                                                                                                                                                                                 |
| 13  | `hard_multiplier`                     | float          |                                                                                                                                                                                                                 |
| 14  | `lapse_multiplier`                    | float          |                                                                                                                                                                                                                 |
| 15  | `interval_multiplier`                 | float          |                                                                                                                                                                                                                 |
| 16  | `maximum_review_interval`             | uint32         |                                                                                                                                                                                                                 |
| 17  | `minimum_lapse_interval`              | uint32         |                                                                                                                                                                                                                 |
| 18  | `graduating_interval_good`            | uint32         |                                                                                                                                                                                                                 |
| 19  | `graduating_interval_easy`            | uint32         |                                                                                                                                                                                                                 |
| 20  | `new_card_insert_order`               | enum           | 0 due, 1 random                                                                                                                                                                                                 |
| 21  | `leech_action`                        | enum           | 0 suspend, 1 tag-only                                                                                                                                                                                           |
| 22  | `leech_threshold`                     | uint32         |                                                                                                                                                                                                                 |
| 23  | `disable_autoplay`                    | bool           |                                                                                                                                                                                                                 |
| 24  | `cap_answer_time_to_secs`             | uint32         |                                                                                                                                                                                                                 |
| 25  | `show_timer`                          | bool           |                                                                                                                                                                                                                 |
| 26  | `skip_question_when_replaying_answer` | bool           |                                                                                                                                                                                                                 |
| 27  | `bury_new`                            | bool           |                                                                                                                                                                                                                 |
| 28  | `bury_reviews`                        | bool           |                                                                                                                                                                                                                 |
| 29  | `bury_interday_learning`              | bool           |                                                                                                                                                                                                                 |
| 30  | `new_mix`                             | enum           | ReviewMix: 0 mix-with-reviews, 1 after, 2 before                                                                                                                                                                |
| 31  | `interday_learning_mix`               | enum           | ReviewMix                                                                                                                                                                                                       |
| 32  | `new_card_sort_order`                 | enum           | 0 template, 1 no-sort, 2 template-then-random, 3 random-note-then-template, 4 random-card                                                                                                                       |
| 33  | `review_order`                        | enum           | 0 day, 1 day-then-deck, 2 deck-then-day, 3 intervals-asc, 4 intervals-desc, 5 ease-asc, 6 ease-desc, 7 retrievability-asc, 8 random, 9 added, 10 reverse-added, 11 retrievability-desc, 12 relative-overdueness |
| 34  | `new_card_gather_priority`            | enum           | 0 deck, 1 lowest-position, 2 highest-position, 3 random-notes, 4 random-cards, 5 deck-then-random-notes                                                                                                         |
| 35  | `new_per_day_minimum`                 | uint32         | not currently used                                                                                                                                                                                              |
| 36  | `question_action`                     | enum           | 0 show-answer, 1 show-reminder                                                                                                                                                                                  |
| 37  | `desired_retention`                   | float          | FSRS, default 0.9                                                                                                                                                                                               |
| 38  | `stop_timer_on_answer`                | bool           |                                                                                                                                                                                                                 |
| 39  | _reserved_                            |                | was `fsrs_reschedule`                                                                                                                                                                                           |
| 40  | `historical_retention`                | float          | FSRS                                                                                                                                                                                                            |
| 41  | `seconds_to_show_question`            | float          |                                                                                                                                                                                                                 |
| 42  | `seconds_to_show_answer`              | float          |                                                                                                                                                                                                                 |
| 43  | `answer_action`                       | enum           | 0 bury, 1 answer-again, 2 answer-good, 3 answer-hard, 4 show-reminder                                                                                                                                           |
| 44  | `wait_for_audio`                      | bool           |                                                                                                                                                                                                                 |
| 45  | `param_search`                        | string         | FSRS optimizer search                                                                                                                                                                                           |
| 46  | `ignore_revlogs_before_date`          | string         | FSRS                                                                                                                                                                                                            |
| 255 | `other`                               | bytes          | opaque add-on data                                                                                                                                                                                              |

#### Schema-18 DDL (delta from schema 11)

Applied by upgrades 14/15/17/18; `notes`, `cards`, `revlog`, `col` keep their schema-11 shape.

- v14: `deck_config (id INTEGER PK, name TEXT COLLATE unicase, mtime_secs, usn, config BLOB)`; `config (KEY TEXT PK, usn, mtime_secs, val BLOB) WITHOUT ROWID` (vals are JSON); `tags` (replaced again at v17).
- v15: `notetypes (id INTEGER PK, name TEXT COLLATE unicase, mtime_secs, usn, config BLOB)` + unique index on `name`, index on `usn`; `fields (ntid, ord, name COLLATE unicase, config BLOB, PK(ntid, ord)) WITHOUT ROWID` + unique index `(name, ntid)`; `templates (ntid, ord, name COLLATE unicase, mtime_secs, usn, config BLOB, PK(ntid, ord)) WITHOUT ROWID` + unique index `(name, ntid)`, index on `usn`; `decks (id INTEGER PK, name TEXT COLLATE unicase, mtime_secs, usn, common BLOB, kind BLOB)` + unique index on `name`; `idx_notes_mid` on `notes (mid)`; partial `idx_cards_odid` on `cards (odid) WHERE odid != 0`. ⚠️ At schema ≥15, `decks.name` uses the ASCII unit separator `\x1f` between hierarchy levels instead of `::` (converted back to `::` on downgrade/display).
- v17: `tags (tag TEXT PK COLLATE unicase, usn, collapsed BOOLEAN, config BLOB NULL) WITHOUT ROWID`.
- v18: `graves` rebuilt as `(oid, type, usn, PK(oid, type)) WITHOUT ROWID` + `idx_graves_pending` on `(usn)`.
- `col.ver = 18`; **`col.models`, `col.decks`, `col.dconf`, `col.conf`, `col.tags` are cleared to the empty string `''`** (not `'{}'` — a reader that unconditionally `JSON.parse`s them will throw).
- ⚠️ `COLLATE unicase` is a custom collation registered by Anki's Rust code at connection time. **Resolved 2026-07-11 (Story 1.3.6 spike):** sql.js 1.14 exposes no `create_collation`, and even _reading_ the `tags` table fails ("no query solution" — its WITHOUT ROWID PK is unicase-collated). Reader strategy: after loading the DB buffer, strip `COLLATE unicase` from the schema text via `PRAGMA writable_schema` and reopen — full scans never rely on unicase ordering, so this is safe. Writer strategy: create the schema-18 DDL **without** the `COLLATE unicase` clauses (binary collation) — Anki's importer only SELECTs from the package DB, so this is provably safe for `.apkg`; for `.colpkg` the DB becomes the user's collection with binary name ordering (self-consistent; documented divergence from Anki's own files).

#### Package v3 container layout

Zip entries (Anki writes all of them with zip compression method _stored_; zstd replaces deflate — the importer tolerates deflated entries, but match Anki for safety):

| Entry                | Content                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`               | `PackageMetadata` protobuf, uncompressed                                                                                                                                                                                   |
| `collection.anki21b` | schema-18 SQLite DB, whole-file zstd                                                                                                                                                                                       |
| `collection.anki2`   | **dummy** schema-11 DB (512-byte pages, vacuumed) with one Basic note reading "collection too new" — graceful degradation for pre-2.1.50 clients; the modern importer ignores it. Our writer should include an equivalent. |
| `media`              | zstd-compressed `MediaEntries` protobuf (legacy: uncompressed JSON map `"index" → filename`)                                                                                                                               |
| `0`, `1`, …          | media files, each individually zstd-compressed; name = decimal index into `MediaEntries.entries`                                                                                                                           |

zstd: Anki compresses at the library default level (3) and enables multithreading only above 10 MiB; the importer accepts any valid zstd frame, so level choice is free for our writer.

**Version detection** (mirror of `meta.rs`): if a `meta` entry exists, protobuf-decode it — version 1/2/3 as tabled above, version 0 or unrecognized ⇒ "package too new" error. If `meta` is absent: `collection.anki21` present ⇒ Legacy 2, else Legacy 1.

**Importer validation our writer must satisfy** (from `colpkg/import.rs`, `media.rs`):

- The decompressed collection must pass `PRAGMA integrity_check`.
- Every media `name` must already be NFC-normalized and "safe" (single path component; no traversal, no reserved Windows names) — one bad name fails the **entire** import as corrupt. `sha1` must be exactly 20 bytes.
- A missing `media` entry is tolerated (treated as empty; old AnkiDroid compat).
- Media dedup on import: modern compares sha1 against the media DB; legacy compares file size only.
- .apkg (deck export) uses the same container: Anki builds a temp collection from gathered data, closes it at schema 18 (v3) or 11 (legacy), then packages it identically — including the dummy `collection.anki2`.

### Decisions for srs-converter (2026-07-11)

The 2026-07-10 recommendations were decided and partly overridden by the maintainer on 2026-07-11:

- **Scope**: read **and write** package v3 / schema 18; **modern is the default output**, Legacy 2 behind an option (ADR-0015 — overrides the earlier "keep legacy 2 as default" recommendation).
- **Protobuf**: hand-rolled minimal wire codec with unknown-field passthrough; no AGPL proto text or codegen in the repo (ADR-0013).
- **zstd**: `node:zlib` native zstd; `engines.node` raised to `>=22.15.0` (ADR-0014).
- **Blob storage**: source-native form + per-entity schema marker in `applicationSpecificData`; convert only at write time when crossing schemas (ADR-0016). The complete 11↔18 field mapping for those conversions is in [anki-schema-mapping.md](anki-schema-mapping.md) — including the gotchas (swapped `new.order` enum values, inverted `autoplay`/`replayq`, percent-vs-float `desiredRetention`) and the loss inventory.
- Still open and worth doing early: **model `cards.data` JSON (`pos,s,d,dr,decay,lrt,cd`)** — it exists in the legacy schema-11 files the library already reads; FSRS per-card state is currently unmodeled. Independent of everything above.

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
- `ankitects/anki` tag 26.05, commit `e64c6b1aee3e8d668fb8bbe084beada8e070d985` (pinned 2026-07-11): `proto/anki/{import_export,notetypes,decks,deck_config,generic}.proto`, `rslib/src/import_export/package/{meta.rs,media.rs,colpkg/export.rs,colpkg/import.rs,apkg/export.rs}`, `rslib/src/storage/schema11.sql`, `rslib/src/storage/upgrades/*.sql` + `mod.rs`, `rslib/src/storage/{notetype,deck,deckconfig,tag,config}/mod.rs` (col-column clearing)
- <https://protobuf.dev/programming-guides/encoding/> — wire-format reference (non-AGPL)
- Modern schema: `ankitects/anki` main — `proto/anki/{notetypes,decks,deck_config,cards,import_export}.proto`, `rslib/src/storage/upgrades/` (+ schema SQL files), `rslib/src/import_export/package/meta.rs`, `rslib/src/storage/card/data.rs`, `rslib/src/revlog/mod.rs`, `rslib/src/config/bool.rs`; docs.ankiweb.net (exporting); AnkiDroid DB wiki (note: its "`cards.data` unused" claim is stale)
