# The Universal SRS Format (USF) — Specification Draft

```text
Version:  1.0.0-draft.1
Date:     2026-07-10
Status:   DRAFT — not yet implemented; do not build against this until accepted
Editors:  Eiko Wagenknecht
```

## 1. Introduction

### 1.1 Purpose

The Universal SRS Format (USF) is an open, application-neutral interchange format for spaced-repetition data: decks, note types, notes, cards, review history, and media. It is designed for **migration fidelity first** — moving a learner's data between applications (Anki, Mnemosyne, SuperMemo, Mochi, and future systems) with every loss explicit — and for **sharing** as a secondary use case.

This specification is grounded in the format research in `docs/formats/` and the design decisions in ADR-0004 through ADR-0012. Where this document and an ADR disagree, this document governs once accepted; disagreements before then are editing errors to be fixed.

### 1.2 Goals

- Preserve everything needed to continue learning in a different application, most importantly the **complete review history** (ADR-0004).
- Make every lossy step **explicit and reported** — silent data loss is a conformance violation (ADR-0012).
- Be readable and diffable with ordinary tools: JSON files in a directory, media as plain files (ADR-0007).
- Be extensible without vendor collisions, with app-specific data restored on round-trip as a **contract** (ADR-0011).

### 1.3 Non-Goals

- USF does not define a scheduling algorithm. It transports the data schedulers need.
- USF does not model SuperMemo topics/incremental reading (dropped with a reported issue; ADR-0005).
- USF does not define merge algorithms; it defines identity and equality (ADR-0009).

## 2. Terminology

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

- **Package** — one USF dataset: a directory (canonical) or zip archive (transport) as defined in §4.
- **Note** — a unit of content: named field values sharing a note type.
- **Card** — a schedulable unit generated from a note; owns exactly one review history.
- **Generator** — the descriptor stating how a card derives from its note (§8.5).
- **Review** — one grading event (§8.6).
- **Source application** — the app a package was exported from.
- **Consumer / producer** — software reading / writing USF packages.

## 3. Conformance

### 3.1 Profiles (cumulative)

| Profile   | Contains                                                              | Intended use                       |
| --------- | --------------------------------------------------------------------- | ---------------------------------- |
| `content` | note types, notes (fields, tags), decks, cards with generators, media | Sharing; scheduling-free by design |
| `history` | `content` + the complete review log with original-scale ratings       | Migration                          |
| `full`    | `history` + extension namespaces preserved and restorable             | Same-app round-trip, backup        |

A package declares its profile in the manifest (§5). A converter MUST declare, per direction and format, the highest profile it supports.

### 3.2 Loss reporting

Whenever a producer or consumer drops or degrades data — profile downgrade, unmappable construct, folded status, dropped entity — it MUST surface a conversion issue through its result reporting (in this library: the tri-state `ConversionResult`, ADR-0002). A conversion that loses data while reporting none is non-conforming.

### 3.3 Ignoring unknown data

Consumers MUST ignore unknown JSON fields and unknown extension namespaces, and SHOULD preserve them verbatim when re-emitting a package they otherwise did not modify.

## 4. Package Structure

### 4.1 Canonical form: directory

```text
<name>.srspkg/
├─ package.json        # manifest (§5) — REQUIRED
├─ decks.json          # §8.1/§8.2 — OPTIONAL
├─ note-types.json     # §8.3 — REQUIRED if notes present
├─ notes.json          # §8.4 — or notes/ (§4.3)
├─ cards.json          # §8.5
├─ reviews.jsonl       # §8.6 — REQUIRED for history/full profiles
└─ media/
   ├─ manifest.json    # §8.7
   └─ <files…>         # bytes, real filenames
```

### 4.2 Transport form: zip

A zip archive of the identical tree (manifest at archive root), RECOMMENDED file extension `.srspkg`. Consumers MUST treat directory and zip forms identically. Producers MUST NOT use compression features beyond standard deflate in 1.0.

### 4.3 Sharding

Above roughly 10 MB per file, producers SHOULD shard `notes.json`, `cards.json` into a directory of the same base name (`notes/000.json`, `notes/001.json`, …), each file holding a JSON array. If both `notes.json` and `notes/` exist, the package is invalid. `reviews.jsonl` is never sharded; it is line-streamable at any size.

### 4.4 Encoding

All JSON/JSONL files are UTF-8 without BOM. JSONL: exactly one JSON object per `\n`-terminated line, no enclosing array.

## 5. Manifest (`package.json`)

```json
{
  "usfVersion": "1.0.0",
  "profile": "history",
  "id": "0198c9c2-4a7e-7cc3-9f4e-1b2d3c4d5e6f",
  "createdAt": 1752148800000,
  "source": {
    "application": "anki",
    "version": "25.07",
    "exporter": "srs-converter 0.4.0"
  },
  "ratingScale": "anki",
  "extensions": {}
}
```

- `usfVersion` (REQUIRED): semver of this spec. See §13 for compatibility rules.
- `profile` (REQUIRED): `content` | `history` | `full`.
- `id` (REQUIRED): package UUID (§7.1).
- `source` (OPTIONAL but RECOMMENDED): provenance; `application` SHOULD be a registered namespace name (§11) when one exists.
- `ratingScale` (REQUIRED for history/full): the package-default rating scale (§9). Individual reviews MAY override (§8.6).

## 6. Common Conventions

- **Timestamps** are integer milliseconds since the Unix epoch, UTC (`…At` fields). Sources with coarser precision scale up; day-quantized values and day-boundary offsets (Anki rollover, Mnemosyne `day_starts_at`) belong in scheduler extension blocks, not core timestamps (ADR-0010).
- **Every entity** carries: `id` (§7.1), OPTIONAL `sourceIds` (§7.2), OPTIONAL `extensions` (§11), and where meaningful `createdAt`/`modifiedAt`.
- Field order in JSON is not significant. Producers SHOULD emit stable, sorted output for diffability.

## 7. Identity

### 7.1 Universal ids

Every entity has an `id`: a UUID string (lowercase, hyphenated). Natively created entities use UUIDv7.

**Deterministic derivation (REQUIRED for imports):** when importing from a source with usable identity, the universal id is UUIDv5-style: `id = uuid5(USF_NAMESPACE, application + ":" + entityType + ":" + sourceKey)` where `USF_NAMESPACE` = `7e5c1a90-5b1e-4f7a-9d3a-usf000000001` _(placeholder — final constant fixed before 1.0)_ and `sourceKey` is defined per format in §12. Converting the same source twice MUST yield identical ids (ADR-0009).

### 7.2 Source identity

```json
"sourceIds": {
  "anki": { "noteId": "1699999999999", "guid": "Ab3(xY9z]k" }
}
```

Typed, per-namespace identity. An exporter targeting application X MUST consume the `X` entry to restore native identity (e.g. Anki notes get their original `guid` back — never regenerate identity that is present).

### 7.3 Content hash (optional)

Entities MAY carry `contentHash`: `{ "algo": "sha256", "value": "<hex>", "over": ["Front", "Back"] }` — a deterministic hash over declared identity fields for cross-source dedup (genanki pattern). It is never a substitute for `id`.

## 8. Entities

### 8.1 Deck

```json
{
  "id": "…",
  "name": "French",
  "parentId": null,
  "description": "",
  "configId": "…",
  "createdAt": 0,
  "modifiedAt": 0,
  "sourceIds": {},
  "extensions": {}
}
```

`name` is plain text; hierarchy is expressed ONLY via `parentId` (ADR-0008). Mapping of Anki `A::B` names, SuperMemo tree paths, and Mnemosyne tag conventions: §12.

### 8.2 Deck config

```json
{ "id": "…", "name": "Default preset", "extensions": { "anki": { "deckConfig": { … } } } }
```

Identity + name are core so references survive conversion; all scheduler settings live in namespaced extensions (they are scheduler-specific by nature; ADR-0004/0008).

### 8.3 Note type

```json
{
  "id": "…",
  "name": "Basic",
  "contentFormat": "html",
  "fields": [
    { "name": "Front", "description": "", "display": { "rtl": false } },
    { "name": "Back" }
  ],
  "templates": [
    {
      "name": "Card 1",
      "question": "{{ Front }}",
      "answer": "{{ question }}\n---\n{{ Back }}",
      "typedAnswer": null
    }
  ],
  "css": ".card { … }",
  "ratingScale": null,
  "sourceIds": {},
  "extensions": {}
}
```

- `contentFormat` (REQUIRED): `html` | `markdown` | `plain` — the dialect of all field values of notes of this type (ADR-0006). Content is stored untouched; dialect conversion is an explicit, loss-reporting operation.
- `fields`: name-keyed identity — names are unique within the note type; renames are explicit operations, never positional guesses.
- `templates[*].question/answer`: Universal Template Language (§10). Original source templates are preserved verbatim in the source's extension namespace and restored by that source's exporter (ADR-0006).
- `templates` describe `generator: template` cards; cloze and reverse cards need no template entry (§8.5).

### 8.4 Note

```json
{
  "id": "…",
  "noteTypeId": "…",
  "deckId": "…",
  "fieldValues": { "Front": "Bonjour", "Back": "Hello" },
  "tags": ["Languages::French"],
  "createdAt": 0,
  "modifiedAt": 0,
  "contentHash": null,
  "sourceIds": {},
  "extensions": {}
}
```

- `fieldValues`: object keyed by field **name**. Every note-type field MUST be present (empty string if blank); unknown keys are invalid.
- `deckId`: the note's default deck (cards may override).
- `tags`: strings; hierarchy by `::` convention (documented, matches Anki and Mnemosyne).

### 8.5 Card

```json
{
  "id": "…",
  "noteId": "…",
  "generator": { "type": "cloze", "index": 1 },
  "deckId": null,
  "status": "active",
  "createdAt": 0,
  "modifiedAt": 0,
  "sourceIds": {},
  "extensions": {}
}
```

- `generator` (REQUIRED, ADR-0005), one of:
  - `{ "type": "template", "templateName": "Card 1" }` — from a note-type template
  - `{ "type": "cloze", "index": 1 }` — from cloze deletion group _index_ in the note's fields (1-based; marker syntax per dialect, §10.4)
  - `{ "type": "reverse" }` — the reversed direction of the note's first template card
- `deckId`: OPTIONAL override of the note's deck (ADR-0008); `null`/absent = inherit.
- `status`: `active` | `suspended` | `archived` (ADR-0010). Finer states (buried-until, trash timestamps, filtered-deck displacement) go in extensions with fold rules in §12.
- Exactly one review history per card. Sub-schedule sources (Mochi reverse/cloze arrays) import as sibling cards (§12.4).

### 8.6 Review (one JSONL line each)

```json
{
  "cardId": "…",
  "at": 1719912345678,
  "rating": 3,
  "kind": "review",
  "durationMs": 4200,
  "scheduledIntervalMs": 2592000000,
  "actualIntervalMs": 2764800000
}
```

- `cardId`, `at` (ms), `rating` (REQUIRED): the **original source value**, interpreted via the applicable rating scale (§9): per-review `scale` if present, else note-type `ratingScale`, else package `ratingScale`.
- `kind` (REQUIRED): `learn` | `review` | `relearn` | `filtered` | `manual` | `rescheduled`. Mapping per format in §12; `manual`/`rescheduled` entries carry bookkeeping, not learning signal, and consumers training schedulers SHOULD exclude them (mirrors Anki/FSRS practice).
- `durationMs`, `scheduledIntervalMs`, `actualIntervalMs` (OPTIONAL): answer time; the interval the review was scheduled at vs. actually elapsed (Mnemosyne/Anki have them; FSRS training benefits).
- Lines MUST be in non-decreasing `at` order. Ties are allowed (unlike Anki's revlog primary key — see audit F16).

### 8.7 Media

`media/manifest.json`:

```json
{
  "entries": [
    {
      "name": "mona-lisa.jpg",
      "hash": { "algo": "sha256", "value": "<hex>" },
      "mime": "image/jpeg",
      "size": 34567,
      "external": false,
      "extensions": {}
    }
  ]
}
```

- `name`: the real filename, also the path under `media/`; MUST NOT contain path separators or `..` (§13 security). Content references media by this name using the content dialect's native syntax, preserved verbatim.
- `external: true` = bytes not bundled (sharing mode); consumers resolve or report.
- `hash` is REQUIRED when bytes are bundled; consumers SHOULD verify.

## 9. Rating Scales

A scale is either a registered name or an object `{ "min": 0, "max": 5, "failBelow": 2 }` (fail = `rating < failBelow`).

Registered scales:

| Name        | Range | failBelow | Source semantics                     |
| ----------- | ----- | --------- | ------------------------------------ |
| `anki`      | 1–4   | 2         | 1 Again, 2 Hard, 3 Good, 4 Easy      |
| `mnemosyne` | 0–5   | 2         | 0–1 wrong (acquisition), 2–5 correct |
| `supermemo` | 0–5   | 3         | <3 fail; 5 perfect                   |
| `binary`    | 0–1   | 1         | 0 forgot, 1 remembered               |

**Normative cross-scale mappings** (applied ONLY on export to a target needing a different scale; the stored value never changes):

| From \ To   | `anki`                 | `binary`     |
| ----------- | ---------------------- | ------------ |
| `mnemosyne` | 0,1→1; 2→2; 3,4→3; 5→4 | 0,1→0; 2–5→1 |
| `supermemo` | 0,1,2→1; 3→2; 4→3; 5→4 | 0–2→0; 3–5→1 |
| `anki`      | —                      | 1→0; 2–4→1   |
| `binary`    | 0→1; 1→3               | —            |

Mappings to richer scales fabricate granularity and MUST be reported as degradations. _(Draft note: the `mnemosyne`→`anki` row folds 2/3 into Hard/Good; exact folds to be sanity-checked against FSRS guidance before 1.0.)_

## 10. Universal Template Language (UTL)

### 10.1 Design rules

UTL is deliberately small: every construct is attested in at least two researched formats. Templates that cannot express a source construct degrade per §10.5 — and the verbatim original is always preserved in the source's extension namespace (ADR-0006).

### 10.2 Syntax

Templates are text in the note type's `contentFormat` dialect, with UTL constructs in `{{ … }}`:

| Construct                   | Meaning                                                                   | Attestation                        |
| --------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| `{{ Field }}`               | interpolate field value                                                   | all four formats                   |
| `{{# Field }}…{{/ Field }}` | render iff field non-empty                                                | Anki, Mochi                        |
| `{{^ Field }}…{{/ Field }}` | render iff field empty                                                    | Anki, Mochi                        |
| `{{ question }}`            | the rendered question side (answer templates only)                        | Anki `FrontSide`, SuperMemo layout |
| `{{cloze Field }}`          | field with the card's cloze group occluded (question) / revealed (answer) | all four formats                   |
| `{{hint Field }}`           | collapsed until requested                                                 | Anki, RemNote                      |

Literal `{{` is escaped `\{{`. Field names are matched exactly; whitespace inside `{{ }}` is insignificant. `typedAnswer` (note-type template field, §8.3) names a field the consumer MAY prompt for typed recall (Anki `{{type:}}`, Mnemosyne `type_answer`) — a capability flag, not a rendering construct.

### 10.3 Rendering contract

A conforming consumer that cannot execute UTL MUST at minimum render, in order: all question-referenced fields (question side), then all answer-referenced fields. This is the "plain fallback" — derivable mechanically from the template, so it is not stored separately.

### 10.4 Cloze markers in content

Cloze deletions live in field values using the dialect's native syntax, preserved verbatim: `{{c1::…}}` (html/Anki), `{{1::…}}` (markdown/Mochi), `[…]` (Mnemosyne, group = occurrence order). The card's `generator.index` is authoritative for which group a card tests; importers MUST normalize group numbering to 1-based contiguous indices _in the generator_, never by rewriting content. Dialect conversion of markers happens only inside the explicit content-conversion operation.

### 10.5 Degradation

Transpiling source templates to UTL: unmappable constructs (Anki `{{tts}}`, `{{Subdeck}}`, JS in templates, Mochi typed generated fields) are replaced by their best static rendering or dropped, and each replacement MUST be reported. Exporting UTL to a target: constructs the target lacks degrade per the tables in §12.

## 11. Extensions

Every entity may carry `extensions: { "<namespace>": <object> }`.

- **Registered namespaces** (this spec, §12 defines their content schemas): `anki`, `mnemosyne`, `supermemo`, `mochi`, `srs-converter`.
- Unregistered producers MUST use `x-<vendor>-<name>` keys.
- **Restore obligation (normative):** an exporter targeting application X MUST read namespace `X` and restore its contents to native locations. Dropping own-namespace data is a conformance violation (ADR-0011).
- Consumers MUST ignore namespaces they don't know (§3.3). Registered keys can graduate to core fields in minor spec versions; the namespace form remains valid for one major version after graduation.
- Scheduler state snapshots (Anki queue/due/ivl/factor + FSRS `s/d/dr/decay`, Mnemosyne easiness/phase counters, SuperMemo A-factor/interval aggregates, Mochi flags) live here and are **regenerable caches**: importers MAY use them, MUST NOT require them (ADR-0004).

## 12. Format Mappings (normative summaries)

Full mapping tables become appendices as importers are implemented (Phases 2–4); this section fixes the load-bearing rules and the fidelity ceilings validated on paper against `docs/formats/`.

### 12.1 Anki (ceiling: `full`)

- `sourceKey` (§7.1): notes → `guid`; cards → `<note guid>#<ord>`; decks/note types → 64-bit id; reviews → `<revlog id>#<cid>`.
- Decks: `A::B` name chains ↔ `parentId` chains (split/join on `::`); per-card `did` → card `deckId`; `dconf` presets → deck-config entities with `extensions.anki.deckConfig`.
- Cards: `ord` → `template`/`cloze` generator by note-type kind; queue<0 → `status: suspended` (buried detail in `extensions.anki`); scheduling columns + `cards.data` FSRS JSON → `extensions.anki`.
- Reviews: revlog types 0–5 → kinds learn/review/relearn/filtered/manual/rescheduled; `ivl`/`lastIvl` (negative=seconds, positive=days) → `…IntervalMs`; `time` → `durationMs`; scale `anki`.
- Known degradations: none required for legacy 2 or schema 18 (contents of protobuf `other` bytes ride in extensions verbatim, base64-encoded).

### 12.2 Mnemosyne (ceiling: `full`)

- `sourceKey`: object UUIDs (`facts.id`, `cards.id`, `tags.id`).
- Facts → notes (EAV keys → field names); card types + fact views → note types with one template per view; cards → `template` generator per fact view, cloze card type → `cloze` generators; `active=0` → `suspended`.
- No decks: by convention, top-level tag ↔ deck when importing INTO deck-oriented targets is NOT performed automatically; Mnemosyne packages simply have no decks, and exporters to Anki create a single default deck (reported). Criteria (saved sets) → `extensions.mnemosyne`.
- Reviews: REPETITION log rows → reviews with `scheduledIntervalMs`/`actualIntervalMs` (seconds×1000) and `durationMs` (`thinking_time`×1000); scale `mnemosyne`; acquisition/retention phase per rep → `kind` learn/review, lapse-return → relearn.
- Known degradations: non-review log events (CRUD history) → `extensions.mnemosyne` or dropped with report.

### 12.3 SuperMemo, via XML export (ceiling: `content` + snapshots)

- `sourceKey`: element `<ID>` within the export (stable only per export — reported as weak identity).
- Tree: Concept/Topic title chain → deck `parentId` chain; Items → note (Question/Answer fields, `html`) + one `template` card; media elements → media entries + `extensions.supermemo.sideFlags`.
- Topics: **dropped**, one reported issue each (ADR-0005).
- `<LearningData>` aggregates → `extensions.supermemo` snapshot. No review log exists in XML: packages are `content` profile, stated in the manifest, with the aggregate snapshot preserved.

### 12.4 Mochi (ceiling: `history`; ratings binary)

- `sourceKey`: Mochi ids.
- Decks: `parent-id` ↔ `parentId` directly (closest native match).
- Cards: a Mochi card → one note (+fields or content-with-sides) with 1–N universal cards: main → `template`, `:reverse-reviews` present → sibling `reverse` card, each `:cloze/indexes` entry → `cloze` card. Export folds siblings back into one Mochi card; unmergeable siblings split into separate Mochi cards (reported).
- Reviews: `:reviews`/`:reverse-reviews`/`:cloze/reviews` → per-sibling logs; `remembered?` → rating on `binary` scale; `:interval` days → `actualIntervalMs`; undocumented `:duration` seconds → `durationMs`; `:rereview? true` → `kind: relearn`, `:new?` phase → `learn`.
- `archived?` → `status: archived`; `trashed?` timestamp → `extensions.mochi`.

### 12.5 Paper-validation summary

Walking every entity of all four formats through import→export against this draft yields no silent losses: every non-representable construct has a defined destination (extension namespace) or a defined, _reported_ degradation (topics, binary ratings, template transpilation, SM identity weakness). The validation walk lives with the dossiers and must be re-run against the final 1.0 text.

## 13. Security Considerations

- **Path traversal / zip slip:** media names MUST NOT contain `/`, `\`, or `..`; consumers MUST reject packages that violate this before extracting bytes.
- **Content execution:** field content and templates are data. `html` dialect content can contain scripts; consumers MUST sanitize or sandbox when rendering. UTL defines no code execution.
- **Resource limits:** consumers SHOULD bound decompression size (zip bombs), JSONL line length, and entity counts, and MUST fail cleanly rather than exhaust memory (streaming `reviews.jsonl` is the intended pattern).
- **Hash verification:** consumers SHOULD verify media hashes and MUST treat mismatches as reportable corruption, not silently ignore them.
- **Extension data** is untrusted app data: never execute, size-limit on write (producers SHOULD keep entity extensions under 1 MB).

## 14. Versioning & Compatibility

- `usfVersion` is semver. Within a major version: minors only add optional fields/registered names; consumers MUST ignore unknowns (§3.3), so any 1.x consumer reads any 1.y package (upward compatibility as promised in the project README).
- Producers MUST write the lowest 1.x version whose features they use.
- Majors may break; a major bump requires a published migration note per changed field.

## 15. Worked Example

A minimal `history` package with one cloze note (two cards) and three reviews:

```text
example.srspkg/
├─ package.json
├─ decks.json
├─ note-types.json
├─ notes.json
├─ cards.json
└─ reviews.jsonl
```

`package.json`

```json
{
  "usfVersion": "1.0.0",
  "profile": "history",
  "id": "0198c9c2-4a7e-7cc3-9f4e-1b2d3c4d5e6f",
  "createdAt": 1752148800000,
  "source": { "application": "anki", "exporter": "srs-converter" },
  "ratingScale": "anki"
}
```

`decks.json`

```json
[{ "id": "0198c9c2-0001-7000-8000-000000000001", "name": "Biology", "parentId": null }]
```

`note-types.json`

```json
[
  {
    "id": "0198c9c2-0002-7000-8000-000000000001",
    "name": "Cloze",
    "contentFormat": "html",
    "fields": [{ "name": "Text" }, { "name": "Extra" }],
    "templates": [
      { "name": "Cloze", "question": "{{cloze Text }}", "answer": "{{cloze Text }}<br>{{ Extra }}" }
    ],
    "css": ""
  }
]
```

`notes.json`

```json
[
  {
    "id": "0198c9c2-0003-7000-8000-000000000001",
    "noteTypeId": "0198c9c2-0002-7000-8000-000000000001",
    "deckId": "0198c9c2-0001-7000-8000-000000000001",
    "fieldValues": { "Text": "{{c1::Insulin}} is produced by the {{c2::pancreas}}.", "Extra": "" },
    "tags": ["physiology"],
    "sourceIds": { "anki": { "noteId": "1719900000000", "guid": "Ab3(xY9z]k" } }
  }
]
```

`cards.json`

```json
[
  {
    "id": "0198c9c2-0004-7000-8000-000000000001",
    "noteId": "0198c9c2-0003-7000-8000-000000000001",
    "generator": { "type": "cloze", "index": 1 },
    "status": "active"
  },
  {
    "id": "0198c9c2-0004-7000-8000-000000000002",
    "noteId": "0198c9c2-0003-7000-8000-000000000001",
    "generator": { "type": "cloze", "index": 2 },
    "status": "active"
  }
]
```

`reviews.jsonl`

```jsonl
{"cardId":"0198c9c2-0004-7000-8000-000000000001","at":1719912345678,"rating":3,"kind":"learn","durationMs":5200}
{"cardId":"0198c9c2-0004-7000-8000-000000000001","at":1720003545678,"rating":4,"kind":"review","durationMs":2100}
{"cardId":"0198c9c2-0004-7000-8000-000000000002","at":1720003599123,"rating":1,"kind":"learn","durationMs":8800}
```

## 16. Guidance for Implementers

- **Importers:** derive ids deterministically (§7.1); never convert content dialects implicitly; put everything app-specific into your namespace — if you write it, your exporter must restore it.
- **Exporters:** consume `sourceIds` and your own extension namespace first; map ratings only at the boundary; report every degradation.
- **Third parties:** you can be a conforming `content`-profile consumer with ~200 lines of code: read the manifest, note types, notes, cards; render fields via the §10.3 fallback. History and extensions are opt-in depth.

## 17. References

- Format dossiers and comparison matrix: `docs/formats/`
- Decisions: ADR-0004 … ADR-0012 (`docs/decisions/`)
- Round-trip audit motivating the loss-reporting stance: `docs/working/audit-2026-07-10-roundtrip.md`
- RFC 2119 (key words); RFC 5545/7986 and GPX (extension-mechanism prior art)

---

## Appendix A: Open items before 1.0

1. Final `USF_NAMESPACE` UUID constant (§7.1).
2. Sanity-check the `mnemosyne`→`anki` rating fold (§9) against FSRS guidance.
3. Registered extension namespace content schemas (§11) — to be written alongside each format implementation (Phases 2–4).
4. JSON Schemas for all files (Story 5.0.4).
5. Golden conformance fixtures per profile (ADR-0012; Phase 6).
