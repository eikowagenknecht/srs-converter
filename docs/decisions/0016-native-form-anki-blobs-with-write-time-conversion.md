---
status: "accepted"
date: 2026-07-11
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/anki.md)
---

# Store Anki Entity Blobs in Source-Native Form; Convert Only at Write Time

## Context and Problem Statement

The `applicationSpecificData` escape hatch (ADR-0003/ADR-0011) stores each Anki entity's original row so the writer can restore full fidelity. Today every blob is schema-11 JSON, because Legacy 2 is the only supported format. With schema-18 read **and** write in scope (ADR-0015), entity configs can originate as protobuf. In which shape do we store them, given that either writer may later consume them?

## Decision Drivers

- Same-format round trips (legacy→legacy, modern→modern) should be lossless by construction, not by careful conversion.
- The legacy→legacy path is shipped and verified (`anki-package.roundtrip.test.ts`); it must not gain new conversion risk.
- Crossing schemas is inherently (mildly) lossy — modern Anki's own schema-11 dialect carries most post-11 settings as extra JSON keys, but per-template `mtime`/`usn` are zeroed, per-deck `desired_retention` loses precision (integer percent), and per-tag state is dropped (full inventory: `docs/formats/anki-schema-mapping.md`) — so conversion belongs exactly at the crossing and nowhere else.
- Read+write of both schemas requires the two conversion functions (proto→11, 11→proto) regardless; the only question is where they run.

## Considered Options

1. Always down-convert to schema-11 JSON at read time (single canonical shape, legacy writer unchanged)
2. Always up-convert to the decoded-proto shape at read time (single canonical shape, mirrors Anki's internal model)
3. Source-native form + schema marker; convert at write time only when the target schema differs from the source

## Decision Outcome

Chosen option 3.

- **Legacy 2 source** → blobs remain schema-11 JSON, byte-for-byte today's behavior; the existing read path and round-trip guarantees are untouched.
- **Schema-18 source** → blob is the decoded protobuf as JSON: keys are the proto field names (snake_case) as pinned in `docs/formats/anki.md`, enums as numbers, `bytes` as base64, plus a reserved key holding base64 raw bytes of unmodeled fields (the ADR-0013 unknown-field passthrough, surviving JSON storage).
- **Schema marker**: each entity's `applicationSpecificData` records which dialect the blob is in (an `ankiSchema`-style key; exact naming in the implementation story).
- **Writers**: passthrough when blob dialect matches the target; run the conversion function when crossing (legacy writer: proto→11; modern writer: 11→proto). The conversions mirror Anki's own downgrade/upgrade paths so a package we convert behaves like one Anki converted.

Rejection rationale: option 1 silently drops proto-only fields even on modern→modern trips — unacceptable now that a modern writer exists. Option 2 routes the shipped legacy→legacy path through an 11→proto→11 conversion that would have to be perfect on day one, converting a passthrough guarantee into conversion risk.

### Consequences

- Good, because same-schema round trips are lossless by construction and the verified legacy path is untouched.
- Good, because loss happens only where it is inherent (schema crossings) and Anki-compatible by design.
- Bad, because two blob dialects exist downstream; every consumer of these blobs (in practice only `fromSrsPackage`'s overlay logic) must branch on the marker.
- Neutral, because blobs from mixed-provenance packages (some entities legacy, some modern) are legal; the marker is per entity, not per package.

### Confirmation

Round-trip tests in all four directions (legacy→legacy, modern→modern, legacy→modern, modern→legacy) over the fixture corpus; the two same-schema directions assert semantic losslessness including unknown/add-on fields, the two crossings assert exactly the documented loss set and nothing more.

## More Information

Blob dialect shapes and the proto-only field inventory live in `docs/formats/anki.md`. Related: ADR-0011 (restore obligations), ADR-0013 (codec invariants), ADR-0015 (scope).
