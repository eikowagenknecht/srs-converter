# Mochi Format Research

Part of Story 5.0.1 (format analysis for the universal SRS format design).
Researched 2026-07-10 against the official Mochi docs and a real 6 MB `.mochi` export.

Mochi ships **two** serializations that differ: (a) the `.mochi` **export archive** uses **Transit-encoded JSON/EDN** (verified against a real export), (b) the **REST API** returns plain kebab-case JSON. Field _names_ are the same set; encoding of keywords/timestamps/collections differs.

## 1. The `.mochi` export archive

- A `.mochi` file is a **ZIP** containing exactly one manifest — `data.edn` **or** `data.json` (JSON recommended for large sets) — plus **media files at the archive root** (flat).
- **Transit semantics.** The JSON manifest is Transit-JSON. Markers seen in real data:
  - `~:foo` → EDN keyword `:foo` (all map keys and keyword values, incl. ids: `~:ZtHhPrKV`)
  - `{"~#list":[…]}` → vector/list; `{"~#set":[…]}` → set
  - `{"~#dt":1694628450954}` → instant, **epoch-millis** (used for `created-at`/`updated-at`/`trashed?`)
  - `"~t1695852000000"` → time scalar, epoch-millis string (used for review `date`/`due`)
  - Namespaced keywords: `~:sort-by/new-cards`, `~:cloze/indexes`, `~:cloze/reviews`, `~:reverse/needs-rereview?`
- **EDN variant**: same shape in native EDN — `{:version 2 :decks […]}`; timestamps as `#inst` (inferred, not verified against a raw `.edn`).

### Top-level manifest

Required `:version 2`. Optional `:decks` (vector), `:cards` (vector; each **must** carry `:deck-id`), `:templates`. Decks may nest their cards inline under `:cards`. Minimal valid example (docs):

```edn
{:version 2 :decks [{:name "Sample deck" :cards [{:content "Sample card"} {:content "Another"}]}]}
```

### Deck keys (from real export)

`:name` (required), `:id` (keyword, `[0-9A-Za-z]`, globally unique, min 8 chars), `:parent-id` (**nesting mechanism**), `:cards`, `:sort` (int), `:sort-by` (`:none|:lexicographically|:created-at|:updated-at|:retention-rate-asc|:interval-length`), `:sort-by-direction` (bool), `:sort-by/new-cards`, `:sort-by/quick-study`, `:cards-view` (`:list|:grid|:note|:column`), `:show-nested-cards?`, `:template-id` (deck default template), `:filters` (smart-deck filters), `:published?`, `:trashed?` (**timestamp**, not boolean — soft delete), `:archived?` (bool, API-side).

### Card keys (union from real export)

`:content` (required; **Markdown**; empty `""` when template-driven), `:deck-id`, `:id`, `:name` (used for `[[links]]`), `:pos` (string, lexicographic order), `:fields` (map fieldId→`{:id … :value …}`; value string|bool), `:template-id`, `:tags` (`#set` of bare strings — manual tags), `:references` (`#set` of card ids — outgoing `[[links]]`), `:cloze/indexes` (`#set` of cloze group indices), `:review-reverse?`, `:archived?`, `:trashed?` (timestamp), `:new?` (still in Learn phase), `:needs-rereview?`, `:duplicated-from`, `:created-at`/`:updated-at` (`#dt`), `:component-cache` (memoized generated media/AI: TTS `.mp3`, image-search `.jpg`, AI text — keyed by rendered param string, `:attachment` holds the short filename).

Scheduling state lives in **`:reviews`** plus parallel arrays **`:reverse-reviews`** (+`:reverse/needs-rereview?`) and **`:cloze/reviews`** (+`:cloze/needs-rereview?`).

Note: the export has **no card-level attachments map**; the REST API response does (`"attachments": {}`). In the export, media is referenced inline in `:content` and via `:component-cache`.

Media in Markdown content uses an **`@media/` prefix**: `![](@media/foobar03.png)` (verified in real data), resolving to a file at the archive root.

## 2. Data model specifics

- **Decks:** hierarchical via `:parent-id`; carry view/sort settings + optional default `:template-id`; `:filters` power smart decks. Archive = `:archived?`; trash = `:trashed?` timestamp.
- **Front/back vs multi-field — two orthogonal mechanisms:** (1) **plain cards** put everything in `:content` Markdown, sides split by a `---` line — **N sides, not just 2**; (2) **template cards** define named `:fields`; card `:content` is empty and the _template's_ `:content` renders them.
- **Templates:** `:id`, `:name` (1–64), `:content` (Markdown with **`<< Field name >>`** placeholders; mustache-style sections `<< #bool >>…<</ bool >>`, `<< ^bool >>…<</ bool >>`), `:fields` (map), `:pos`, `:style {:text-alignment …}`, `:options {:show-sides-separately? bool}`. Primary field id is literally `:name`.
- **Field types** go well beyond text: `:text :boolean :number :draw :ai :speech :image :translate :transcription :dictionary :pinyin :furigana`, with type-specific `:options` (`:multi-line?`, `:hide-term`, `:ai-task`, `:lang`, …) and `:source` (derive from another field).
- **Tags:** manual (`:tags` set) + **inline `#tag`** in content. API separates `manual-tags` vs combined `tags`. Flat.
- **References:** `[[card-id]]`, `[[Title|card-id]]`, transclusion `![[card-id]]`, `![[card-id/1]]` (side), `![[card-id/field-id]]`, `![[self/1]]`; captured structurally in `:references`.

## 3. Scheduling

- **Algorithm: simple interval-doubling, not SM-2/FSRS.** Two buttons: **Remembered** (≈ ×2) and **Forgot** (≈ ×0.5, then re-review). No ease factor, no 4-button grades. (Third-party "SM-2-based" claims are inaccurate — doubling verified in real review history: 2.09 → 4.16 → 8.12 → 16.87 → _(Forgot)_ 9.04 → 17.8 → 35.79 → 71.23 → 90 (capped).)
- **Learn vs Review:** new cards (`:new? true`) sit in a Learn phase. First Forgot → **re-review queue** (`:needs-rereview? true`); forgetting again → interval reset; no hard retirement (Archive removes from queues).
- **Per-card scheduling state = the `:reviews` vector.** Each review map: `:date`, `:due`, `:interval` (days — **fractional and even negative** for same-day micro-steps: seen `0.17, 0.01, 0, -0.01, -0.04`), `:remembered?` (bool), plus (real data, undocumented) `:duration` (seconds), `:rereview?` (bool). First review often omits `:interval`.
- **Parallel schedules per card:** reverse direction and each cloze group are scheduled independently (`:reverse-reviews`, `:cloze/reviews`) — **one card, multiple schedules**.
- **No FSRS support** anywhere (verified against docs/changelog/data).

## 4. REST API (alternative import path)

- Base `https://app.mochi.cards/api/`; HTTP Basic with API key as username (`-u key:`); **Pro subscription required**; **one concurrent request** per account (429 on burst); JSON or transit+json.
- Plain kebab-case JSON; timestamps as `{"date":"2021-09-10T01:29:49.879Z"}` (ISO-8601).
- Endpoints: `GET/POST /cards`, `GET/POST/DELETE /cards/:id`, attachments `POST|DELETE /cards/:id/attachments/:filename`; `GET/POST /decks`, `GET/POST/DELETE /decks/:id`; `GET|POST /templates`; `GET /due`, `GET /due/:deck-id`. Pagination via `bookmark`, `limit` 1–100.
- **Caveat:** writing full historical review arrays is not a documented create param — the API suits CRUD, not bulk history import. **For fidelity, parse the `.mochi` archive.**

## 5. Cloze

- Inline **`{{text}}`**; multiple bare clozes hidden **together** (one prompt).
- **Grouped:** `{{1::text}}`, `{{2::text}}` → one prompt per index group with independent scheduling — like Anki, but as **cloze schedules within one card**, not separate card records (`:cloze/indexes` + `:cloze/reviews`). Image-occlusion "Diagram cards" use the same per-mask scheduling.

## 6. Identity & timestamps

- Ids: 8+ char `[0-9A-Za-z]` strings, globally unique (cards/decks/templates/fields share the scheme). EDN/Transit: keywords (`~:ZtHhPrKV`); API: plain strings.
- Timestamps: export `{"~#dt":<epoch-ms>}` and `"~t<epoch-ms>"`; EDN `#inst` (inferred); API ISO-8601 maps. `:trashed?` doubles as soft-delete flag.

## 7. Import paths Mochi itself supports (ecosystem context)

- Native `.mochi` (full fidelity incl. **review history**), **Anki `.apkg`** (incl. review history; HTML→Markdown conversion, CSS/JS stripped), **Markdown** (one card per file or split on delimiter; folders→subdecks; loses history), **CSV** (loses history/templates/tags).

## Mapping notes (→ universal SRS format)

| Universal concept | Mochi equivalent                                                                        | Notes                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deck              | ✅ first-class, hierarchical (`:parent-id`)                                             | Extra: per-deck sort/view settings, smart-deck filters, `:published?`                                                                            |
| Note type         | `:templates` with typed `:fields`                                                       | Richer field _types_ than Anki (ai/speech/translate/furigana…), but only **one content body with `---` sides** — no per-template qfmt/afmt pairs |
| Note              | ⚠️ **No note/card split**                                                               | The card is the unit. Anki note × N cards must fold into sides/reverse/cloze — or explode into several Mochi cards                               |
| Card              | The card — but schedulable units are `:reviews` / `:reverse-reviews` / `:cloze/reviews` | One card can carry several independent schedules                                                                                                 |
| Review            | ✅ full history retained                                                                | `:date :due :interval :remembered? :duration :rereview?` — but **binary grade only** (lossy vs 4-grade/6-grade systems)                          |
| Media             | archive-root files, `![](@media/…)` refs                                                | No checksum/dedup metadata in export                                                                                                             |
| Tags              | manual set + inline `#tags`                                                             | Flat; no hierarchy guarantee                                                                                                                     |
| Scheduling state  | interval + due + lapse flags                                                            | No ease/FSRS params; nothing richer can live natively                                                                                            |

Universal-format implications: the rating model must represent a **binary scale** without fabricating grades; "one card, multiple parallel schedules" challenges a card=schedulable-unit assumption (cloze groups and reverse direction as _sub-schedules_); content is Markdown with `---` side separators (supports N sides).

## Sources

- <https://mochi.cards/docs/import-and-export/mochi-format-reference/> — verified primary (manifest schema, deck/card/template/field/review keys)
- <https://mochi.cards/docs/import-and-export/exporting/>, `/importing/` — verified primary
- <https://mochi.cards/docs/api/> — verified primary (endpoints, auth, rate limit)
- <https://mochi.cards/docs/reviewing>, `/reviewing/cloze-deletions/` — verified primary
- <https://mochi.cards/docs/markdown/advanced-formatting/>, `/docs/cards/` — verified primary
- <https://github.com/AlexW00/mochi2anki> (`data.json`) — **verified real 6 MB Transit-JSON export**; highest-confidence source for internals
- <https://github.com/mochi-cards/open-source> — ecosystem index

Uncertainties: EDN `#inst` form inferred (Transit-JSON equivalent verified); the observed 90-day interval cap presumed to be a per-deck max-interval setting; exact re-review jitter formula unpublished.
