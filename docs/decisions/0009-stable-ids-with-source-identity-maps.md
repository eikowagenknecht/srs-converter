---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Stable Universal IDs with Source Identity Maps and Deterministic Derivation

## Context and Problem Statement

Every source format has its own identity scheme: Anki uses creation-epoch-ms ids plus a base91 note `guid` for cross-collection dedup plus 64-bit template/field ids; Mnemosyne uses public UUIDs beside machine-local rowids; Mochi uses 8+-char alphanumeric ids; SuperMemo has only tree-local integers. Converting the same source twice must not duplicate entities, and re-importing a converted package into its source app must update rather than duplicate.

## Decision Drivers

- CrowdAnki's UUID merge keys and genanki's frozen-id + content-hash-guid rules are the two proven dedup patterns (prior-art §1/§2, lessons 3/4).
- The current stringly `originalAnkiId` in `applicationSpecificData` is unstructured and was never restored (audit).
- Idempotence: same input → same output ids is what makes git diffs of regenerated packages reviewable.
- Anki regenerating GUIDs on export (audit F4) breaks re-import dedup today.

## Considered Options

1. UUIDv7 universal ids + first-class `sourceIds` map + deterministic derivation from source identity + optional content-hash guid
2. Random UUIDs only, source ids in extension data (status quo, structured slightly better)
3. Source-native ids as primary ids (no universal id space)

## Decision Outcome

Chosen option 1.

- **Universal id**: UUID (v7 for natively created entities), on every entity.
- **Deterministic derivation**: when importing, universal ids are derived deterministically from source identity (UUIDv5-style namespace hash over e.g. Anki note guid, Mnemosyne object UUID, Mochi id) — converting the same source twice yields byte-identical ids. Only entities with no usable source identity get fresh v7 ids.
- **`sourceIds`**: first-class per-entity map, e.g. `{ "anki": { "noteId": "1699...", "guid": "Ab3(x..." } }`, replacing `originalAnkiId`. Exporters MUST use their own entry to restore native identity (Anki gets its original guid back — fixing audit F4 by design).
- **Content-hash guid** (optional field): deterministic hash over RFC-declared identity fields for cross-source dedup, distinct from the universal id.
- **Merge algorithms are out of the spec's scope**; the spec defines identity and equality, implementations define merge policy.

### Consequences

- Good, because re-import into the source app updates instead of duplicating; regeneration is idempotent and diffable.
- Good, because identity survives conversion in a typed structure the exporter is obligated to consume.
- Bad, because deterministic derivation rules must be specified precisely per source format (RFC appendix) and tested.
- Neutral, because two optional identity facets (sourceIds, content hash) coexist — the RFC must state clearly that the universal id is the only required key.

## More Information

Research basis: prior-art lessons 3, 4, 5; `docs/formats/README.md` identity row; audit F4. Decision backlog: D5 in `docs/formats/open-decisions.md`.

Refined by ADR-0017 (spec draft.2): the optional content-hash guid is removed from 1.0 (retrofit-safe); reviews and the package id are exempt from deterministic derivation; the `entityType` strings are enumerated in the spec.
