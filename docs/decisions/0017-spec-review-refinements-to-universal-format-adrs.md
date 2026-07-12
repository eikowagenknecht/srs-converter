---
status: "accepted"
date: 2026-07-11
decision-makers: Eiko Wagenknecht
consulted: Claude (spec review, five-agent fact-check against docs/formats/, ADRs, and the round-trip audit)
---

# Spec-Time Refinements to the Universal Format ADRs (Draft.2 Review)

## Context and Problem Statement

The maintainer review of `docs/spec/universal-srs-format.md` 1.0.0-draft.1 (Story 5.0.5, 2026-07-11) resolved 27 findings and produced draft.2. Several resolutions deliberately deviate from decisions recorded in ADR-0004…ADR-0011. The spec states that it governs once accepted — but undocumented deviations are indistinguishable from editing errors, and a later audit would rediscover each one as a suspected bug. Where do the deviations and their rationales live?

## Decision Outcome

This ADR is the single record of the spec-time deviations. Each affected ADR carries a one-line pointer here; the full finding-by-finding change list is Appendix B of the spec. The deviations:

- **ADR-0004 (review log):** `rating` is conditional on review `kind` — absent for `manual`/`rescheduled` rows, where sources record no grade (Anki writes `ease = 0`). The optional scheduled/actual interval fields are **removed from core**: per-row interval columns are scheduler decisions, i.e. exactly the regenerable caches this ADR routes to extensions; they now ride verbatim in per-review extension blocks, and elapsed time is derivable from consecutive review timestamps. The once-per-package scale declaration is **reaffirmed** (draft.1's note-type/per-review overrides are removed; merge/append workflows that would need them are out of scope for 1.0).
- **ADR-0005 (generators):** the template generator references templates by **name** (`templateName`), consistent with ADR-0006's name-keyed field identity, not by `templateId`. The cloze `index` is the **literal source group number** (gaps legal), not a normalized position.
- **ADR-0007 (serialization):** the manifest file is **`manifest.json`**, not `package.json` (a `.srspkg` directory containing `package.json` collides with npm/bundler workspace scanning); the version field is **`usfVersion`**, not `formatVersion`; deck configs get their own `deck-configs.json` so every entity file stays a flat single-type array.
- **ADR-0008 (decks) — partially superseded:** the "Mnemosyne tags ↔ decks by documented convention (reversible)" mapping rule is **dropped**. The convention has no clean answer for multi-tag facts and stops being reversible the moment the user renames a synthesized deck; it was also the spec's only implicit heuristic transformation. Mnemosyne packages carry no decks; note `deckId` is nullable; exporters to deck-requiring targets synthesize a single package-default deck, reported and recorded in the `srs-converter` namespace. Everything else in ADR-0008 stands, including the note-level-only fold rule (restored into spec §12 after falling out of draft.1).
- **ADR-0009 (identity):** the optional content-hash guid is **removed from 1.0** — its computation rules (canonicalization, separators, Unicode normalization) would be real spec weight for a dedup/merge use case that is out of scope, and as pure additive metadata it can be retrofitted in a minor safely. Reviews and the package id are **exempt** from deterministic derivation (reviews: `sourceIds` plus a tuple-equality rule; package: fresh UUIDv7 per export artifact). The `entityType` strings of the derivation formula are now enumerated in the spec, and the fresh-v7 fallback for identity-less imports — decided here but dropped in draft.1 — is restored.
- **ADR-0010 (core entities):** timestamps are named `createdAt`/`modifiedAt` (the spec's `…At` convention), not `created`/`modified`. The media **external-resolution mode is removed from 1.0**: it had no locator field and no verification story; bytes are always bundled, hashes always required. Note types regained the timestamps this ADR granted them (dropped in draft.1 by mistake).
- **ADR-0011 (extensions):** the version field is named `usfVersion` (see ADR-0007 above); where a graduated core field and its namespace form are both present, the **core field wins**.

### Consequences

- Good, because the spec-vs-ADR record is consistent again: every deviation is deliberate, dated, and has a rationale — a future audit diffing spec against ADRs lands here instead of filing bugs.
- Good, because three half-specified mechanisms (content hash, external media, scale overrides) were removed rather than shipped underdefined; all three have compatibility-safe retrofit paths.
- Bad, because readers of ADR-0004…0011 must follow one more hop to get the current truth (mitigated by the per-ADR pointer lines).
- The corresponding normative text is spec 1.0.0-draft.2; the full review change list is the spec's Appendix B.

## More Information

Review basis: `docs/spec/universal-srs-format.md` Appendix B (draft.2 change list); the five-agent fact-check findings against `docs/formats/` dossiers, `docs/working/audit-2026-07-10-roundtrip.md`, and ADRs 0002–0012; validation walk in `docs/formats/validation-walk.md`.
