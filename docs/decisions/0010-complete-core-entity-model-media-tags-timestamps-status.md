---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Complete the Core Entity Model: Media, Tags, Timestamps, Card Status

## Context and Problem Statement

The current universal model has no media entity (all media silently dropped — audit F3), no tags (commented out), no created/modified timestamps, and no card status — yet each of these exists in at least two researched formats. What belongs in the core, and in what shape?

## Decision Drivers

- Media: all four formats reference media from content and store bytes beside the data; modern Anki (sha1) and Mnemosyne (hash column) already content-address it (prior-art lesson 9).
- Tags: Anki and Mnemosyne share the `::` hierarchy convention; Mochi has flat tags.
- Timestamps: sources disagree on units (ms/s/day-quantized); day-boundary semantics (Anki rollover hour, Mnemosyne `day_starts_at`) are scheduler concerns, not data concerns.
- Status: suspended/buried (Anki queue < 0), archived (Mochi), inactive (Mnemosyne `active=0`) all express "not in review" and currently vanish (audit F1).

## Considered Options

1. Add all four as lean core fields (media manifest entity, string-array tags, epoch-ms timestamps, three-value card status)
2. Add them as extension-namespace data only
3. Add maximal versions (first-class tag entities, full per-format status enums)

## Decision Outcome

Chosen option 1 — lean core, format-specific richness in extensions:

- **Media entity** (in `media/manifest.json`, per ADR-0007): real filename, content hash (`{ algo: "sha256", value }` — declared algorithm so source hashes can be carried), mime type, size. Bytes live in `media/`; an external-resolution mode (manifest without bytes) is defined for sharing use cases. Content keeps its native reference syntax (per D2/ADR-0006); SuperMemo's question/answer side flags live in the SM extension namespace.
- **Tags**: `tags: string[]` on notes. Hierarchy by `::` convention, documented (matches Anki and Mnemosyne natively; flat for Mochi). Tag metadata (Mnemosyne's tag UUIDs/extra data) goes in extension blocks.
- **Timestamps**: `created` and `modified` (epoch ms, UTC) on notes, cards, decks, note types. Sources with second precision multiply; day-quantized values and day-boundary offsets remain in scheduler extension blocks (ADR-0004).
- **Card status**: `status: "active" | "suspended" | "archived"` on cards. Finer states (buried-until, trash timestamps, filtered-deck displacement) map to extension blocks with RFC-defined fold rules back to the three core values.

### Consequences

- Good, because the audit's silent-loss classes for media (F3), tags (F5), timestamps (F13/F14), and suspension state (part of F1) get structural homes.
- Good, because content-addressed media enables dedup and integrity checking across packages.
- Bad, because three-value status is deliberately lossy in core; fidelity depends on the extension mechanism (ADR-0011) being honored.
- Neutral, because tag strings (not entities) mean Mnemosyne tag metadata survives only via extensions — accepted for core simplicity.

## More Information

Research basis: `docs/formats/README.md` (media row, tags row, timestamps row; "Media handling approaches"), audit F1/F3/F5/F13/F14. Decision backlog: D7 + D8 in `docs/formats/open-decisions.md`.
