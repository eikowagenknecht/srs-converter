---
status: "accepted"
date: 2026-07-15
decision-makers: Eiko Wagenknecht
consulted: Claude (portability survey, plan review)
---

# Browser-Portable Core: Bytes-Only API, Pluggable Media Storage, and Platform Modules

## Context and Problem Statement

The library was Node-only: the public API took and produced file paths, media
was staged in `mkdtemp` temp directories, `.apkg` containers were handled by
`archiver`/`unzipper` (Node-stream based), checksums came from `node:crypto`,
and zstd from `node:zlib` (ADR-0014). The maintainer wants the library usable
in browsers and in Tauri/Capacitor apps, whose webviews are browser
environments — one browser-compatible build covers all three. The
sql.js/kysely-wasm database layer was already portable.

## Decision Drivers

- One portable core rather than parallel Node and browser implementations.
- No filesystem access, Node streams, or Node globals in the public API.
- Keep Node ergonomics and performance where it matters (native zstd,
  disk-backed staging for large decks).
- Keep the dependency budget small and CSP-friendly (Tauri/Capacitor webviews
  reject worker-from-string tricks).
- Pre-1.0 (v0.3.0): breaking API changes are acceptable.

## Considered Options

1. Bytes-only public API + pluggable media storage + per-platform modules via
   conditional exports
2. Bytes core plus a `srs-converter/node` subpath with path-based convenience
   wrappers
3. Dual API in one entry (runtime detection, dynamic `node:fs` import)
4. Keep the path API and only add a separate browser build

## Decision Outcome

Chosen option 1.

- **Bytes-only public API**: `AnkiPackage.fromAnkiExport(data: Uint8Array)`,
  `toAnkiExport(): Promise<Uint8Array>`; media APIs on `AnkiPackage`,
  `SrsPackage`, and `MediaStore` accept and return `Uint8Array` (no paths,
  Node `Buffer`s, or `Readable` streams). Reading and writing files is the
  caller's job. The `.apkg` extension check is gone (there is no filename);
  content validation (ZIP magic, entry presence) replaces it.
- **ZIP via fflate** (sync APIs only): `archiver` and `unzipper` are replaced
  by the internal `src/anki/zip.ts` (`readZipEntries`, `buildZip` with
  per-entry store/deflate control, matching Anki's packaging). fflate's async
  APIs spawn workers from strings, which strict CSP rejects — hence sync.
  fflate has no Zip64: packages over 4 GiB or 65535 entries are rejected with
  a clear message. `@zip.js/zip.js` is the upgrade path if real decks hit
  that limit. `createSelectiveZip` is removed from the public API.
- **Hashing without `node:crypto`**: a dependency-free pure-TS SHA-1
  (`src/anki/sha1.ts`) serves the synchronous `fieldChecksum` path; media
  checksums use `crypto.subtle.digest("SHA-1")` (portable Node + browser)
  with the pure-TS implementation as fallback for non-secure contexts.
  Base64 for native blobs uses `btoa`/`atob` (`src/anki/base64.ts`) instead
  of `Buffer`.
- **Pluggable media storage**: a `MediaStorage` interface (async, bytes-based)
  with an in-memory implementation (browser default) and a Node fs/temp-dir
  implementation (Node default, preserving disk-backed staging for large
  decks). Callers can supply their own (e.g. OPFS-backed) implementation.
- **Platform modules via conditional exports**: the only per-platform code
  (zstd, default storage factory) lives behind an internal `#platform`
  alias with `src/platform/node.ts` and `src/platform/browser.ts`
  implementations. Two bundles are published; the package.json `exports`
  map selects `node` vs `default`. Details of the zstd split are in
  ADR-0019 (amending ADR-0014).
- **sql.js wasm wiring**: `configureSqlJs({ locateFile, wasmBinary })` lets
  browser consumers point sql.js at its wasm asset; Node needs no
  configuration. sql.js initialization is memoized in one place.

Option 2 was rejected to keep a single API shape everywhere; option 3 because
runtime detection muddies types and bundling; option 4 because two APIs would
have to be maintained and documented forever.

### Consequences

- Good, because the same code and API run in Node, Bun, Deno, browsers,
  Tauri, and Capacitor.
- Good, because media staging keeps its disk-backed behavior on Node by
  default while browsers work fully in memory.
- Bad, because this is a breaking change for every existing caller (paths →
  bytes); the release stays on 0.x with the migration documented in the
  changelog rather than triggering a 1.0.0.
- Bad, because whole packages now pass through memory as `Uint8Array` even in
  Node (only stored media stays disk-staged between read and write);
  gigabyte-scale packages become memory-bound. This matches the sql.js
  constraint that already loads the whole database into memory.
- Neutral, because sql.js remains CJS and needs asset wiring in browsers;
  `@sqlite.org/sqlite-wasm` is a possible future replacement (out of scope).

### Confirmation

- The dist browser bundle is checked in CI for `node:*` imports
  (`scripts/check-browser-bundle.mjs`).
- A vitest browser-mode (Playwright/Chromium) smoke test round-trips a real
  `.apkg` through the full portable path (fflate, WASM zstd, in-memory
  storage, WebCrypto hashing).
- The existing Node test suite covers behavior parity; `tests/dist`
  compatibility checks keep running on Node, Bun, and Deno.

## More Information

- ADR-0014 (zstd via node:zlib) — amended by ADR-0019.
- ADR-0015 (modern package format) — unchanged; both container formats are
  read/written from bytes now.
- Plan and API migration map: maintainer-approved plan of 2026-07-15.
