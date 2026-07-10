# Mnemosyne Format Research

Part of Story 5.0.1 (format analysis for the universal SRS format design).
Researched 2026-07-10 against the current `mnemosyne-proj/mnemosyne` master.
Confidence tags: **[src]** verified against source code, **[doc]** official docs, **[sec]** secondary, **[?]** uncertain.

## 1. Main storage: `default.db` SQLite schema [src]

Single SQLite file `default.db`. Default location: `$HOME/.local/share/mnemosyne/` (Linux), `%APPDATA%\Mnemosyne\` (Windows) [doc]. Schema version constant = `"4"` (stored in `global_variables`). Full `CREATE TABLE` set (verbatim from `libmnemosyne/databases/SQLite.py`):

```sql
CREATE TABLE facts(_id INTEGER PRIMARY KEY, id TEXT, extra_data TEXT DEFAULT "");
CREATE TABLE data_for_fact(_fact_id INTEGER, key TEXT, value TEXT);
CREATE TABLE cards(
    _id INTEGER PRIMARY KEY, id TEXT, card_type_id TEXT, _fact_id INTEGER,
    fact_view_id TEXT, question TEXT, answer TEXT, tags TEXT,
    grade INTEGER, next_rep INTEGER, last_rep INTEGER, easiness REAL,
    acq_reps INTEGER, ret_reps INTEGER, lapses INTEGER,
    acq_reps_since_lapse INTEGER, ret_reps_since_lapse INTEGER,
    creation_time INTEGER, modification_time INTEGER,
    extra_data TEXT DEFAULT "", scheduler_data INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT 1);
CREATE TABLE tags(_id INTEGER PRIMARY KEY, id TEXT, name TEXT, extra_data TEXT DEFAULT "");
CREATE TABLE tags_for_card(_card_id INTEGER, _tag_id INTEGER);
CREATE TABLE criteria(_id INTEGER PRIMARY KEY, id TEXT, name TEXT, type TEXT, data TEXT);
CREATE TABLE global_variables(key TEXT, value TEXT);
CREATE TABLE log(
    _id INTEGER PRIMARY KEY AUTOINCREMENT, event_type INTEGER, timestamp INTEGER,
    object_id TEXT, grade INTEGER, easiness REAL, acq_reps INTEGER, ret_reps INTEGER,
    lapses INTEGER, acq_reps_since_lapse INTEGER, ret_reps_since_lapse INTEGER,
    scheduled_interval INTEGER, actual_interval INTEGER, thinking_time INTEGER,
    next_rep INTEGER, scheduler_data INTEGER);
CREATE TABLE partnerships(partner TEXT UNIQUE, _last_log_id INTEGER);
CREATE TABLE media(filename TEXT PRIMARY KEY, _hash TEXT);
CREATE TABLE fact_views(id TEXT PRIMARY KEY, name TEXT, q_fact_keys TEXT, a_fact_keys TEXT,
    q_fact_key_decorators TEXT, a_fact_key_decorators TEXT,
    a_on_top_of_q BOOLEAN DEFAULT 0, type_answer BOOLEAN DEFAULT 0, extra_data TEXT DEFAULT "");
CREATE TABLE card_types(id TEXT PRIMARY KEY, name TEXT, fact_keys_and_names TEXT,
    unique_fact_keys TEXT, required_fact_keys TEXT, fact_view_ids TEXT,
    keyboard_shortcuts TEXT, extra_data TEXT DEFAULT "");
```

Key notes:

- `cards.question` / `cards.answer` are **denormalized cached rendered HTML** for search/browse; authoritative content lives in `data_for_fact`. `cards.tags` is likewise a cached comma-joined string; the normalized truth is `tags_for_card`.
- `data_for_fact` is an EAV table: one row per (fact, key). E.g. `(_fact_id=7, key="f", value="Bonjour")`, `(7, "b", "Hello")`.
- Built-in `card_types` and `fact_views` are **not** normally stored as rows (they are code-defined); the tables hold user-created/plugin types. They are, however, emitted into the log/XML on export.
- `extra_data` columns hold a serialized Python dict. For cloze cards, `cards.extra_data` = `{"cloze": <matched text>, "index": <n>}` [src].

## 2. Fact / card / card-type model [src]

Three-layer model: **Fact** (raw data, dict of key→value) → **CardType** (defines fact keys + one or more **FactViews**) → **Card** (one per fact-view, carries scheduling state). A card = fact ∩ fact_view. `cards.card_type_id` → card type; `cards.fact_view_id` → a specific view (id form `"<card_type_id>.<n>"`, e.g. `"1.1"`, `"2.2"`).

Built-in card types (verbatim from `libmnemosyne/card_types/`):

| id    | name                            | fact keys                                                      | views (q→a)                                               | unique | required  |
| ----- | ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | ------ | --------- |
| `"1"` | Front-to-back only              | `f`(Front), `b`(Back)                                          | `1.1`: f→b                                                | `[f]`  | `[f]`     |
| `"2"` | Front-to-back and back-to-front | `f`, `b`                                                       | `2.1`: f→b; `2.2`: b→f                                    | `[f]`  | `[f,b]`   |
| `"3"` | Vocabulary                      | `f`(Foreign), `p_1`(Pronunciation), `m_1`(Meaning), `n`(Notes) | `3.1` recognition: f→p_1,m_1; `3.2` production: m_1→f,p_1 | `[f]`  | `[f,m_1]` |
| `"5"` | Cloze deletion                  | `text`                                                         | one view per cloze                                        | —      | `[text]`  |
| `"6"` | Sentence (subclass of Cloze)    | `f`(Sentence), `p_1`, `m_1`, `n`                               | recognition + cloze-production                            | `[f]`  | `[f]`     |

- Fact keys `"f"`/`"b"` are the canonical Front/Back keys; multi-field types use `p_1`, `m_1`, `n`. [?] Card type id `"4"` not confirmed among built-ins.
- BothWays generates 2 cards per fact; FrontToBack 1; Vocabulary/Sentence 2+.
- **Cloze [src]**: single `text` fact key. Marker regex `r"\[(.+?)\]"` (DOTALL). Syntax `[answer]` or `[answer:hint]`. One Card per match; `{"cloze": <text>, "index": i}` stored in `card.extra_data`. All cloze cards share one fact.

## 3. Scheduling — Mnemosyne SM-2 variant [src]

From `schedulers/SM2_mnemosyne.py`. Grades **0–5**, plus **`-1` = unseen/new**. **Threshold differs from classic SM-2 and from Anki: only grades 0 and 1 are "wrong"** (card is/returns to _acquisition_); **grades 2–5 are "correct"** (_retention_). Classic SM-2 treats <3 as wrong — flag this deviation for mapping.

Two phases per card:

- **Acquisition** (grade ∈ {0,1}): not yet memorised; interval 0 (re-shown same session).
- **Retention** (grade ∈ {2..5}): memorised; day-scale intervals.

Per-card scheduling state (columns on `cards`): `grade`, `easiness` (EF, default **2.5**, floor **1.3**), `acq_reps`, `ret_reps`, `lapses`, `acq_reps_since_lapse`, `ret_reps_since_lapse`, `last_rep`, `next_rep`, `scheduler_data`.

`grade_answer` transitions:

- **New card** (grade -1): `easiness=2.5`; initial interval by grade: `(0, 0, 1, 3, 4, 7)` days for grades 0–5 (0/1 stay in acquisition).
- **Acquisition→acquisition** (new grade 0/1): interval 0.
- **Acquisition→retention** (promotion): first retention rep → interval `6 * DAY` (classic SM-2 I(2)=6).
- **Lapse** (retention + new grade 0/1): `lapses+=1`, `*_since_lapse=0`, interval 0 → back to acquisition.
- **Retention→retention**: `new_interval = actual_interval * easiness` (uses _actual_ elapsed time, so late-but-correct reviews earn credit), minimum 1 day.

Easiness update (only for on-time or late reps, not learn-ahead): grade 2 → −0.16, grade 3 → −0.14, grade 5 → +0.10, floor 1.3. **Grades 0, 1, 4 → no change.**

Interval noise (anti-clumping): ±1 day (short), ±3 days (medium), ±5% (long).

Queue order: scheduled due reviews → failed/acquisition → unseen → new → learn-ahead.

## 4. Review / history log [src]

The `log` table is an append-only event history (also the sync changeset source and the anonymized "science log"). Event types (`openSM2sync/log_entry.py`):

`1 STARTED_PROGRAM, 2 STOPPED_PROGRAM, 3 STARTED_SCHEDULER, 4 LOADED_DATABASE, 5 SAVED_DATABASE, 6 ADDED_CARD, 7 EDITED_CARD, 8 DELETED_CARD, 9 REPETITION, 10-12 TAG CRUD, 13-15 MEDIA CRUD, 16-18 FACT CRUD, 19-21 FACT_VIEW CRUD, 22-24 CARD_TYPE CRUD, 25-27 CRITERION CRUD, 28 EDITED_SETTING, 29 WARNED_TOO_MANY_CARDS`.

A **REPETITION (9)** logs: `object_id` (card id), `timestamp`, `grade`, `easiness`, `acq_reps`, `ret_reps`, `lapses`, `acq_reps_since_lapse`, `ret_reps_since_lapse`, `scheduled_interval` (interval the card was due at), `actual_interval` (real elapsed since `last_rep`), `thinking_time` (seconds to answer), `next_rep`, `scheduler_data`.

This is the **richest review log of all researched formats** (scheduled vs. actual interval, thinking time, full easiness trace, plus CRUD events for every object).

## 5. Export / import formats [src]

Everything is expressed as **log entries** serialized via `openSM2sync` (same machinery powers sync, `.cards`, and XML export).

**XML format** (`openSM2sync/text_formats/xml_format.py`): root `<openSM2sync number_of_entries='N'>`; each event is a `<log>` element. Scalar fields become attributes; fact data keys become child elements. Example (docstring, verbatim):

```xml
<openSM2sync number_of_entries='5'>
<log type='1' o_id='Mnemosyne 2.0-pre posix linux2' time='1268213369'></log>
<log type='6' o_id='068c2472-b1f7-424d-aefa-ae723437702e' time='1268213369'><name>abcd</name></log>
</openSM2sync>
```

An ADDED_FACT (16) carries fact data as child tags (`<f>Bonjour</f><b>Hello</b>`); a REPETITION (9) carries `gr,e,sch_i,act_i,th_t,…` as attributes. Tag names starting with a digit are prefixed `"___"`.

**`.cards` sharing format** (`file_formats/mnemosyne2_cards.py`): **ZIP** containing `cards.xml` (log entries for tags/fact views/card types/media/facts/cards), a `METADATA` text file (`key:value`), plus referenced media files. Two modes: **merging DBs** preserves scheduling (`c_time,m_time,gr,e,ac_rp,rt_rp,lps,l_rp,n_rp`); **sharing** **resets** scheduling (`grade=-1, easiness=2.5, reps=0, last/next_rep=-1`).

**`.db` import** merges another Mnemosyne 2 SQLite DB. Legacy `.mem` (1.x pickle), tab/text importers exist — and notably a built-in **Anki2 importer** (`file_formats/anki2*`), a ready reference for Anki↔Mnemosyne concept mapping.

## 6. Media handling [src]/[doc]

- Media dir = database path + `"_media"` suffix (`default.db_media/`); paths stored as Unix-style relative paths.
- `media` table: `filename` (relative path, PK) → `_hash` (checksum for change detection).
- Facts reference media by embedding **HTML**: detected via regex on `src="…"` / `data="…"` attributes (`<img src="mona-lisa.jpg">`, `<audio src="a.wav">`).
- Media travels **out of band** in sync/export: only pathnames appear in log events; bytes transfer separately.

## 7. Identity & sync [src]

- Every object (fact, card, tag, fact_view, card_type, criterion) has a public **`id`** (UUID hex string, stable across machines) and an internal **`_id`** (SQLite rowid, machine-local). Always export the UUID.
- Sync (`openSM2sync`) is **log-replay**: per **partnership** only the index of the last synced log entry is stored (`partnerships`). No cycles allowed in the sync graph. Anonymous machine ids per device.

## 8. Tags & the "deck" question [src]

- **No decks.** Organization is by **tags** + **saved sets (activity criteria)**.
- Tags are first-class objects (`id` UUID, `name`, `extra_data`); **hierarchical via `"::"`** in the name (`Languages::French::Verbs`). Reserved internal tag `__UNTAGGED__`.
- **Saved sets = `criteria`**: default criterion stores must-have tag ids, forbidden tag ids, and deactivated card-type/view combos; drives `cards.active`. Closest analogue to a filtered deck.

## 9. Timestamps [src]

- All time columns are **integer seconds** since the Unix epoch. `DAY = 86400`.
- `next_rep` is normalized to **UTC midnight** (day granularity); the scheduler re-applies a `day_starts_at` config offset (hours) plus local tz/DST at query time. Retention intervals are day-quantized; acquisition cards use interval 0.

## Mapping notes (→ universal SRS format)

| Universal concept | Mnemosyne equivalent                                                                  | Notes                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Deck              | _Missing._ Tags or saved sets (criteria)                                              | A universal deck likely maps to a Mnemosyne tag (round-trips cleanly); criteria ≈ filtered decks              |
| Note type         | **CardType** (+ FactViews)                                                            | Rich, first-class. FactView ≈ Anki template; per-view q/a key lists                                           |
| Note              | **Fact** (EAV `data_for_fact`)                                                        | Arbitrary key→value fields; UUID identity                                                                     |
| Card              | **Card** (one per fact_view)                                                          | `fact_view_id` ≈ template ordinal; carries scheduling + cached rendered q/a                                   |
| Review            | `log` REPETITION rows                                                                 | **Richer than Anki**: easiness trace, scheduled vs. actual interval, thinking time. Grade 0-5 (0-1 = wrong!)  |
| Media             | `<db>_media/` + `media(filename, _hash)`                                              | Real relative filenames + content hash — cleaner than Anki's integer remapping                                |
| Tags              | first-class, `::`-hierarchical                                                        | Direct map to Anki tags                                                                                       |
| Scheduling state  | grade, easiness (EF 1.3+), acq/ret reps (+since-lapse), lapses, last/next_rep, active | Phases acquisition/retention differ from Anki's new/learning/review/relearning; easiness ≈ Anki `factor/1000` |

Key mapping hazards: grade scale semantics (0-1 wrong vs. Anki's 1 = Again), timestamps in **seconds** (Anki: ms), `next_rep` day-quantization with `day_starts_at` offset, dual identity (`id` vs `_id`).

## Sources

Primary source code (raw master), all [src]-verified:

- Schema: `mnemosyne/libmnemosyne/databases/SQLite.py`; media: `SQLite_media.py`
- Log/events: `openSM2sync/log_entry.py`; XML: `openSM2sync/text_formats/xml_format.py`; sync: `openSM2sync/README`
- Scheduler: `mnemosyne/libmnemosyne/schedulers/SM2_mnemosyne.py`
- Card types: `mnemosyne/libmnemosyne/card_types/{front_to_back,both_ways,vocabulary,cloze,sentence}.py`
- `.cards` format: `mnemosyne/libmnemosyne/file_formats/mnemosyne2_cards.py`
- Tags: `libmnemosyne/tag.py`; saved sets: `libmnemosyne/criteria/default_criterion.py`

All under <https://github.com/mnemosyne-proj/mnemosyne>. Docs: <https://mnemosyne-proj.org/>.

Uncertainties: card type id `"4"` unconfirmed; exact acquisition-branch ordering and timezone math in `true_scheduled_interval` should be re-read line-by-line before implementation; grade UI labels approximate (only the 0-1/2-5 split is code-verified).
