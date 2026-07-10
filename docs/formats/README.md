# SRS Format Research & Comparison

Deliverable of **Story 5.0.1** (re-scoped 2026-07-10): research-based analysis of all target formats to ground the universal SRS format design (Phase 5).

Per-format dossiers (schemas, semantics, verified sources):

- [Anki](anki.md) — legacy 2 + modern schema 18 / FSRS
- [Mnemosyne](mnemosyne.md)
- [SuperMemo](supermemo.md)
- [Mochi](mochi.md)
- [Prior art: interchange formats](prior-art.md) — CrowdAnki, genanki, FSRS datasets, Obsidian/Logseq, dead standards, cross-domain lessons

Design decisions derived from this research: [open-decisions.md](open-decisions.md) (ADR backlog).

---

## Comparison Matrix

| Dimension                             | Anki                                                                                                                   | Mnemosyne                                                                                       | SuperMemo (Windows)                                                                                 | Mochi                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Storage**                           | SQLite in zip (`.apkg`/`.colpkg`); legacy JSON blobs or modern protobuf tables + zstd                                  | SQLite (`default.db`); XML/`.cards` zip for exchange                                            | Proprietary binary collection; **XML export is the only viable exchange path**                      | Zip with Transit-JSON/EDN manifest (`.mochi`); REST API                              |
| **Content format**                    | **HTML** (+ `[sound:]`, LaTeX, MathJax)                                                                                | HTML-ish text (media via HTML attrs)                                                            | **HTML** (components)                                                                               | **Markdown** (`---` side separators, `@media/` refs)                                 |
| **Note/card split**                   | ✅ note → cards via templates                                                                                          | ✅ fact → cards via fact views                                                                  | ❌ item _is_ the card                                                                               | ❌ card only — but **multiple schedules per card** (front, reverse, per-cloze-group) |
| **Note type model**                   | Fields + templates (qfmt/afmt) + CSS + cloze kind                                                                      | CardType + FactViews (per-view q/a key lists)                                                   | Templates + components — **not exported to XML**                                                    | Templates, typed fields (`text/speech/ai/…`), one content body                       |
| **Deck concept**                      | Flat map, hierarchy by name `::`; **cards** belong to decks; config presets; filtered decks                            | ❌ none — tags + saved sets (criteria)                                                          | ❌ none — single **knowledge tree** (topics/concepts as structure)                                  | ✅ first-class hierarchy via `parent-id`; per-deck settings/filters                  |
| **Tags**                              | Space-separated on note, `::` hierarchy                                                                                | First-class objects (UUID), `::` hierarchy                                                      | ❌ none (concepts ≈ categories)                                                                     | Manual set + inline `#tags`, flat                                                    |
| **Grading scale**                     | **1–4** (1 = fail)                                                                                                     | **0–5** (0–1 = fail)                                                                            | **0–5** (<3 = fail)                                                                                 | **Binary** (remembered/forgot)                                                       |
| **Scheduler**                         | SM-2 variant or **FSRS** (per-preset weights, per-card memory state)                                                   | SM-2 variant (acquisition/retention phases, EF floor 1.3)                                       | SM-15/17/18 (A-factors → DSR model, **state derived from full history**)                            | Interval doubling (×2 / ×0.5), no ease                                               |
| **Per-card scheduling state**         | type/queue/due/ivl/factor/reps/lapses/left + FSRS `s,d,dr,decay` in `cards.data`                                       | grade, easiness, acq/ret reps (+since-lapse), lapses, last/next_rep, active                     | A-factor, interval, reps, lapses, last-rep (aggregates only in XML)                                 | Derived from review array: due, interval, `new?`, re-review flags                    |
| **Review history**                    | `revlog`: ms timestamp, ease, ivl/lastIvl, factor, duration (ms), type 0–5                                             | **Richest**: + easiness trace, scheduled vs actual interval, thinking time, full CRUD event log | Exists internally (`RepetitionHist.dat`) but **not exportable via XML** (separate text export only) | Full per-review array: date, due, interval, remembered?, duration, rereview?         |
| **Media**                             | Numeric-renamed files + manifest (JSON legacy / **sha1 protobuf** modern)                                              | `<db>_media/` real filenames + **hash table**, out-of-band sync                                 | Registry-deduplicated blobs; XML refs by absolute path + **Q/A side flags**                         | Files at archive root, `@media/` markdown refs, no hashes                            |
| **Identity**                          | ids = creation epoch ms (collection-local); note `guid` (base91) for cross-collection dedup; 64-bit template/field ids | Dual: public UUID `id` + local rowid `_id`                                                      | Tree position + element ID (local int)                                                              | 8+ char alphanumeric ids, globally unique                                            |
| **Timestamps**                        | Mixed: ms (ids, revlog), s (col.crt, mod), **days since crt** (review due)                                             | **Seconds** everywhere; next_rep UTC-midnight-quantized + `day_starts_at` offset                | Dates (DD.MM.YYYY in XML); hours only since 2006                                                    | **Epoch ms** (Transit `~#dt`/`~t`); ISO-8601 in API                                  |
| **App-specific/plugin data**          | `data` columns, unknown JSON keys, proto `other` bytes                                                                 | `extra_data` dicts on every object                                                              | —                                                                                                   | `component-cache`, misc keys                                                         |
| **Realistic import fidelity ceiling** | Full (content + scheduling + history + media)                                                                          | Full (content + scheduling + history + media)                                                   | **Content + tree + aggregate scheduling only** — no history, no note types                          | Full (content + history + media); grades only binary                                 |

## Shared Concepts (the universal core)

Present in all four formats, in some form:

1. **A reviewable unit** ("card") with per-unit scheduling state
2. **Content** organized as fields/sides that render into question/answer
3. **A grading event stream** — every format records at least (when, what unit, pass/fail-or-grade); all but SuperMemo-XML can export it
4. **Templates/types** describing how content becomes reviewable units (weakest in SuperMemo)
5. **Some organizing structure** — deck, tag, tree, or criterion
6. **Media referenced from content**, stored beside the data
7. **An escape hatch** for app-specific data (`data`, `extra_data`, `other`, `component-cache`)

## Divergences the universal format must absorb

1. **Grading scales**: 1–4 / 0–5 (two different fail thresholds!) / binary. A normalized enum destroys information in both directions → store the **original value + declared scale semantics** (see D1).
2. **Note/card split exists only in Anki and Mnemosyne.** Mochi and SuperMemo are card-only; Mochi additionally hangs _multiple independent schedules_ off one card (reverse, cloze groups) (see D10).
3. **"Deck" means four things**: card-attached flat namespace (Anki), note-attached hierarchy (Mochi), tags/criteria (Mnemosyne), knowledge tree (SuperMemo) (see D6).
4. **Content dialects**: HTML vs Markdown, with provably lossy conversion (see D2).
5. **Template languages**: Anki `{{...}}` conditionals/cloze/type-in, Mnemosyne fact views, Mochi `<< >>` mustache-lite, SuperMemo components — mutually untranslatable (see D2/D7 in open-decisions).
6. **Scheduler state**: only meaningful within its own algorithm (FSRS proves it's _derivable from the log_; SuperMemo DSR proves it's _underivable from snapshots_) → log-as-truth, snapshots as namespaced caches (D1).
7. **Cloze models**: Anki `{{c1::…}}` → separate cards; Mnemosyne `[…]` → sister cards; Mochi `{{1::…}}` → sub-schedules of one card; SuperMemo → independent child items.
8. **Timestamp regimes**: ms vs s vs day-quantized-with-offset vs date-only.

## Scheduling algorithm commonalities

- All four descend conceptually from SM-2's insight (grade → interval growth), but state is mutually untranslatable: EF (Mnemosyne) ≈ factor/1000 (Anki) but with different update rules and fail thresholds; A-factors (SM) and FSRS (s, d) are different models entirely; Mochi has no ease at all.
- **The review log is the only cross-format currency.** FSRS can retrain from (timestamp, rating, state); Mnemosyne/Anki logs carry enough; Mochi's binary log is a degraded-but-usable signal; SuperMemo's log is trapped (import → start fresh, or ingest its separate history export).
- Minimal universal review record justified by research: **card id, timestamp, rating (original scale), duration, review kind, scheduled vs actual interval** (the last two: Mnemosyne/Anki have them, FSRS benefits, others omit).

## Media handling approaches

All formats reference media from content and store bytes beside the data; the deltas are: filename indirection (Anki numeric remap vs real names elsewhere), integrity metadata (sha1 in modern Anki, hash in Mnemosyne, none in Mochi/legacy Anki), and side-assignment (SuperMemo's Q/A flags — the only format where media placement isn't in the content itself). → Universal: real filenames + content hash + mime in a manifest; placement stays in content, with a side-flag extension slot for SuperMemo (D7).

## Unique features needing preservation (per format)

- **Anki**: FSRS memory state + per-preset weights, filtered decks, sibling burying config, `{{type:}}`/`{{hint:}}` templates, per-template deck overrides, colored flags, note guid.
- **Mnemosyne**: acquisition/retention distinction, scheduled-vs-actual interval, thinking time, criteria (saved sets), fact-view decorators, `type_answer` flag.
- **SuperMemo**: knowledge-tree topology, topic vs item distinction, extract/cloze lineage, A-factor/priority/forgetting-index, media side flags.
- **Mochi**: parallel per-card schedules (reverse/cloze), typed generated fields (speech/AI/translate), card references `[[…]]`/transclusion, `pos` ordering, component cache.

None of these have (or should have) first-class universal fields — they motivate the **namespaced extension blocks with restore obligations** (D4).
