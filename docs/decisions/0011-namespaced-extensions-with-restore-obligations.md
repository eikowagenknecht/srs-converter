---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Versioned Core with Namespaced Extensions and Restore Obligations

## Context and Problem Statement

The README promises upward compatibility; ADR-0003 introduced `applicationSpecificData` as a preservation escape hatch. The 2026-07-10 audit proved that an _unspecified_ escape hatch rots: data goes in and is never restored (GUIDs, tags, scheduling, deck JSON — all captured, none written back). iCalendar's flat `X-` extension namespace ended in vendor collisions that required an IANA registry retrofit. How do the format's versioning and extension mechanisms work so that preservation is a contract, not a convention?

## Decision Drivers

- Audit findings F1–F5/F11–F13: every escape-hatched field without a specified restore path was lost.
- iCal/GPX/ActivityStreams convergence: version marker + small required core + optional-by-default + explicitly namespaced extensions (prior-art §8, lessons 11/12).
- ADR-0004/0006 already depend on namespaced blocks (scheduler snapshots, verbatim templates) with defined authority rules.

## Considered Options

1. Semver `formatVersion` + must-ignore-unknown rule + namespaced `extensions` blocks with normative restore obligations
2. Keep flat `applicationSpecificData` (ADR-0003 as-is)
3. JSON-LD-style URI-namespaced extensions

## Decision Outcome

Chosen option 1.

- **`formatVersion`** (semver) at package level. Minor versions only add optional fields; consumers MUST ignore unknown fields; majors may break. This is the operational meaning of "upward compatible."
- **Small required core**: ids, entity types, and the relationships between them; everything else optional.
- **Extensions**: every entity gets `extensions: { "<namespace>": object }`. Namespaces are either registered short names (`anki`, `mnemosyne`, `supermemo`, `mochi`, …) maintained in the RFC's registry section, or vendor-prefixed (`x-<vendor>-<name>`) for unregistered apps. Registered keys can graduate to core in minor versions.
- **Restore obligations (normative)**: a conforming exporter targeting app X MUST consume the `x` namespace when present and restore its contents to their native locations. Dropping own-namespace data is a conformance violation and must surface as a reported issue at minimum.
- **Supersedes ADR-0003**: `applicationSpecificData` (flat string map, no obligations) is replaced by this mechanism.

### Consequences

- Good, because preservation becomes testable: same-app round-trip fixtures can assert restoration field by field.
- Good, because vendor collisions are structurally prevented and there's a promotion path into core.
- Good, because ADR-0004's scheduler snapshots and ADR-0006's verbatim templates get their formal home.
- Bad, because typed-object extensions are more spec surface than a string map; each registered namespace needs its own documented schema.
- Bad, because ADR-0003's existing string-map data model in code must migrate.

## More Information

Research basis: prior-art §8 and lessons 11/12; audit (docs/working/issues.md). Decision backlog: D4 in `docs/formats/open-decisions.md`. Supersedes: ADR-0003 (to be marked accordingly once this ADR is accepted).
