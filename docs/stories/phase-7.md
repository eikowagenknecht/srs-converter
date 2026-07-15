# Phase 7: Browser Portability

[← Back to Stories Overview](README.md)

Make the library usable in browsers and browser-based app shells (Tauri, Capacitor) while keeping full Node support. Governed by ADR-0018 (bytes-only API, pluggable media storage, platform modules) and ADR-0019 (zstd platform split).

## Phase 7.0: Browser-Portable Core

### Story 7.0.1: Bytes-Only Core on Portable Primitives

**Status:** ✅ Completed

**Story:** As a developer, I want the public API to work on bytes (`Uint8Array`) instead of file paths and Node streams so the same code runs in any JavaScript environment.

**Acceptance Criteria:**

- ✅ `AnkiPackage.fromAnkiExport(data: Uint8Array)` replaces the path-based reader; content validation (ZIP magic, entry presence) replaces the file-extension check
- ✅ `toAnkiExport()` returns the `.apkg` bytes instead of writing a file
- ✅ Media APIs on `AnkiPackage`, `SrsPackage`, and `MediaStore` accept and return `Uint8Array` (no paths, Buffers, or Node streams)
- ✅ `archiver`/`unzipper` replaced by fflate (`src/anki/zip.ts`, sync APIs only for webview CSP compatibility); `createSelectiveZip` removed
- ✅ `node:crypto` replaced by pure-TS SHA-1 (sync field checksums) and WebCrypto with fallback (media digests); `node:buffer` replaced by `btoa`/`atob` base64 helpers
- ✅ All tests and doc examples migrated to the bytes API; dist smoke test passes on Node, Bun, and Deno

**Implementation Notes:**

- Implemented 2026-07-15 on the `worktree-browser-portability` branch (ADR-0018)
- fflate has no ZIP64: packages over 4 GiB or 65535 entries are rejected with a clear message

**Testing:**

- ✅ Automated: full suite migrated and green; SHA-1 RFC vectors + WebCrypto parity; base64 round-trips
- ✅ Manual: maintainer verified (merged 2026-07-15)

---

### Story 7.0.2: Media Storage Interface and Platform Modules

**Status:** ✅ Completed

**Story:** As a developer, I want per-platform defaults (disk staging and native zstd on Node, in-memory staging and WASM zstd in browsers) behind one portable API so no environment pays for another's constraints.

**Acceptance Criteria:**

- ✅ `MediaStorage` interface with `InMemoryMediaStorage` (portable) and `NodeFsMediaStorage` (lazily-created temp dir, preserves previous Node behavior)
- ✅ `MediaStore` is storage-backed; `AnkiPackage` unified onto it (inline temp-dir staging deleted); `storage` option on the `AnkiPackage` factories and `new SrsPackage(storage?)`
- ✅ `#platform` module (`src/platform/`) provides zstd + default storage per platform; ADR-0019 amends ADR-0014
- ✅ Two published bundles selected by `exports` conditions (`node` / `default`); package.json `main`/`types` mismatch fixed
- ✅ `configureSqlJs()` exposes sql.js wasm wiring for browsers; sql.js initialization memoized
- ✅ `scripts/check-browser-bundle.mjs` fails if the browser bundle imports Node builtins

**Implementation Notes:**

- Browser zstd: `@hpcc-js/wasm-zstd` (wasm embedded in its ESM bundle — no consumer asset wiring); fallback documented in ADR-0019
- tsconfig `paths` beat tsdown `alias`, so the browser bundle uses its own `tsconfig.browser-build.json`

**Testing:**

- ✅ Automated: storage contract tests over both implementations; zstd tested over both implementations including cross-implementation frames; browser bundle probed under Node in the dist smoke test
- ✅ Manual: maintainer verified (merged 2026-07-15)

---

### Story 7.0.3: Browser Test Harness and CI

**Status:** ✅ Completed

**Story:** As a maintainer, I want browser compatibility verified continuously so it cannot silently regress.

**Acceptance Criteria:**

- ✅ vitest split into `unit` (Node) and `browser` (Playwright Chromium, headless) projects; `pnpm test` runs both
- ✅ Real-browser smoke test round-trips a modern and a legacy `.apkg` through the full portable path (fflate, WASM zstd, in-memory storage, WebCrypto, `configureSqlJs`)
- ✅ CI installs Chromium and runs the browser-bundle check after the build

**Implementation Notes:**

- The browser project resolves `#platform` to the browser implementation, so the smoke test exercises exactly what browser consumers get

**Testing:**

- ✅ Automated: Chromium round-trip green locally; CI wiring in place
- ✅ Manual: maintainer verified (merged 2026-07-15; CI green on main)

---

### Story 7.0.4: Documentation and Release Preparation

**Status:** ✅ Completed

**Story:** As a user, I want accurate documentation for the bytes API and browser usage so I can adopt the library in any environment.

**Acceptance Criteria:**

- ✅ README: bytes-API quick start, Browser/Tauri/Capacitor section, updated platform matrix
- ✅ `docs/usage/**` examples updated (and still executable via their test files)
- ✅ Architecture doc reflects the portability design; ADR-0018/0019 recorded and indexed
- ✅ Release stays 0.x: squash commit is `feat:` (no breaking footer); migration documented

**Implementation Notes:**

- Breaking changes (paths → bytes, `createSelectiveZip` removed, extension check removed) are documented in the README and changelog rather than triggering a 1.0.0

**Testing:**

- ✅ Automated: doc example tests pass; quality gates green
- ✅ Manual: maintainer verified (merged 2026-07-15)
