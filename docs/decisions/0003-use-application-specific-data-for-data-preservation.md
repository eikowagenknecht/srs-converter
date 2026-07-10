---
status: superseded by ADR-0011
date: 2025-10-19
---

# Use applicationSpecificData for Data Preservation Across Formats

## Context and Problem Statement

When converting between SRS formats (e.g., Anki → Universal SRS → Anki), entity IDs need to be preserved to maintain referential integrity in external systems that track entities by ID (sync systems, analytics, external databases). However, different formats use incompatible ID systems:

- **Anki**: Numeric IDs (unix timestamps in milliseconds)
- **Universal SRS**: UUIDs (specifically UUIDv7)

How do we preserve format-specific IDs during round-trip conversions while maintaining the universal format's design principle of using UUIDs?

The solution must not only work for Anki but be extensible to future formats (Mnemosyne, SuperMemo, etc.).

There will probably be more than just ID preservation needs in the future (fields that are not supported by universal SRS), so having a dedicated extensible storage is beneficial.

## Considered Options

1. Store format-specific IDs as numeric strings in SRS `id` field
2. Use `applicationSpecificData` dictionary to preserve original IDs

## Decision Outcome

Chosen option: "Use `applicationSpecificData` dictionary", because it maintains the universal format's UUID design principle while providing perfect ID preservation.

### Consequences

- Good, because SRS format maintains clean UUID-based identity
- Good, because extensible to any format (just add `originalMnemosyneId`, etc.)
- Good, because round-trip conversions preserve IDs perfectly
- Good, because backward compatible (optional field)
- Neutral, because adds small metadata overhead
- Bad, because requires accessing nested property for original IDs

## More Information

### ID Resolution Strategy

### Anki → SRS

- Generate new UUIDv7 for SRS `id`
- Store Anki ID in `applicationSpecificData.originalAnkiId` as string

### SRS → Anki

Two-step resolution:

1. Use `applicationSpecificData.originalAnkiId` if present (preserves round-trip)
2. Fallback: Extract timestamp from UUIDv7 (decks/notes/cards) or use `review.timestamp` (reviews). Hand-authored ids that are not valid UUIDv7 are hashed to a stable positive Anki id instead of being hex-parsed.

### Full-fidelity blob preservation

ID preservation alone is not enough for a lossless Anki → SRS → Anki round-trip:
Anki entities carry scheduling state, note-type internals, deck options, and
collection metadata that the universal format does not model natively. Rather
than replace the `applicationSpecificData` approach, the round-trip completes it
by storing the **full original Anki entity JSON** (serialized with BigInt-safe
serialization so 64-bit ids survive) and restoring it with an overlay in
`fromSrsPackage`.

Per-entity blobs live on each entity's `applicationSpecificData`:

| Entity    | Key              | Content                                                                            |
| --------- | ---------------- | ---------------------------------------------------------------------------------- |
| note      | `ankiNote`       | full `notes` row                                                                   |
| card      | `ankiCard`       | full `cards` row                                                                   |
| review    | `ankiReview`     | full `revlog` row                                                                  |
| deck      | `ankiDeck`       | full deck JSON (incl. options ref and plugin keys)                                 |
| note type | `ankiNoteType`   | full model JSON (css, LaTeX, `req`, field/template props, 64-bit ids, plugin keys) |
| note/card | `ankiData`       | the Anki add-on `data` column (user-facing override)                               |
| any       | `originalAnkiId` | the original numeric Anki id, as a string                                          |

Collection-scoped data that has no per-entity home lives on the package-level
`SrsPackage.applicationSpecificData` (accessed via
`getApplicationSpecificData()` / `setApplicationSpecificData()`):

| Key          | Content                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| `ankiCol`    | `col` scalars (`crt`, `mod`, `scm`, `dty`, `usn`, `ls`) + `conf` + `tags` |
| `ankiDconf`  | full `dconf` deck-options presets                                         |
| `ankiGraves` | `graves` (sync tombstone) rows                                            |

**Restore overlay precedence.** The blob is parsed as the base row, then the
fields the universal format owns are overlaid (SRS wins) and all cross-reference
ids are remapped. If a blob is missing or unparseable, `fromSrsPackage` falls
back to defaults and emits a warning issue rather than throwing. For the `data`
column specifically the precedence is:

1. `applicationSpecificData.ankiData` if present, else
2. the `data` value inside the captured blob, else
3. the default (`""` for notes, `"{}"` for cards).

This keeps the SRS format's clean UUID-based identity and native fields
authoritative while making the round-trip lossless for everything Anki-specific.
Universal fields (tags, scheduling, …) are expected to migrate to first-class
SRS model fields in a later phase; until then the blob is the mechanism that
preserves them.
