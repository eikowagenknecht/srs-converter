# Anki Schema 11 ↔ 18 Field Mapping

Reference for the two conversion functions required by ADR-0016 (source-native blobs, write-time conversion): **proto→11** (used by the Legacy 2 writer for modern-sourced entities) and **11→proto** (used by the schema-18 writer for legacy-sourced entities). Mirrors Anki's own upgrade/downgrade code so packages we convert behave like packages Anki converted.

Pinned 2026-07-11 against `ankitects/anki` tag **26.05** (commit `e64c6b1aee3e8d668fb8bbe084beada8e070d985`): `rslib/src/notetype/schema11.rs`, `rslib/src/decks/schema11.rs`, `rslib/src/deckconfig/schema11.rs`, `rslib/src/storage/{config,tag}/mod.rs`. Same licensing policy as the wire spec in `anki.md`: facts restated, no AGPL text copied. Proto field numbers: `anki.md` §Pinned wire-format spec.

## Headline finding: modern Anki's schema-11 dialect is richer than schema 11

Anki deliberately serializes most post-11 settings into the legacy JSON so nothing is lost on downgrade/upgrade ("these were not in schema 11, but need to be listed so the setting is not lost"). A legacy export produced by modern Anki therefore already contains FSRS parameters, stable field/template ids, `originalStockKind`, etc. as extra JSON keys. Consequences for us:

- The 11→proto conversion must map these keys, not treat them as unknown extras.
- Our proto→11 conversion must emit them, or data that Anki's own legacy export preserves would be lost by ours.
- The truly unrepresentable remainder is small (see Loss inventory at the end).

## Conversion mechanics (all entity types)

- **Unknown-key passthrough**: schema-11 JSON objects tolerate arbitrary extra keys. On 11→proto, unknown keys are collected into a JSON object and stored as the `other = 255` bytes (empty map → empty bytes). On proto→11, `other` bytes are parsed as JSON and splatted back as top-level keys — after removing each scope's **reserved keys** (listed per entity below) so add-on data can never shadow real fields.
- **Tolerant parsing** (match when reading schema-11 JSON): ids and timestamps accept number-or-numeric-string; several fields fall back to their default on invalid values (noted as _lenient_ below); booleans in `sticky`/`rtl`/`resched` accept bool-from-anything (0/1/strings).
- Table columns at schema 18 (`id`, `name`, `mtime_secs`, `usn`, `ord`, `ntid`) come from the corresponding JSON keys and are **not** part of the config blobs.

## Notetype (schema-11 `models` entry ↔ `notetypes` row + `Notetype.Config`)

| Schema 11 (camelCase)       | Schema 18                         | Transform / notes                                                                                                             |
| --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | `notetypes.id`                    | number-or-string                                                                                                              |
| `name`                      | `notetypes.name`                  |                                                                                                                               |
| `mod`                       | `notetypes.mtime_secs`            |                                                                                                                               |
| `usn`                       | `notetypes.usn`                   |                                                                                                                               |
| `type` (0/1)                | `Config.kind`                     | same values (0 normal, 1 cloze)                                                                                               |
| `sortf`                     | `Config.sort_field_idx`           | u16 ↔ u32                                                                                                                     |
| `did` (nullable, _lenient_) | `Config.target_deck_id_unused`    | `null` ↔ `0`                                                                                                                  |
| `css` (_lenient_)           | `Config.css`                      |                                                                                                                               |
| `latexPre` / `latexPost`    | `Config.latex_pre` / `latex_post` | default `""`                                                                                                                  |
| `latexsvg` (_lenient_)      | `Config.latex_svg`                | default false                                                                                                                 |
| `req` (_lenient_)           | `Config.reqs`                     | JSON tuples `[card_ord, "none"\|"any"\|"all", [field_ords]]` ↔ messages; **string kind ↔ enum number** (none 0, any 1, all 2) |
| `originalStockKind`         | `Config.original_stock_kind`      | omitted from JSON when 0                                                                                                      |
| `originalId`                | `Config.original_id`              | omitted from JSON when absent                                                                                                 |
| `tmpls` / `flds`            | `templates` / `fields` rows       | see below                                                                                                                     |
| _unknown keys_              | `Config.other`                    | reserved keys: `id name type mod usn sortf did tmpls flds css latexPre latexPost latexsvg req originalStockKind originalId`   |

## Note field (`flds` entry ↔ `fields` row + `Field.Config`)

| Schema 11                       | Schema 18                    | Transform / notes                                                                                                  |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `name` / `ord`                  | `fields.name` / `fields.ord` | `ord` nullable u16                                                                                                 |
| `sticky` / `rtl`                | `sticky` / `rtl`             | bool-from-anything                                                                                                 |
| `font` / `size`                 | `font_name` / `font_size`    | defaults `"Arial"` / 20; u16 ↔ u32                                                                                 |
| `description` (_lenient_)       | `description`                | post-11 key, serialized both ways                                                                                  |
| `plainText` (_lenient_)         | `plain_text`                 | post-11 key                                                                                                        |
| `collapsed` (_lenient_)         | `collapsed`                  | post-11 key                                                                                                        |
| `excludeFromSearch` (_lenient_) | `exclude_from_search`        | post-11 key                                                                                                        |
| `id` (_lenient_)                | `id`                         | post-11 key; stable id for import merging                                                                          |
| `tag` (_lenient_)               | `tag`                        | post-11 key                                                                                                        |
| `preventDeletion` (_lenient_)   | `prevent_deletion`           | post-11 key                                                                                                        |
| _unknown keys_                  | `Config.other`               | reserved: `name ord sticky rtl plainText font size description collapsed excludeFromSearch id tag preventDeletion` |

## Card template (`tmpls` entry ↔ `templates` row + `Template.Config`)

| Schema 11                   | Schema 18                               | Transform / notes                                                                         |
| --------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `name` / `ord`              | `templates.name` / `templates.ord`      | `ord` nullable u16                                                                        |
| —                           | `templates.mtime_secs` / `usn`          | **zeroed on 11→proto** (schema 11 has no per-template mtime/usn); values lost on proto→11 |
| `qfmt` / `afmt`             | `q_format` / `a_format`                 | `afmt` defaults `""`                                                                      |
| `bqfmt` / `bafmt`           | `q_format_browser` / `a_format_browser` | default `""`                                                                              |
| `did` (nullable, _lenient_) | `target_deck_id`                        | `null` ↔ `0` (proto→11 emits `null` unless > 0)                                           |
| `bfont` (_lenient_)         | `browser_font_name`                     |                                                                                           |
| `bsize` (_lenient_)         | `browser_font_size`                     | **u8** in JSON ↔ u32 in proto (values > 255 truncate on downgrade)                        |
| `id` (_lenient_)            | `id`                                    | post-11 key; stable id for import merging                                                 |
| _unknown keys_              | `Config.other`                          | reserved: `name ord qfmt afmt bqfmt bafmt did bfont bsize id`                             |

## Deck (schema-11 `decks` entry ↔ `decks` row + `Common`/`KindContainer`)

Variant selection on read: `dyn` (accepts bool or 0/1) — 1/true ⇒ filtered, else normal. An obsolete `return` key is dropped on read. **Deck name**: schema 11 uses human form (`Parent::Child`); schema 18 stores `\x1f` as the level separator — convert both ways.

Common part (both variants):

| Schema 11                                    | Schema 18                                                                                            | Transform / notes                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` / `mod` / `name` / `usn`                | `decks` table columns                                                                                | number-or-string; `mod` defaults 0; name separator conversion                                                                                                                                                                       |
| `collapsed`                                  | `Common.study_collapsed`                                                                             |                                                                                                                                                                                                                                     |
| `browserCollapsed`                           | `Common.browser_collapsed`                                                                           | default false                                                                                                                                                                                                                       |
| `lrnToday` `revToday` `newToday` `timeToday` | `Common.last_day_studied` + `learning_studied` `review_studied` `new_studied` `milliseconds_studied` | JSON: four `[day, amount]` pairs. 11→proto: `last_day_studied = max(day of time/new/rev)`; any counter from an earlier day has its amount **zeroed**. proto→11: all four pairs get the same `last_day_studied`.                     |
| `dyn`                                        | which `kind` oneof is set                                                                            | 0/1 in JSON                                                                                                                                                                                                                         |
| `desc` / `md`                                | `Normal.description` / `markdown_description`                                                        | live in the **common** JSON but in `Normal` proto; filtered decks: proto→11 emits `desc: ""`, omits `md`                                                                                                                            |
| _unknown keys_                               | `Common.other`                                                                                       | reserved: `id mod name usn collapsed browserCollapsed desc dyn lrnToday revToday newToday timeToday conf extendNew extendRev reviewLimit newLimit reviewLimitToday newLimitToday desiredRetention` (note: `md` is **not** reserved) |

Normal decks (`Deck.Normal`):

| Schema 11                            | Schema 18                                | Transform / notes                                                                                    |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `conf`                               | `config_id`                              | number-or-string; default 1                                                                          |
| `extendNew` / `extendRev`            | `extend_new` / `extend_review`           | i32 in JSON, clamped ≥ 0 on 11→proto                                                                 |
| `reviewLimit` / `newLimit`           | `review_limit` / `new_limit`             | optional, _lenient_                                                                                  |
| `reviewLimitToday` / `newLimitToday` | `review_limit_today` / `new_limit_today` | object `{limit, today}`, optional, _lenient_                                                         |
| `desiredRetention`                   | `desired_retention`                      | **JSON stores integer percent** (e.g. 90); 11→proto ÷ 100, proto→11 × 100 truncated — precision loss |

Filtered decks (`Deck.Filtered`):

| Schema 11                                              | Schema 18                                                    | Transform / notes                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `resched`                                              | `reschedule`                                                 | bool-from-anything                                                               |
| `terms`                                                | `search_terms`                                               | JSON tuples `[search, limit, order]`; `limit` clamped ≥ 0 on 11→proto            |
| `separate`                                             | —                                                            | dropped on 11→proto; proto→11 always writes `true` (old clients require the key) |
| `delays`                                               | `delays`                                                     | `null`/absent ↔ empty list (proto→11 emits `null` when empty)                    |
| `previewDelay`                                         | `preview_delay`                                              | v2/old-v3 scheduler                                                              |
| `previewAgainSecs` `previewHardSecs` `previewGoodSecs` | `preview_again_secs` `preview_hard_secs` `preview_good_secs` | current v3 scheduler, default 0                                                  |

Filtered decks have no unknown-key flatten of their own — extras land in the common `other`.

## Deck preset (schema-11 `dconf` entry ↔ `deck_config` row + `DeckConfig.Config`)

Schema 11 nests SM-2 options under `new` / `rev` / `lapse`; the proto is flat. Unknown keys inside those three sub-objects are preserved as `{"new": {...}, "rev": {...}, "lapse": {...}}` entries **inside** the proto `other` JSON and split back out on downgrade (reserved keys per scope stripped: new `order delays bury perDay initialFactor ints`; rev `maxIvl hardFactor ease4 ivlFct perDay bury`; lapse `leechFails mult leechAction delays minInt`).

| Schema 11                                                                                                        | Schema 18                                                           | Transform / notes                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id` / `mod` / `name` / `usn`                                                                                    | `deck_config` table columns                                         | number-or-string                                                                                                                   |
| `maxTaken`                                                                                                       | `cap_answer_time_to_secs`                                           | i32 ↔ u32, clamped ≥ 0 on 11→proto                                                                                                 |
| `autoplay`                                                                                                       | `disable_autoplay`                                                  | **inverted**                                                                                                                       |
| `timer` (u8, _lenient_)                                                                                          | `show_timer`                                                        | `≠ 0` ↔ bool                                                                                                                       |
| `replayq` (default true)                                                                                         | `skip_question_when_replaying_answer`                               | **inverted**                                                                                                                       |
| `dyn` (_lenient_)                                                                                                | —                                                                   | legacy v1 leftover; proto→11 always writes `false`                                                                                 |
| `new.delays`                                                                                                     | `learn_steps`                                                       | minutes, floats                                                                                                                    |
| `new.perDay` (_lenient_)                                                                                         | `new_per_day`                                                       | default 20                                                                                                                         |
| `new.bury`                                                                                                       | `bury_new`                                                          | default false                                                                                                                      |
| `new.initialFactor`                                                                                              | `initial_ease`                                                      | u16 permille ↔ float (÷ 1000 / × 1000); default 2500 ↔ 2.5                                                                         |
| `new.ints`                                                                                                       | `graduating_interval_good` / `_easy`                                | JSON `[good, easy, unused]`; third element ignored, written as 0; 2-element arrays tolerated (old AnkiDroid); defaults `[1, 4, 0]` |
| `new.order` (_lenient_)                                                                                          | `new_card_insert_order`                                             | ⚠️ **values swapped**: JSON 0 = random, 1 = due (default); proto 0 = due, 1 = random                                               |
| `rev.ease4`                                                                                                      | `easy_multiplier`                                                   | default 1.3                                                                                                                        |
| `rev.ivlFct`                                                                                                     | `interval_multiplier`                                               | default 1.0                                                                                                                        |
| `rev.maxIvl`                                                                                                     | `maximum_review_interval`                                           | default 36500                                                                                                                      |
| `rev.perDay` (_lenient_)                                                                                         | `reviews_per_day`                                                   | default 200                                                                                                                        |
| `rev.hardFactor`                                                                                                 | `hard_multiplier`                                                   | default 1.2                                                                                                                        |
| `rev.bury`                                                                                                       | `bury_reviews`                                                      | default false                                                                                                                      |
| `lapse.delays` (_lenient_)                                                                                       | `relearn_steps`                                                     | default `[10.0]`                                                                                                                   |
| `lapse.leechAction` (_lenient_)                                                                                  | `leech_action`                                                      | same values (0 suspend, 1 tag-only); JSON default tag-only                                                                         |
| `lapse.leechFails`                                                                                               | `leech_threshold`                                                   | default 8                                                                                                                          |
| `lapse.minInt`                                                                                                   | `minimum_lapse_interval`                                            | default 1                                                                                                                          |
| `lapse.mult`                                                                                                     | `lapse_multiplier`                                                  | default 0.0                                                                                                                        |
| `newMix` / `interdayLearningMix`                                                                                 | `new_mix` / `interday_learning_mix`                                 | post-11 keys, plain i32 ↔ enum                                                                                                     |
| `reviewOrder` / `newSortOrder` / `newGatherPriority`                                                             | `review_order` / `new_card_sort_order` / `new_card_gather_priority` | post-11 keys, plain i32 ↔ enum                                                                                                     |
| `newPerDayMinimum`                                                                                               | `new_per_day_minimum`                                               | post-11 key                                                                                                                        |
| `buryInterdayLearning`                                                                                           | `bury_interday_learning`                                            | post-11 key                                                                                                                        |
| `fsrsWeights`                                                                                                    | `fsrs_params_4`                                                     | ⚠️ historic JSON name                                                                                                              |
| `fsrsParams5` / `fsrsParams6`                                                                                    | `fsrs_params_5` / `fsrs_params_6`                                   | post-11 keys                                                                                                                       |
| `desiredRetention`                                                                                               | `desired_retention`                                                 | **float here** (unlike the per-deck percent!); default 0.9                                                                         |
| `sm2Retention`                                                                                                   | `historical_retention`                                              | ⚠️ historic JSON name; default 0.9                                                                                                 |
| `weightSearch`                                                                                                   | `param_search`                                                      | ⚠️ historic JSON name                                                                                                              |
| `ignoreRevlogsBeforeDate`                                                                                        | `ignore_revlogs_before_date`                                        | string, default `""`                                                                                                               |
| `easyDaysPercentages`                                                                                            | `easy_days_percentages`                                             | default `[1.0] × 7`                                                                                                                |
| `stopTimerOnAnswer` `secondsToShowQuestion` `secondsToShowAnswer` `questionAction` `answerAction` `waitForAudio` | same names snake_cased                                              | post-11 keys; `waitForAudio` defaults **true**                                                                                     |
| _unknown top-level keys_                                                                                         | `Config.other`                                                      | reserved: all keys above (see `RESERVED_DECKCONF_KEYS` facts) plus the nested-scope mechanism                                      |

## Collection config, tags, graves

- **`col.conf` ↔ `config` table**: each top-level key of the schema-11 `conf` JSON object becomes one `config` row (`KEY` = key, `val` = JSON-encoded value; `usn`/`mtime_secs` = 0 on upgrade). Downgrade merges all rows back into a single JSON object. No key translation.
- **`col.tags` ↔ `tags` table**: schema-11 JSON map `{tag: usn}` ↔ one row per tag. The v17 columns `collapsed`/`config` have no schema-11 home and are **lost on downgrade** (fresh upgrade sets `collapsed = false`, `config = null`).
- **`graves`**: same columns in both schemas (v18 only adds the `(oid, type)` PK and usn index); no value conversion.
- **`notes` / `cards` / `revlog`**: identical shape in both schemas; `cards.data` JSON (FSRS state) passes through untouched.

## Gotchas checklist (things a naive converter gets wrong)

1. `new.order` enum values are **swapped** between dialects (see table).
2. `autoplay` and `replayq` are **inverted** relative to their proto counterparts.
3. Deck-level `desiredRetention` is an integer **percent**; preset-level `desiredRetention` is a **float**. Same key name, different scales.
4. `fsrsWeights`, `sm2Retention`, `weightSearch` are historic JSON names for `fsrs_params_4`, `historical_retention`, `param_search`.
5. Deck names: `::` (11) ↔ `\x1f` (18).
6. `initialFactor` is permille (2500) vs `initial_ease` float (2.5).
7. Today counters: four `[day, amount]` pairs ↔ one day + four amounts, with stale-day amounts zeroed on upgrade.
8. Template `mtime`/`usn` don't exist in schema 11 — zero them on 11→proto, expect their loss on proto→11.
9. Filtered decks: emit `separate: true` and (for old readers) tuple-shaped `terms`/`req` arrays — these are serde tuples, not objects.
10. proto→11 must strip reserved keys from `other` before splatting, or add-on keys could shadow real fields.
11. Numbers may arrive as strings in schema-11 JSON (ids, `mod`, `conf`); parse tolerantly.
12. `bsize` is u8 in JSON — browser font sizes > 255 truncate on downgrade.

## Loss inventory

**proto→11 (modern → legacy), even with all post-11 keys emitted:**

- per-template `mtime_secs`/`usn` (zeroed)
- per-deck `desired_retention` precision (float → integer percent)
- per-tag `collapsed`/`config`
- today-counter per-counter days (collapsed to one day)
- `config`-table rows' individual `usn`/`mtime_secs` (merged into one JSON object)

**11→proto (legacy → modern):**

- filtered-deck `separate` and obsolete `return` keys (deliberately dropped; meaningless since scheduler v1)
- nothing else — unknown keys ride through `other`

Everything else round-trips, including FSRS parameters and stable field/template ids, **provided the converter implements the post-11 keys above**.
