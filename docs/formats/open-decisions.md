# Universal Format: Open Design Decisions

Decision backlog for the universal SRS format specification (Phase 5). Each item is a candidate ADR, to be decided with the maintainer one by one. Evidence references point into the dossiers in this directory ([README.md](README.md) has the comparison matrix) and the round-trip audit (`docs/working/audit-2026-07-10-roundtrip.md`).

Status: **decided 2026-07-10** — this backlog has been worked through with the maintainer and converted into ADRs. This file is kept as the research-to-decision record; the ADRs are authoritative:

| Decision                           | ADR      | Status                                                         |
| ---------------------------------- | -------- | -------------------------------------------------------------- |
| D1 rating/log model                | ADR-0004 | accepted                                                       |
| D10 schedulable unit               | ADR-0005 | accepted (topics: **out of scope**, differs from draft)        |
| D2 content & templates             | ADR-0006 | accepted (**universal template language**, differs from draft) |
| D3 serialization                   | ADR-0007 | accepted                                                       |
| D6 decks                           | ADR-0008 | accepted                                                       |
| D5 identity                        | ADR-0009 | accepted                                                       |
| D7+D8 media/tags/timestamps/status | ADR-0010 | accepted                                                       |
| D4 extensibility                   | ADR-0011 | accepted (supersedes ADR-0003)                                 |
| D9 conformance                     | ADR-0012 | accepted                                                       |

---

## D1: Scheduling representation & rating model

**Problem:** Scheduler state is mutually untranslatable (Anki SM-2/FSRS, Mnemosyne EF + acquisition/retention, SuperMemo DSR, Mochi doubling). Grading scales differ in _values and semantics_: Anki 1–4 (fail = 1), Mnemosyne 0–5 (fail ≤ 1), SuperMemo 0–5 (fail < 3), Mochi binary.

**Research verdict:** unambiguous. FSRS retrains per-card memory from the raw log (prior-art §3: the benchmark dataset stores _only_ the log; state is derived). SuperMemo proves the inverse: DSR state cannot be rebuilt from snapshots, only from history (supermemo.md §3).

**Draft position:**

- **Review log = source of truth.** Universal review record: card id, timestamp (ms), **rating as original value + declared scale**, duration, review kind (learn/review/relearn/manual/rescheduled…), optional scheduled-vs-actual interval (Mnemosyne/Anki have them; FSRS training benefits).
- **Rating scale as a declared object** on the package or note-type level: `{ scale: [min..max], failBelow: n }` or named well-known scales (`anki-4`, `sm-6`, `binary`). Converters map only when the target requires it, and the mapping is specified in the RFC, not implementation-defined.
- **Scheduler state = optional, namespaced, regenerable snapshot** (`x-anki: {due, ivl, factor, queue, fsrs: {s,d,dr,decay}}`, `x-mnemosyne: {...}`). Spec marks it as cache: importers MAY use it, MUST NOT require it.

**Open:** minimum required review-kind vocabulary; whether current `SrsReviewScore` (1–4 enum) survives at all.

## D2: Content format & template portability

**Problem:** HTML (Anki, Mnemosyne, SuperMemo) vs Markdown (Mochi); md2anki ecosystem documents HTML↔MD round-trips as provably lossy (prior-art §5). Template languages are mutually untranslatable (matrix, divergence 5). Current code comments claim Markdown while passing HTML through.

**Draft position:**

- Field content carries a **declared dialect** per note type (or package): `html` | `markdown` | `plain`. No silent conversion — converting is an explicit, documented, lossy operation.
- Note types = **named fields + card definitions + declared template dialect + css** (prior-art lesson 7): a consumer that can't execute `anki-template` still recovers fields and a plain q/a rendering. Require a **plain fallback rendering** per template.
- **Fields are name-keyed** everywhere (lesson 5; audit F8 showed positional field writing is already a live bug).
- Media references: keep native syntax in content, plus the media manifest (D7); optional normalized `media:` reference form t.b.d.

**Open:** canonical cloze syntax (see D10 — cloze is also a scheduling question); whether to normalize `[sound:…]`/`@media/`/`src=` references or preserve verbatim per dialect.

## D3: Serialization format (Story 5.0.2)

**Problem:** No serialization exists today; README promises open + human-readable; candidates per Story 5.0.2: JSON/YAML/Markdown+frontmatter/EDN/hybrid.

**Research input:** every surviving interchange format is either JSON (CrowdAnki, Mochi API) or zip-of-structured-file(s)+media (.mochi, .cards, .apkg); the git-collaboration value of CrowdAnki comes from _directory-of-files_; EDN/Transit is precise but tooling-poor outside Clojure (mochi.md §1).

**Draft position (lesson 10):** **directory of JSON files + media folder as the canonical form; zip of the same as transport.** JSON for schema/tooling (JSON Schema validation, Story 5.0.4); one file per concern (`package.json` manifest, `decks.json`, `note-types.json`, `notes/…`, `reviews.jsonl` append-friendly, `media/`). Note content as separate Markdown/HTML files only if D2 lands on human-editability as a hard requirement — else inline strings.

**Open:** single-file-per-note vs chunked files (100k-review collections must stay practical); JSONL for the review log; exact layout.

## D4: Versioning & extensibility

**Problem:** README promises upward compatibility; the audit proved unspecified escape hatches rot (data goes into `applicationSpecificData`, never comes back out). iCal's flat `X-` namespace ended in collisions needing an IANA registry retrofit (prior-art §8).

**Draft position (lessons 11/12):**

- Top-level `formatVersion` (semver); small required core; everything else optional; "must-ignore unknown fields" rule.
- **Namespaced extension blocks** (`extensions: { "anki": {...}, "mochi": {...} }` with a vendor-prefix rule for non-registered apps) replacing today's flat `applicationSpecificData`.
- **Restore obligations in the spec**: a conforming exporter for app X MUST restore its own namespace on round-trip — the direct fix for the audit's core finding, upgrading ADR-0003 from convention to contract.
- Registry path: extension keys can graduate to core in minor versions.

## D5: Identity & dedup/merge

**Problem:** Sources have incompatible identity: Anki note guid + epoch-ms ids + 64-bit template ids, Mnemosyne UUID/`_id` dual, Mochi 8-char ids, SuperMemo local ints. Re-import must not duplicate (CrowdAnki solves via UUID merge keys; genanki via frozen ids + content-hash guids — prior-art §1/§2).

**Draft position:**

- Keep UUIDv7 as universal id; add first-class **`sourceIds`** map per entity (`{ "anki": {"noteId": "...", "guid": "..."}, ... }`) instead of stringly `originalAnkiId`.
- **Deterministic derivation**: converting the same source twice yields the same universal ids (e.g., UUIDv5-style hash of source identity into UUID space) — required for idempotent re-import and git-friendly diffs.
- Optional **content-hash guid** over declared identity fields (genanki pattern, lesson 4) for cross-source dedup.

**Open:** is merge semantics in the spec's scope, or a documented implementation concern?

## D6: Organizational structure — what is a "deck"?

**Problem:** Four different models (matrix, divergence 3); additionally Anki attaches decks to **cards**, while the current universal model attaches them to **notes** (converter silently moves cards today — audit-adjacent).

**Draft position:**

- Decks as first-class entities with **`parentId` hierarchy** (explicit, not name-encoded) + optional deck-config reference (lesson 13).
- **Card-level deck assignment with note-level default** — represents Anki faithfully; formats without decks map: Mnemosyne tags ↔ decks by convention (documented, reversible), SuperMemo tree → deck path, criteria/filtered decks → namespaced extension.
- Deck configs (presets) as separate referenced entities, many-to-one (Anki `dconf`, FSRS dataset `preset_id`).

## D7: Media as a first-class entity

**Problem:** No universal media entity; audit F3 shows all media silently dropped.

**Draft position:** media manifest entries: id, **real filename**, **content hash** (sha256; Anki modern uses sha1, Mnemosyne unspecified checksum — hash algo declared per entry), mime, size; bytes in the package's media directory (or external-resolution mode). Content keeps native references (D2); SuperMemo's Q/A side flags live in the SM extension namespace.

## D8: Missing basics — tags, timestamps, styling, config

Research confirms all of these exist in ≥2 formats and are currently absent from the universal model:

- **Tags**: on notes; hierarchical via explicit array or `::` convention (Anki + Mnemosyne both use `::`); Mochi's inline tags fold into the same field. First-class objects (Mnemosyne) not needed — string list suffices, extension for tag metadata.
- **Timestamps**: `created`/`modified` (epoch ms) on notes, cards, decks, note types. Spec must define timezone handling for _day-boundary_ semantics (Anki days-since-crt + rollover hour; Mnemosyne UTC-midnight + `day_starts_at`) — recommendation: store absolute ms; day-quantization is a scheduler concern kept in extension blocks.
- **Note type styling**: css field + per-field display hints (font, rtl) as optional core.
- **Suspended/buried/archived**: a small universal card-status enum (active/suspended/archived) — Anki queue<0, Mochi archived, Mnemosyne `active=0` all need a home; finer states in extensions.

## D9: Fidelity contract & conformance

**Problem:** "Round-trip: Working" meant "content survives, everything else resets" (audit). Prior-art lesson 15: every existing format fails silently somewhere — the differentiator is making failure explicit and testable.

**Draft position:**

- RFC defines **conformance profiles**: _content_ (fields, note types, decks, tags, media), _history_ (+review log), _full_ (+extensions restored). CrowdAnki-style sharing = content profile; migration = history; same-app round-trip = full.
- Exporters MUST report what they dropped (ties into the existing tri-state `ConversionResult`) — silent loss is a spec violation, directly addressing audit F1–F5/F15.
- Golden-fixture conformance tests derive from the spec per profile.

## D10: The schedulable unit — note/card split vs card-only vs sub-schedules

**Problem (new, from research):** Anki/Mnemosyne: note → N cards. Mochi/SuperMemo: card-only. Mochi additionally attaches **multiple independent schedules to one card** (front, reverse, per-cloze-group — mochi.md §3); Anki cloze generates cards by content markers with no fixed template list (the current `templateId >= templates.length` cloze hack in `srs-package.ts`).

**Draft position:**

- Keep the note → cards model (the more expressive of the two; card-only formats map as note with one card).
- A card is **the** schedulable unit; Mochi's sub-schedules import as sibling cards (`generator: reverse | cloze:1 | …` on the card), exported back by folding.
- Replace numeric `templateId` with an explicit **card generator descriptor**: `{ type: "template", templateId } | { type: "cloze", index } | { type: "reverse" }` — kills the cloze special-casing (audit F9/S1/S2 cluster) and represents all four formats' generation models.

**Open:** whether topics (SuperMemo read-only elements) are cards with a `kind: topic` or out of scope for v1.

---

## Suggested decision order

D1 (rating/log) → D10 (unit model) → D2 (content) → D6 (decks) → D5 (identity) → D7/D8 (media/basics) → D4 (extensibility) → D3 (serialization) → D9 (conformance). D1/D10/D2 shape every entity; D3 is deliberately late (Story 5.0.2 evaluates serialization _after_ the data model is known); D9 wraps the RFC.
