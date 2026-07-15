---
status: "accepted"
date: 2026-07-15
decision-makers: Eiko Wagenknecht
consulted: Claude (library evaluation)
---

# zstd Platform Split: node:zlib on Node, WASM in the Browser

## Context and Problem Statement

ADR-0014 chose `node:zlib`'s native zstd (raising the Node floor to 22.15)
and noted that a browser build would need to revisit the choice. ADR-0018
introduces a browser-portable core, and the modern Anki package format
(ADR-0015) needs zstd compression **and** decompression on every platform.

## Decision Drivers

- Keep the native, dependency-free implementation on Node (ADR-0014's
  rationale still holds there).
- Browser consumers should not have to wire up a wasm asset just for zstd
  (they already must do so for sql.js — one asset chore is enough).
- Both directions required; frames must interop with Anki's importer/exporter.

## Considered Options

1. Keep `node:zlib` on Node; `@hpcc-js/wasm-zstd` behind the browser
   condition of the platform module
2. One WASM zstd implementation everywhere
3. `fzstd` (pure JS) — decompress-only
4. `@bokuweb/zstd-wasm` — separate wasm asset the consumer must deploy

## Decision Outcome

Chosen option 1. The internal `#platform` module (ADR-0018) exposes
`zstdCompress`/`zstdDecompress`; the Node implementation keeps `node:zlib`
(engines floor stays `>=22.15.0`), the browser implementation uses
`@hpcc-js/wasm-zstd`, whose wasm is embedded in its ESM bundle so consumers
need no asset wiring or configuration.

Compatibility: `@hpcc-js/wasm-zstd` compresses at zstd default level 3 —
the same default Anki uses — and Anki's importer accepts any valid zstd
frame (ADR-0014), so frames from either implementation interoperate. Option
2 would penalize Node users who have native support built in; option 3
cannot compress; option 4 works but pushes wasm-asset deployment onto every
browser consumer.

### Consequences

- Good, because Node keeps zero-dependency native performance and Anki
  compatibility facts from ADR-0014 carry over unchanged.
- Good, because browser bundlers need no special configuration for zstd.
- Bad, because the embedded wasm adds roughly 0.5–1 MB to browser bundles.
  Fallback if that becomes a problem: switch the browser side to
  `@bokuweb/zstd-wasm` plus a `configureZstd({ wasmUrl })` hook mirroring
  `configureSqlJs`.
- Neutral, because two implementations exist for one interface; a
  cross-implementation test compresses with one and decompresses with the
  other in both directions to guard frame compatibility.

### Confirmation

- `src/anki/zstd.test.ts` runs both platform adapters under Node, including
  node-compressed → wasm-decompressed and wasm-compressed →
  node-decompressed roundtrips.
- The browser smoke test exercises WASM zstd in a real Chromium via a
  modern-format `.apkg` roundtrip.

## More Information

Amends ADR-0014 (whose "no browser build exists or is planned" consequence
is superseded by ADR-0018).
