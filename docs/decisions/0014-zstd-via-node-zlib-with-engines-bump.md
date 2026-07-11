---
status: "accepted"
date: 2026-07-11
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/anki.md)
---

# zstd via node:zlib, Bumping the Node Floor to 22.15

## Context and Problem Statement

Anki package v3 zstd-compresses the collection database (`collection.anki21b`, whole-file), the media manifest, and every media file (individually). Reading and writing the modern format (ADR-0015) therefore needs zstd decompression **and** compression. The library currently declares `engines.node >= 22.0.0`; native zstd support landed in `node:zlib` in Node 22.15.0.

## Decision Drivers

- Both directions are required (read + write per ADR-0015).
- Dependency budget: prefer platform capabilities over new packages.
- The library is already Node-only in practice (`unzipper`, `node:fs`, temp dirs); there is no browser build to protect.
- Node 22.15 is a patch-line release within the already-required 22.x LTS; requiring it excludes only stale 22.0–22.14 installs.

## Considered Options

1. `node:zlib` native zstd, raise `engines.node` to `>=22.15.0`
2. `fzstd` (pure JS, decompress-only)
3. A zstd WASM package (e.g. `@bokuweb/zstd-wasm`)

## Decision Outcome

Chosen option 1. Raise `engines.node` to `>=22.15.0` and use `node:zlib`'s zstd APIs (streaming for the collection file, buffer variants for manifest and media blobs).

Compatibility facts from the pinned Anki source (`docs/formats/anki.md`): Anki writes standard zstd frames at default level (its encoder is constructed with level 0 = library default 3) and enables multithreaded compression only above 10 MiB; its importer accepts any valid zstd frame. So `node:zlib` output is interchangeable with Anki's, and no level tuning is required for correctness.

### Consequences

- Good, because zero new dependencies for both compression and decompression.
- Good, because native code outperforms pure-JS/WASM for the multi-megabyte collection files.
- Bad, because the engines tightening drops Node 22.0–22.14; ship it in the same release as the modern-format feature (which is already a breaking release per ADR-0015) and mention it in the changelog.
- Neutral, because a future browser build would need to revisit this (WASM), but no such build exists or is planned.

### Confirmation

CI runs on the new floor version so a regression in the engines claim fails visibly; the fixture round-trip suite exercises compression against files Anki itself produced.

## More Information

Node zstd APIs: `zlib.zstdCompress`/`zstdDecompress` (+ sync/stream variants), added in Node 22.15.0/23.8.0. Related: ADR-0013 (codec), ADR-0015 (scope).
