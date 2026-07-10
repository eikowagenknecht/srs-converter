---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Conformance Profiles and Mandatory Loss Reporting

## Context and Problem Statement

The README's "Round-trip: Working" claim turned out to mean "content survives, everything else silently resets" (2026-07-10 audit). Prior art shows every existing interchange format fails _silently_ in a different place. What fidelity does the universal format actually guarantee, and how is a claim of conformance made checkable?

## Decision Drivers

- The sharing vs. migration split is real: CrowdAnki deliberately drops scheduling (sharing); FSRS datasets keep only history (migration) — one format must serve both without ambiguity (prior-art lesson 2).
- Silent loss is the root failure mode in the audit; the existing tri-state `ConversionResult` (ADR-0002) is the natural reporting channel.
- A spec nobody can test compliance against will drift exactly like the README's support matrix did.

## Considered Options

1. Named conformance profiles + mandatory loss reporting + golden-fixture conformance suite derived from the spec
2. Single all-or-nothing conformance level
3. No conformance section (informative spec only)

## Decision Outcome

Chosen option 1.

- **Profiles** (cumulative):
  - **content** — note types, notes (fields, tags), decks, cards (with generators), media. The sharing profile; scheduling-free by design.
  - **history** — content + the complete review log with original-scale ratings (ADR-0004). The migration profile.
  - **full** — history + extension namespaces preserved and restored per ADR-0011. The same-app round-trip profile.
- Packages declare which profile they carry; converters declare which they support per direction (e.g. SuperMemo XML import can honestly offer only _content_ + aggregate snapshots).
- **Mandatory loss reporting**: whenever a converter drops or degrades data (profile downgrade, unmappable construct, folded status), it MUST emit a conversion issue through the tri-state result. Silent loss is a conformance violation — the spec's answer to audit F1–F5/F15.
- **Conformance suite**: golden fixtures per profile, derived from the RFC's examples, asserting field-level survival for same-format round-trips and defined degradation for cross-format paths. Lives in this repository and doubles as the regression suite for Phase 6.

### Consequences

- Good, because "supports the universal SRS format" becomes a testable claim at a declared level, for this library and third parties alike.
- Good, because honest capability declarations replace aspirational support matrices.
- Bad, because fixtures and profile checks are a real maintenance surface that must evolve with the spec.
- Neutral, because profile declarations add one required package field.

## More Information

Research basis: prior-art lessons 2 and 15; audit findings; ADR-0002 (tri-state results as the reporting channel). Decision backlog: D9 in `docs/formats/open-decisions.md`.
