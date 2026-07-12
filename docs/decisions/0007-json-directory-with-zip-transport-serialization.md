---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Serialize as a JSON Directory with Zip Transport

## Context and Problem Statement

The universal format currently has no serialization — it exists only as in-memory TypeScript objects. The README promises an open, human-readable, well-documented format; Story 5.0.2 lists JSON, YAML, Markdown+frontmatter, EDN, and hybrids as candidates. Real collections carry 100k+ reviews, so the format must stay practical at scale and friendly to version control.

## Decision Drivers

- Every surviving interchange format is JSON or a zip of structured files + media; EDN/Transit is precise but tooling-poor outside Clojure (`docs/formats/prior-art.md`, `mochi.md`).
- CrowdAnki's git-collaboration value comes from being a directory of files (prior-art lesson 10).
- JSON Schema gives the validation story Story 5.0.4 requires; YAML tooling is weaker and its spec has well-known footguns.
- The review log (ADR-0004) grows monotonically and needs an append- and diff-friendly shape.
- Media must never be embedded base64 in the readable body (prior-art lesson 9).

## Considered Options

1. Directory of JSON files (review log as JSONL) + media folder; zip of the same tree as single-file transport
2. Single JSON file (+ zip with media)
3. Markdown notes with YAML frontmatter + JSON structural files
4. YAML throughout

## Decision Outcome

Chosen option 1: **JSON directory + zip transport**.

Canonical layout (names indicative; exact schema fixed in the RFC):

```text
my-deck.srspkg/
├─ package.json        # formatVersion, rating scale declaration, source app
├─ decks.json
├─ note-types.json     # fields, templates (universal language + css), contentFormat
├─ notes.json          # may shard to notes/*.json above a size threshold
├─ cards.json          # generator descriptors, extension blocks
├─ reviews.jsonl       # one review per line, chronological, append-only
└─ media/
   ├─ <real filenames>
   └─ manifest.json    # name → hash, mime, size
```

- The **directory is the canonical form**; a zip archive of the identical tree is the defined single-file transport (like `.mochi`/`.cards`). Implementations MUST treat both identically.
- The review log is **JSONL**: appends don't rewrite the file, git diffs stay proportional to change, and streaming parsers work at any collection size.
- All JSON files are covered by published **JSON Schemas** (Story 5.0.4).

### Consequences

- Good, because packages are git-diffable, mergeable, and PR-able — the collaboration property that made CrowdAnki succeed.
- Good, because JSON Schema validation, streaming JSONL parsing, and universal tooling come for free.
- Good, because media stays as plain files with real names next to a hash manifest.
- Bad, because "human-readable" means _inspectable-with-any-editor_, not _prose-like_ — YAML/Markdown proponents lose comments and narrative formatting.
- Bad, because two physical forms (directory, zip) must be kept behaviorally identical in implementations and conformance tests.
- Neutral, because sharding rules for very large `notes.json` need one more RFC decision (threshold and file naming), deferred to the spec draft.

## More Information

Research basis: `docs/formats/prior-art.md` (lessons 9, 10, 11), `docs/formats/mochi.md` §1 (EDN/Transit experience), Story 5.0.2 evaluation criteria in `docs/stories/phase-5.md`. Decision backlog entry: D3 in `docs/formats/open-decisions.md`. This ADR resolves Story 5.0.2's strategic question; benchmarking and sample-data validation remain as implementation-time checks. Related: ADR-0004 (review log), upcoming media/identity ADRs.

Refined by ADR-0017 (spec draft.2): the manifest file is `manifest.json` (npm collision avoidance), the version field is `usfVersion`, and deck configs live in a separate `deck-configs.json`.
