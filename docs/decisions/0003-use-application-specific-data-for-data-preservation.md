---
status: accepted
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
2. Fallback: Extract timestamp from UUIDv7 (decks/notes/cards) or use `review.timestamp` (reviews)
