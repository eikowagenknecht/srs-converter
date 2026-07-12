# The Universal SRS Format (USF) — Specification Draft

```text
Version:  1.0.0-draft.2
Date:     2026-07-11
Status:   DRAFT — not yet implemented; do not build against this until accepted
Editors:  Eiko Wagenknecht
```

## 1. Introduction

### 1.1 Purpose

The Universal SRS Format (USF) is an open, application-neutral interchange format for spaced-repetition data: decks, note types, notes, cards, review history, and media. It is designed for **migration fidelity first** — moving a learner's data between applications (Anki, Mnemosyne, SuperMemo, Mochi, and future systems) with every loss explicit — and for **sharing** as a secondary use case.

This specification is grounded in the format research in `docs/formats/`, the design decisions in ADR-0004 through ADR-0012, and the spec-time refinements recorded in ADR-0017. Where this document and an ADR disagree, this document governs once accepted; disagreements before then are editing errors to be fixed.

### 1.2 Goals

- Preserve everything needed to continue learning in a different application, most importantly the **complete review history** (ADR-0004).
- Make every lossy step **explicit and reported** — silent data loss is a conformance violation (ADR-0012).
- Be readable and diffable with ordinary tools: JSON files in a directory, media as plain files (ADR-0007).
- Be extensible without vendor collisions, with app-specific data restored on round-trip as a **contract** (ADR-0011).

### 1.3 Non-Goals

- USF does not define a scheduling algorithm. It transports the data schedulers need.
- USF does not model SuperMemo topics/incremental reading (dropped with a reported issue; ADR-0005).
- USF does not define merge algorithms; it defines identity and equality (ADR-0009). Merge and append workflows are explicitly out of scope for 1.0 (ADR-0017).

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

| Profile   | Contains                                                               | Asserts                                                                                     | Intended use                       |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- |
| `content` | note types, notes (fields, tags), decks, cards with generators, media  | no review log is included (`reviews.jsonl` MUST be absent)                                   | Sharing; scheduling-free by design |
| `history` | `content` + the review log with original-scale ratings                 | the review log is the **complete** review history known to the source                        | Migration                          |
| `full`    | `history` + the producer's own extension namespace                     | the producer's namespace captures **all** app-specific state needed for same-app round-trip | Same-app round-trip, backup        |

Extension namespaces (§11) are legal at **every** profile; the profiles differ in what they *assert*, not in which fields may appear. A package declares its profile in the manifest (§5). A converter MUST declare, per direction and format, the highest profile it supports.

### 3.2 Loss reporting

Whenever a producer or consumer drops or degrades data — profile downgrade, unmappable construct, folded status, dropped entity — it MUST surface a conversion issue through its result reporting (in this library: the tri-state `ConversionResult`, ADR-0002). A conversion that loses data while reporting none is non-conforming.

### 3.3 Ignoring unknown data

Consumers MUST ignore unknown JSON fields and unknown extension namespaces, and SHOULD preserve them verbatim when re-emitting a package they otherwise did not modify.

Unknown **values** of known fields are handled by defined fallbacks so that any 1.x consumer can read any 1.y package (§14):

- Unknown `generator.type` (§8.5): preserve the card and its review history untouched, do not render it, report.
- Unknown `status` (§8.5): treat as `suspended` (safe: do not schedule), report.
- Unknown review `kind` (§8.6): carry the line verbatim, treat it as carrying no learning signal (like `manual`), report.
- Unknown `contentFormat` (§8.3): treat as `plain`, report.
- Unknown UTL construct (§10.2): render the referenced field's value plainly if the construct names a field, otherwise render nothing; report.
- Unknown rating-scale **names** cannot occur in isolation: producers using a scale name not registered in this version MUST use the object form (§9), which is always interpretable.

### 3.4 Validity

Structural invariants — a package violating any of these is **invalid**:

- Entity `id`s are unique within their entity class.
- Every reference (`noteTypeId`, `noteId`, `deckId`, `parentId`, `configId`, `cardId`) resolves to an entity in the package.
- The deck `parentId` graph is acyclic.
- `fieldValues` keys exactly match the note type's field names (§8.4).
- `notes.json` and `notes/` (or `cards.json` and `cards/`) do not coexist (§4.3).

Producers MUST NOT emit invalid packages. Where the *source* contains violations (e.g. Anki's orphan revlog rows referencing deleted cards), importers MUST drop the offending source rows with a reported issue rather than emit dangling references.

Consumers encountering an invalid package MUST NOT crash or hang (cycle detection in the deck graph is mandatory), MUST report every violation found, SHOULD salvage the referentially intact remainder (mirroring the tri-state partial-success philosophy of ADR-0002), and MAY reject the package outright.

## 4. Package Structure

### 4.1 Canonical form: directory

```text
<name>.srspkg/
├─ manifest.json       # manifest (§5) — REQUIRED
├─ decks.json          # §8.1 — OPTIONAL
├─ deck-configs.json   # §8.2 — OPTIONAL
├─ note-types.json     # §8.3 — REQUIRED if notes present
├─ notes.json          # §8.4 — present iff the package contains notes; or notes/ (§4.3)
├─ cards.json          # §8.5 — present iff the package contains cards; or cards/ (§4.3)
├─ reviews.jsonl       # §8.6 — REQUIRED for history/full (may be empty); MUST be absent for content
└─ media/              # OPTIONAL
   ├─ manifest.json    # §8.7 — REQUIRED if media files present
   └─ <files…>         # bytes, real filenames
```

Each `*.json` entity file is a single top-level JSON array of entities of one type.

### 4.2 Transport form: zip

A zip archive of the identical tree (manifest at archive root), RECOMMENDED file extension `.srspkg`. Consumers MUST treat directory and zip forms identically. The only permitted entry methods in 1.0 are `store` and `deflate`. Zip entries MUST set the UTF-8 filename flag (EFS bit).

### 4.3 Sharding

Above roughly 10 MB per file, producers SHOULD shard `notes.json`, `cards.json` into a directory of the same base name (`notes/000.json`, `notes/001.json`, …), each file holding a JSON array; the logical order is the lexicographic order of the shard filenames. If both `notes.json` and `notes/` exist, the package is invalid. `reviews.jsonl` is never sharded; it is line-streamable at any size.

### 4.4 Encoding

All JSON/JSONL files are UTF-8 without BOM. JSONL: exactly one JSON object per `\n`-terminated line, no enclosing array.

All files MUST satisfy I-JSON (RFC 7493). Integers outside ±(2^53 − 1) MUST be encoded as JSON strings; consumers MUST NOT assume JSON numbers carry more than 53 bits of integer precision. (This matches protobuf's canonical JSON mapping, which encodes int64 as string, and prevents silent corruption of 64-bit source identifiers riding in extension payloads.)

## 5. Manifest (`manifest.json`)

```json
{
  "usfVersion": "1.0.0",
  "profile": "history",
  "id": "0198c9c2-4a7e-7cc3-9f4e-1b2d3c4d5e6f",
  "createdAt": 1783771200000,
  "source": {
    "application": "anki",
    "version": "25.07",
    "exporter": "srs-converter 0.4.0"
  },
  "ratingScale": "anki",
  "extensions": {}
}
```

- `usfVersion` (REQUIRED): semver of this spec. See §14 for compatibility rules.
- `profile` (REQUIRED): `content` | `history` | `full` (§3.1).
- `id` (REQUIRED): package UUID. A package identifies one export *artifact*: producers MUST generate a fresh UUIDv7 per export. The package id is exempt from the deterministic derivation of §7.1 (re-exporting the same source yields a new package id; entity ids remain stable).
- `createdAt` (OPTIONAL, RECOMMENDED): export timestamp, epoch ms UTC.
- `source` (OPTIONAL but RECOMMENDED): provenance; `application` SHOULD be a registered namespace name (§11) when one exists.
- `ratingScale` (REQUIRED for history/full): the rating scale for all reviews in the package (§9). The scale is declared once per package (ADR-0004); there are no per-entity or per-review overrides in 1.x (§14).
- `extensions` (OPTIONAL): the **package-level** extension container (§11) — home of source collection-level state (e.g. Anki `crt`/`conf`/`tags`/`graves`, §12.1).

## 6. Common Conventions

- **Timestamps** are integer milliseconds since the Unix epoch, UTC (`…At` fields). Sources with coarser precision scale up; day-quantized values and day-boundary offsets (Anki rollover, Mnemosyne `day_starts_at`) belong in scheduler extension blocks, not core timestamps (ADR-0010).
- **Every entity** carries: `id` (§7.1), OPTIONAL `sourceIds` (§7.2), OPTIONAL `extensions` (§11), and where meaningful `createdAt`/`modifiedAt`. Reviews (§8.6) are the defined exception: all three identity/extension fields are OPTIONAL there, and review `id`s are exempt from §7.1 derivation.
- Field order in JSON is not significant. Producers SHOULD emit stable, sorted output for diffability: entity arrays sorted by `id`, object keys in a stable order.

## 7. Identity

### 7.1 Universal ids

Every entity has an `id`: a UUID string (lowercase, hyphenated). Natively created entities use UUIDv7.

**Deterministic derivation (REQUIRED for imports):** when importing from a source with usable identity, the universal id is UUIDv5-style: `id = uuid5(USF_NAMESPACE, application + ":" + entityType + ":" + sourceKey)` where `USF_NAMESPACE` = `7e5c1a90-5b1e-4f7a-9d3a-0f0000000001` _(placeholder — final constant fixed before 1.0)_ and `sourceKey` is defined per format in §12. Converting the same source twice MUST yield identical ids (ADR-0009).

The `entityType` strings are fixed: `deck`, `deck-config`, `note-type`, `note`, `card`. Reviews and the package itself are exempt from derivation (§5, §8.6).

Imported entities **without** usable source identity get fresh UUIDv7 ids, reported as weak identity where re-import stability matters (ADR-0009; e.g. SuperMemo, §12.3). Entities a converter *synthesizes* (rather than reads from the source) use fixed, format-defined synthetic sourceKeys (§12) so re-imports converge instead of duplicating.

### 7.2 Source identity

```json
"sourceIds": {
  "anki": { "noteId": "1699999999999", "guid": "Ab3(xY9z]k" }
}
```

Typed, per-namespace identity. An exporter targeting application X MUST consume the `X` entry to restore native identity (e.g. Anki notes get their original `guid` back — never regenerate identity that is present).

## 8. Entities

### 8.1 Deck

```json
{
  "id": "…",
  "name": "French",
  "parentId": null,
  "description": "",
  "configId": null,
  "createdAt": 1719900000000,
  "modifiedAt": 1752100000000,
  "sourceIds": {},
  "extensions": {}
}
```

- `name` is plain text; hierarchy is expressed ONLY via `parentId` (ADR-0008). Sibling deck names SHOULD be unique under the same parent. Exporters to targets that join hierarchy with `::` (Anki) MUST replace literal `::` occurring inside a single deck name, with a reported issue.
- `configId` (OPTIONAL, nullable): reference to a deck config (§8.2).
- Mapping of Anki `A::B` name chains and SuperMemo tree paths: §12. Mnemosyne has no decks (§12.2).

### 8.2 Deck config

Stored in `deck-configs.json` (§4.1), a flat array like every other entity file:

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
  "createdAt": 1719900000000,
  "modifiedAt": 1752100000000,
  "sourceIds": {},
  "extensions": {}
}
```

- `contentFormat` (REQUIRED): `html` | `markdown` | `plain` — the dialect of all field values of notes of this type (ADR-0006). Content is stored untouched; dialect conversion is an explicit, loss-reporting operation.
- `fields`: name-keyed identity — names are unique within the note type; renames are explicit operations, never positional guesses. Unknown `display` keys are ignored (§3.3).
- `templates[*].question/answer`: Universal Template Language (§10). Original source templates are preserved verbatim in the source's extension namespace and restored by that source's exporter (ADR-0006).
- `templates` describe `generator: template` cards. A note type that generates **cloze** cards MUST have exactly one template containing `{{cloze …}}` constructs; every cloze card of the note type renders through that template, with the card's `generator.index` selecting the occluded group (§10.4). **Reverse** cards reuse the note type's first template with sides exchanged (§10.3); they need no template entry of their own.
- `css` applies to the `html` dialect; consumers MAY ignore it for `markdown`/`plain` note types.

### 8.4 Note

```json
{
  "id": "…",
  "noteTypeId": "…",
  "deckId": "…",
  "fieldValues": { "Front": "Bonjour", "Back": "Hello" },
  "tags": ["Languages::French"],
  "createdAt": 1719900000000,
  "modifiedAt": 1752100000000,
  "sourceIds": {},
  "extensions": {}
}
```

- `fieldValues`: object keyed by field **name**. Every note-type field MUST be present (empty string if blank); unknown keys make the package invalid (§3.4).
- `deckId` (OPTIONAL, nullable): the note's default deck (cards may override, §8.5). `null`/absent = the note belongs to no deck (e.g. Mnemosyne sources, §12.2); consumers place such notes per their own default, and exporters to targets that require decks synthesize a single package-default deck with a reported issue.
- `tags`: strings; hierarchy by `::` convention (documented, matches Anki and Mnemosyne).

### 8.5 Card

```json
{
  "id": "…",
  "noteId": "…",
  "generator": { "type": "cloze", "index": 1 },
  "deckId": null,
  "status": "active",
  "createdAt": 1719900000000,
  "modifiedAt": 1752100000000,
  "sourceIds": {},
  "extensions": {}
}
```

- `generator` (REQUIRED, ADR-0005), one of:
  - `{ "type": "template", "templateName": "Card 1" }` — from a note-type template
  - `{ "type": "cloze", "index": 2 }` — the card tests the cloze deletion group whose **literal group number** in the note's fields equals `index` (marker syntax per dialect, §10.4). Indices are labels, not positions: gaps are legal and preserved (an Anki note with only `{{c2::…}}` and `{{c5::…}}` yields cards with indices 2 and 5).
  - `{ "type": "reverse" }` — the reversed direction of the note's first template card (§10.3)
- `deckId`: OPTIONAL override of the note's deck (ADR-0008); `null`/absent = inherit.
- `status`: `active` | `suspended` | `archived` (ADR-0010). `active` = schedulable; `suspended` = excluded from scheduling until explicitly reactivated; `archived` = retired from study but retained for reference and history. Finer states (buried-until, trash timestamps, filtered-deck displacement) go in extensions with fold rules in §12.
- Exactly one review history per card. Sub-schedule sources (Mochi reverse/cloze arrays) import as sibling cards (§12.4).

### 8.6 Review (one JSONL line each)

```json
{
  "cardId": "…",
  "at": 1719912345678,
  "rating": 3,
  "kind": "review",
  "durationMs": 4200,
  "sourceIds": { "anki": { "revlogId": "1719912345678" } },
  "extensions": { "anki": { "factor": 2500, "usn": 842, "ivl": 12, "lastIvl": 5 } }
}
```

- `cardId`, `at` (ms) (REQUIRED).
- `rating`: the **original source value**, interpreted via the package `ratingScale` (§9). REQUIRED for kinds `learn`/`review`/`relearn`/`filtered`; MUST be absent (or `null`) for kinds `manual`/`rescheduled`, where the source recorded no grade (e.g. Anki writes `ease = 0` on those rows).
- `kind` (REQUIRED): `learn` | `review` | `relearn` | `filtered` | `manual` | `rescheduled`. Mapping per format in §12; `manual`/`rescheduled` entries carry bookkeeping, not learning signal, and consumers training schedulers SHOULD exclude them (mirrors Anki/FSRS practice).
- `durationMs` (OPTIONAL): answer time (Anki `time`, Mnemosyne `thinking_time`, Mochi `:duration`).
- `id`, `sourceIds`, `extensions` (all OPTIONAL): reviews are lightweight entities. Review `id`s are exempt from §7.1 derivation; source identity (e.g. Anki's revlog id) rides in `sourceIds`, and per-review scheduler bookkeeping (Anki `factor`/`usn`/`ivl`/`lastIvl`, Mnemosyne `scheduled_interval`/`actual_interval`, Mochi `:interval`) rides in the source's extension namespace, restored on export per §11.
- USF core carries no interval fields: the actually elapsed interval is derivable from consecutive `at` values of the same card, and scheduler-assigned intervals are scheduler decisions — regenerable caches per ADR-0004, preserved verbatim in extensions. Exporters to targets whose review rows require interval columns MAY derive them from timestamps and MUST report the fabrication.
- **Equality** (for dedup and idempotent re-import): two reviews are the same event iff they share a `sourceIds` entry for the same namespace, or — when neither has one — iff their `(cardId, at, kind, rating)` tuples match (an absent `rating` counts as its own value).
- Lines MUST be in non-decreasing `at` order globally across the file (lines of different cards interleave freely). Ties in `at` are allowed (unlike Anki's revlog primary key — see audit F16); the export fold for such targets is defined in §12.1.

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
      "extensions": {}
    }
  ]
}
```

- `name`: the real filename, also the path under `media/`. Content references media by this name using the content dialect's native syntax, preserved verbatim. Name matching is exact byte comparison after NFC normalization.
- `hash` (REQUIRED): consumers SHOULD verify (§13).
- **Name rules** (producer MUSTs; consumers MUST reject violations before extracting, §13): valid UTF-8, NFC-normalized, at most 255 bytes; no `/`, `\`, or `..`; no control characters; no leading or trailing space or dot; not a Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, with or without extension); and no two entries in one package may differ only by case.
- Importers encountering a source filename that violates these rules MUST rename the file, update the content references to it, and report the rename — a defined exception to content-verbatim preservation, recorded in the `srs-converter` namespace (§11).

## 9. Rating Scales

A scale is either a registered name or an object `{ "name": "…", "min": 0, "max": 5, "failBelow": 2 }` (fail = `rating < failBelow`; `name` is OPTIONAL). Producers using a registered name not defined in this version of the spec MUST use the object form so that any consumer can interpret the ratings (§3.3, §14).

Registered scales:

| Name        | Range | failBelow | Source semantics                     |
| ----------- | ----- | --------- | ------------------------------------ |
| `anki`      | 1–4   | 2         | 1 Again, 2 Hard, 3 Good, 4 Easy      |
| `mnemosyne` | 0–5   | 2         | 0–1 wrong (acquisition), 2–5 correct |
| `supermemo` | 0–5   | 3         | <3 fail; 5 perfect                   |
| `binary`    | 0–1   | 1         | 0 forgot, 1 remembered               |

**Normative cross-scale mappings** (applied ONLY on export to a target needing a different scale; the stored value never changes):

| From \ To   | `anki`                 | `mnemosyne`            | `binary`     |
| ----------- | ---------------------- | ---------------------- | ------------ |
| `mnemosyne` | 0,1→1; 2,3→2; 4→3; 5→4 | —                      | 0,1→0; 2–5→1 |
| `supermemo` | 0,1,2→1; 3→2; 4→3; 5→4 | 0→0; 1,2→1; 3→2; 4→4; 5→5 | 0–2→0; 3–5→1 |
| `anki`      | —                      | 1→1; 2→2; 3→4; 4→5     | 1→0; 2–4→1   |
| `binary`    | 0→1; 1→3               | 0→1; 1→4               | —            |

The `mnemosyne`→`anki` fold maps grades 2 and 3 to Hard: Mnemosyne's own easiness deltas penalize grade 3 (−0.14) almost identically to grade 2 (−0.16), while grade 4 is ease-neutral like Anki's Good (see `docs/formats/mnemosyne.md`). No `→ supermemo` column exists because SuperMemo export writes no review log (§12.3).

For any pair **not** in the table (any pair involving a custom scale object), the fold is: map the fail band onto the fail band and the pass band onto the pass band by linear position. For source value `v` in a band spanning `[lo_s, hi_s]` mapping to a target band `[lo_t, hi_t]`: position `p = (v − lo_s) / (hi_s − lo_s)`, or `p = 0.5` when the source band has a single value; result = `lo_t + p × (hi_t − lo_t)`, rounded to the nearest integer, with exact halves rounded away from the fail boundary (downward in the fail band, upward in the pass band). Registered-pair table rows override this algorithm.

Mappings to richer scales fabricate granularity and MUST be reported as degradations.

## 10. Universal Template Language (UTL)

### 10.1 Design rules

UTL is deliberately small: every construct is attested in at least two researched formats. Templates that cannot express a source construct degrade per §10.5 — and the verbatim original is always preserved in the source's extension namespace (ADR-0006).

### 10.2 Syntax

Templates are text in the note type's `contentFormat` dialect, with UTL constructs in `{{ … }}`:

| Construct                   | Meaning                                                                    | Attestation                             |
| --------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `{{ Field }}`               | interpolate field value                                                     | all four formats                        |
| `{{# Field }}…{{/ Field }}` | render iff field non-empty                                                  | Anki, Mochi                             |
| `{{^ Field }}…{{/ Field }}` | render iff field empty                                                      | Anki, Mochi                             |
| `{{ question }}`            | the rendered question side (answer templates only)                          | Anki `FrontSide`, Mnemosyne `a_on_top_of_q` |
| `{{cloze Field }}`          | field with the card's cloze group occluded (question) / revealed (answer)   | Anki, Mnemosyne, Mochi                  |
| `{{hint Field }}`           | collapsed until requested                                                   | Anki `{{hint:}}`, Mnemosyne `[…:hint]` ¹ |

¹ The deferred-hint *capability* is attested in two researched formats; the template-construct locus is Anki's, Mnemosyne's lives in its cloze-marker syntax.

Literal `{{` is escaped `\{{`. Field names are matched exactly; whitespace inside `{{ }}` is insignificant. `typedAnswer` (note-type template field, §8.3) names a field the consumer MAY prompt for typed recall (Anki `{{type:}}`, Mnemosyne `type_answer`) — a capability flag, not a rendering construct. Unknown constructs degrade per §3.3.

### 10.3 Rendering contract

A conforming consumer that cannot execute UTL MUST at minimum render, in order: all question-referenced fields (question side), then all answer-referenced fields. This is the "plain fallback" — derivable mechanically from the template, so it is not stored separately.

A **reverse** card (§8.5) renders the note's first template with sides exchanged: its question side is the template's `answer` with any `{{ question }}` constructs elided (they would be circular), and its answer side is the template's `question`.

### 10.4 Cloze markers in content

Cloze deletions live in field values using the dialect's native syntax, preserved verbatim: `{{c1::…}}` (html/Anki), `{{1::…}}` (markdown/Mochi), `[…]` (Mnemosyne, group number = occurrence order). Markers are matched non-greedily to the first closing delimiter (Anki-compatible); nested markers are out of scope in 1.0 and MUST be reported when encountered.

The card's `generator.index` is authoritative for which group a card tests, and it is the **literal group number** as written in the content (§8.5) — importers MUST NOT renumber groups, neither in the generator nor in the content. In dialects that allow unnumbered markers (Mochi's bare `{{text}}`), all unnumbered markers in a note collectively form one implicit group, assigned the lowest positive integer not used by any explicit marker, with a reported issue. Dialect conversion of markers happens only inside the explicit content-conversion operation.

### 10.5 Degradation

Transpiling source templates to UTL: unmappable constructs (Anki `{{tts}}`, `{{Subdeck}}`, JS in templates, Mochi typed generated fields) are replaced by their best static rendering or dropped, and each replacement MUST be reported. Exporting UTL to a target: constructs the target lacks degrade per the tables in §12.

## 11. Extensions

Every entity may carry `extensions: { "<namespace>": <object> }`; the manifest carries the package-level container (§5).

- **Registered namespaces** (this spec, §12 defines their content schemas): `anki`, `mnemosyne`, `supermemo`, `mochi`, `srs-converter`. The `srs-converter` namespace records converter bookkeeping: synthesized entities (e.g. the package-default deck of §8.4) and forced renames (e.g. media renames of §8.7), so exporters can distinguish fabricated structure from source structure.
- Unregistered producers MUST use `x-<vendor>-<name>` keys.
- **Restore obligation (normative):** an exporter targeting application X MUST read namespace `X` and restore its contents to native locations. Dropping own-namespace data is a conformance violation (ADR-0011).
- Consumers MUST ignore namespaces they don't know (§3.3). Registered keys can graduate to core fields in minor spec versions; the namespace form remains valid for one major version after graduation, and where both forms are present the core field wins.
- Scheduler state snapshots (Anki queue/due/ivl/factor + FSRS `s/d/dr/decay`, Mnemosyne easiness/phase counters, SuperMemo A-factor/interval aggregates, Mochi flags) live here and are **regenerable caches**: importers MAY use them, MUST NOT require them (ADR-0004).

## 12. Format Mappings (normative summaries)

Full mapping tables become appendices as importers are implemented (Phases 2–4); this section fixes the load-bearing rules and the fidelity ceilings validated against `docs/formats/` (see §12.5).

### 12.1 Anki (ceiling: `full`)

- `sourceKey` (§7.1): notes → `guid`; cards → `<note guid>#<ord>`; decks/note types/deck configs → 64-bit id (collection-local; note that Anki's own cross-collection identity for decks and note types is name-based — deterministic per source file, not portable across collections). Reviews are not id-derived (§8.6); they carry `sourceIds.anki.revlogId`.
- Decks: `A::B` name chains ↔ `parentId` chains (split/join on `::`); per-card `did` → card `deckId`; `dconf` presets → deck-config entities with `extensions.anki.deckConfig`.
- Cards: `ord` → `template`/`cloze` generator by note-type kind (cloze `ord` = group number − 1); queue<0 → `status: suspended` (buried detail in `extensions.anki`); scheduling columns + `cards.data` FSRS JSON → `extensions.anki`.
- Filtered decks (`dyn`/`Deck.Filtered`) are queries, not containers (ADR-0008): no deck entity is imported for them — the definition rides in `extensions.anki`, reported. A displaced card's `deckId` is its **home** deck (`odid`); `odid`/`odue` in `extensions.anki` restore the displacement on round-trip.
- Reviews: revlog types 0–5 → kinds learn/review/relearn/filtered/manual/rescheduled; type-4/5 rows carry `ease = 0` and import with `rating` absent (§8.6); `ease` 1–4 → `rating`, scale `anki` (button glosses describe the v2 scheduler; v1 learning rows used 1–3 with shifted meanings — values in range, semantics noted); `time` → `durationMs`; `ivl`/`lastIvl` (negative = seconds, positive = days), `factor`, `usn` → `extensions.anki` on the review, verbatim.
- Exporting reviews to Anki: the revlog primary key is the ms timestamp, so same-`at` ties are bumped to the next free millisecond, reported.
- Collection-level state → package-level `extensions.anki`: `crt` (the day-quantization anchor — REQUIRED whenever card scheduling snapshots are present, since their `due` day numbers are relative to it), `conf` (including add-on keys), `tags`, `graves`, verbatim.
- Known degradations: none required for legacy 2 or schema 18 (contents of protobuf `other` bytes ride in extensions verbatim, base64-encoded).

### 12.2 Mnemosyne (ceiling: `full`)

- `sourceKey`: facts → `facts.id`, cards → `cards.id` (object UUIDs); note types → the Mnemosyne card-type id (stable literal ids such as `"1"`, `"1.1"` for built-ins). Reviews carry no `sourceIds` (log rows have only machine-local rowids); their identity is the §8.6 tuple.
- Facts → notes (EAV keys → field names); card types + fact views → note types with one template per view; cards → `template` generator per fact view, cloze card type → `cloze` generators.
- Tags attach to **cards** in Mnemosyne (`tags_for_card`) but to **notes** in USF: the note receives the union of its cards' tags; the exact per-card sets ride in `extensions.mnemosyne`, a report is issued when sibling cards disagree, and the round-trip back to Mnemosyne restores the per-card sets exactly.
- `active=0` → `status: suspended` — a **reported** fold: Mnemosyne has no user-level suspend; `active` is recomputed from the current criterion. The criteria (saved sets) and the fact that deactivation was criterion-driven are preserved in `extensions.mnemosyne`, and the round-trip back to Mnemosyne restores the native mechanism from there.
- No decks: Mnemosyne packages have no deck entities and their notes carry `deckId: null` (§8.4); exporters to deck-requiring targets synthesize a single package-default deck (reported, recorded in `srs-converter`). No automatic tag↔deck conversion is performed (ADR-0017 supersedes ADR-0008 on this point).
- Reviews: REPETITION log rows → reviews; grades → `rating`, scale `mnemosyne`; `thinking_time` → `durationMs` (×1000); `scheduled_interval`/`actual_interval` → `extensions.mnemosyne` on the review, verbatim (seconds); acquisition/retention phase per rep → `kind` learn/review, lapse-return → relearn.
- Known degradations: non-review log events (CRUD history) → `extensions.mnemosyne` or dropped with report.

### 12.3 SuperMemo, via XML export (ceiling: `content` + snapshots)

- `sourceKey`: element `<ID>` within the export. `<ID>` values appear to be stable only within a single export — this is unconfirmed (Appendix A); importers MUST report SuperMemo identity as weak (§7.1).
- Tree: Concept/Topic title chain → deck `parentId` chain; Items → note (Question/Answer fields, `html`) + one `template` card; media elements → media entries + `extensions.supermemo.sideFlags`.
- The synthesized generic Q/A note type uses the fixed synthetic sourceKey `item-qa` (`supermemo:note-type:item-qa`, §7.1).
- Topics: **dropped**, one reported issue each (ADR-0005).
- `<LearningData>` aggregates → `extensions.supermemo` snapshot. No review log exists in XML: packages are `content` profile, stated in the manifest, with the aggregate snapshot preserved.

### 12.4 Mochi (ceiling: `history`; ratings binary)

- `sourceKey`: decks/note types → Mochi ids; a Mochi card's universal **note** → the Mochi card id; its universal **cards** → the Mochi card id suffixed per sibling: `<id>#main`, `<id>#reverse`, `<id>#cloze-<sourceIndex>`. The synthesized note type for template-less (plain) cards uses the fixed synthetic sourceKey `plain` (`mochi:note-type:plain`, §7.1).
- Decks: `parent-id` ↔ `parentId` directly (closest native match).
- Cards: a Mochi card → one note (+fields or content-with-sides) with 1–N universal cards: a `template` sibling for the main content (always created for non-cloze cards, with an empty review history if never reviewed; whether grouped-cloze cards retain a main schedule is unconfirmed, Appendix A), `:reverse-reviews` present → sibling `reverse` card, each `:cloze/indexes` entry → `cloze` card. Multi-side content (`---`) projects onto the two-sided template as: side 1 → question, remaining sides concatenated in order → answer, reported when more than two sides exist (the note content itself stays verbatim, separators included). Export folds siblings back into one Mochi card; unmergeable siblings split into separate Mochi cards (reported).
- Reviews: `:reviews`/`:reverse-reviews`/`:cloze/reviews` → per-sibling logs; `remembered?` → rating on `binary` scale; `:interval` → `extensions.mochi` on the review, verbatim (fractional days; its exact semantics are unconfirmed, Appendix A); undocumented `:duration` seconds → `durationMs`.
- Review kinds: if the card has `:new? true`, all its reviews import as `learn`; otherwise `:rereview? true` → `relearn`, else `review`. The learn phase of already-graduated cards is not recoverable from Mochi data — a documented degradation, reported once per conversion.
- `archived?` → `status: archived`. `trashed?` → `status: archived` as a **reported** fold (trash has no core status value); the trash timestamp rides in `extensions.mochi` and the round-trip restores the native trash state from it.

### 12.5 Validation walk

The entity-by-entity walk of all four formats through import→export against this draft — one row per source construct, naming its destination or its reported degradation — is recorded in `docs/formats/validation-walk.md`. It MUST be re-run against the final 1.0 text before acceptance; a construct without a destination row is a spec bug, not an implementation choice.

## 13. Security Considerations

- **Path traversal / zip slip:** media names are constrained by §8.7 (no separators, no `..`, plus the platform-safety rules there); consumers MUST reject packages that violate them before extracting bytes.
- **Content execution:** field content and templates are data. `html` dialect content can contain scripts; consumers MUST sanitize or sandbox when rendering. UTL defines no code execution.
- **Resource limits:** consumers SHOULD bound decompression size (zip bombs), JSONL line length, and entity counts, and MUST fail cleanly rather than exhaust memory (streaming `reviews.jsonl` is the intended pattern). Deck-graph cycle detection is mandatory (§3.4).
- **Hash verification:** consumers SHOULD verify media hashes and MUST treat mismatches as reportable corruption, not silently ignore them.
- **Extension data** is untrusted app data: never execute, size-limit on write (producers SHOULD keep entity extensions under 1 MB).

## 14. Versioning & Compatibility

- `usfVersion` is semver. Within a major version: minors only add optional fields and registered names; consumers MUST ignore unknown fields (§3.3) and apply the defined fallbacks for unknown values (§3.3), so any 1.x consumer reads any 1.y package (upward compatibility as promised in the project README).
- Producers MUST write the lowest 1.x version whose features they use.
- Majors may break; a major bump requires a published migration note per changed field.
- Changes that alter how existing data is *interpreted* — e.g. introducing per-review rating-scale overrides — cannot ship in a minor (old consumers would silently misread packages); they are major-version territory by definition.

## 15. Worked Example

A minimal `history` package with one cloze note (two cards) and three reviews:

```text
example.srspkg/
├─ manifest.json
├─ decks.json
├─ note-types.json
├─ notes.json
├─ cards.json
└─ reviews.jsonl
```

`manifest.json`

```json
{
  "usfVersion": "1.0.0",
  "profile": "history",
  "id": "0198c9c2-4a7e-7cc3-9f4e-1b2d3c4d5e6f",
  "createdAt": 1783771200000,
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

- **Importers:** derive ids deterministically (§7.1); never convert content dialects implicitly; drop invalid source rows (orphan reviews) with a report rather than emit dangling references (§3.4); put everything app-specific into your namespace — if you write it, your exporter must restore it.
- **Exporters:** consume `sourceIds` and your own extension namespace first; map ratings only at the boundary (§9); report every degradation, fabrication (derived intervals, synthesized decks, bumped timestamps), and fold.
- **Third parties:** you can be a conforming `content`-profile consumer with ~200 lines of code: read the manifest, note types, notes, cards; render fields via the §10.3 fallback. History and extensions are opt-in depth.

## 17. References

- Format dossiers, comparison matrix, and validation walk: `docs/formats/`
- Decisions: ADR-0004 … ADR-0012 and ADR-0017 (`docs/decisions/`)
- Round-trip audit motivating the loss-reporting stance: `docs/working/audit-2026-07-10-roundtrip.md`
- RFC 2119 (key words); RFC 7493 (I-JSON); RFC 5545/7986 and GPX (extension-mechanism prior art)

---

## Appendix A: Open items before 1.0

1. Final `USF_NAMESPACE` UUID constant (§7.1).
2. Registered extension namespace content schemas (§11) — to be written alongside each format implementation (Phases 2–4). Must document the per-review extension keys of §12 (Anki `factor`/`usn`/`ivl`/`lastIvl`, Mnemosyne intervals, Mochi `:interval`).
3. JSON Schemas for all files (Story 5.0.4).
4. Golden conformance fixtures per profile (ADR-0012; Phase 6).
5. Confirm the exact semantics of Mochi's per-review `:interval` (evidence suggests the outgoing scheduled interval; §12.4).
6. Confirm whether SuperMemo XML `<ID>` values are stable across exports of the same collection (§12.3).
7. Confirm whether grouped-cloze Mochi cards retain a main `:reviews` schedule (§12.4).
8. Re-run the validation walk (§12.5) against the final 1.0 text.

## Appendix B: Changes from draft.1

Decisions from the 2026-07-11 maintainer review (rationales in ADR-0017):

- **Reviews:** `rating` is now conditional on `kind` (absent for `manual`/`rescheduled`); core interval fields (`scheduledIntervalMs`/`actualIntervalMs`) removed — verbatim source interval columns ride in per-review extensions; reviews gained OPTIONAL `id`/`sourceIds`/`extensions` and a defined equality rule; ordering clarified as global; Anki tie-export rule added.
- **Identity:** `entityType` strings enumerated; fresh-UUIDv7 fallback for identity-less imports restored (ADR-0009); package id defined as fresh per export; Mochi sibling-card sourceKeys gained suffixes; Mnemosyne note-type sourceKey defined, review sourceKey removed; `contentHash` (§7.3) removed.
- **Structure:** manifest renamed `package.json` → `manifest.json`; deck configs moved to `deck-configs.json`; requiredness annotations completed; I-JSON/64-bit-integer rule added; zip methods restricted and UTF-8 filename flag required; shard order defined.
- **Conformance:** profiles redefined as completeness assertions; §3.4 validity section added (invariants, salvage-oriented consumer contract, cycle detection); unknown-value fallbacks added (§3.3); rating scale fixed at one declaration per package (per ADR-0004; note-type/per-review overrides removed).
- **Rating scales:** scale objects may carry `name`; `→ mnemosyne` fold column added; `mnemosyne→anki` fold corrected (2,3→Hard) closing former open item 2; general fold algorithm for custom-scale pairs added.
- **Templates & cloze:** cloze cards render through the note type's single cloze template; reverse-card rendering defined; cloze `generator.index` is the literal source group number (contiguity normalization removed); marker grammar and Mochi bare-cloze rule added; attestation corrections (`cloze`, `{{ question }}`, `{{hint}}`).
- **Mappings:** Anki `ease=0`, v1-gloss note, collection-level state (`crt`/`conf`/`tags`/`graves`), and per-review `factor`/`usn` destinations added; Mnemosyne `active=0` fold made explicit/reported and tag↔deck auto-conversion formally dropped (supersedes ADR-0008 in part); note `deckId` made nullable; Mochi review-kind rule grounded in the card-level `:new?` flag with documented limitation; unverified claims marked (Appendix A items 5–7).
- **Media:** `external` removed (bytes always bundled, hash always required); platform-safety name rules and importer rename rule added.
- **Misc:** status semantics defined; deck sibling-name and `::`-escaping rules added; `srs-converter` namespace purpose defined; graduation precedence defined; note types gained timestamps (ADR-0010 conformance); §5 cross-reference fixed (§13→§14); example timestamps corrected; namespace-UUID placeholder made syntactically valid; §12.5 now points at the recorded validation walk.
- **Post-walk fixes (2026-07-12):** the validation walk's six no-destination findings were resolved same-draft: Anki deck-config sourceKey added; filtered-deck import defined (queries-not-containers per ADR-0008; displaced card `deckId` = home deck); Mnemosyne per-card tags fold to a note-level union with per-card sets in extensions; Mochi `trashed?` folds to `archived` (reported); Mochi N-side content projects side 1 → question, rest → answer (reported); the Mochi main `template` sibling is always created for non-cloze cards; synthesized note types use fixed synthetic sourceKeys (`supermemo:note-type:item-qa`, `mochi:note-type:plain`).
