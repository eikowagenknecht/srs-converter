---
status: "accepted"
date: 2026-07-11
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/anki.md)
---

# Read and Write Anki Package v3 / Schema 18, With Modern as the Default Export Target

## Context and Problem Statement

srs-converter reads and writes only Anki's Legacy 2 package format (`collection.anki21`, schema 11). Anki's own default export has been package v3 (`collection.anki21b`, schema 18, zstd, protobuf blobs) since 23.10; users get Legacy 2 only by checking "Support older Anki versions". Today a modern export fails in this library with a misleading "missing collection.anki21" error. How much of the modern format do we support, and what does the writer emit by default?

## Decision Drivers

- Most real-world `.apkg` files are now package v3; failing on them is the library's biggest format gap.
- FSRS-era data (deck presets with FSRS params, per-deck desired retention) lives most faithfully in schema 18.
- Modern Anki still imports Legacy 2 first-class with no announced deprecation — a legacy writer remains a valid compatibility target.
- Asymmetric support (read-only) was considered and rejected by the maintainer: fidelity on export matters for this library's purpose.

## Considered Options

1. Read modern + keep writing Legacy 2 only
2. Read and write modern; **modern is the default** output, Legacy 2 stays available as an option
3. Detection + friendly error only

## Decision Outcome

Chosen option 2.

- **Reader**: detect the package version via the `meta` entry (algorithm in `docs/formats/anki.md`); Legacy 1/2 and package v3 all normalize into the same internal representation, so everything downstream of the reader is format-agnostic. Unrecognized future versions produce a clear "package too new" error.
- **Writer**: emits package v3 by default — matching what current Anki itself produces. Legacy 2 output remains available behind an explicit option that mirrors Anki's "Support older Anki versions" checkbox (exact API name decided in the implementation story).
- **Package layout parity**: the modern writer mirrors Anki's own output — `meta`, zstd-compressed `collection.anki21b`, the dummy schema-11 `collection.anki2` (so pre-2.1.50 clients see an explanatory note instead of a crash), and the modern media manifest. Details and importer-validation requirements are specified in `docs/formats/anki.md`.
- **Semver**: changing the default output format is breaking; it ships in a major release together with the ADR-0014 engines bump.

### Consequences

- Good, because current Anki exports work out of the box, and our default output matches what users' Anki produces and expects.
- Good, because deck presets, FSRS parameters, and per-deck retention survive export without down-conversion.
- Bad, because the work roughly doubles versus read-only: codec encode direction (ADR-0013), schema-18 DDL, media manifest writing, and the 11→proto up-conversion (ADR-0016).
- Bad, because consumers whose downstream tooling only reads Legacy 2 must now pass an option; called out in the migration notes.

### Confirmation

Fixture corpus generated with Anki's own Python bindings, exporting the same collection both modern and legacy: (a) both parse to equivalent `SrsPackage`s (differential test); (b) our modern output imports cleanly into real Anki in CI, preserving GUIDs, scheduling, FSRS state, and media.

## More Information

Format details: `docs/formats/anki.md` §"Modern Schema" and §"Pinned wire-format spec (Anki 26.05)". Related: ADR-0013 (codec), ADR-0014 (zstd), ADR-0016 (blob storage). Supersedes the "keep legacy 2 as default target" recommendation recorded in the 2026-07-10 research notes.
