# srs-converter - Development Stories

> [!important]
> This document is a work in progress and may be incomplete or inaccurate.
> AI was involved in the initial drafting of this document, so there may be errors or inconsistencies.
>
> We will thoroughly review and update this document before implementing stories.

## Overview

This document outlines the current development roadmap for the srs-converter library, from completing format-specific I/O implementations through universal format design and cross-format conversion capabilities.

## Story Status Legend

- ⏳ Pending - Not started
- 🔄 In Progress - Currently being worked on
- ✅ Completed - Implemented and verified
- 🧪 Testing - Implementation complete, awaiting verification

## Phase Progress & Success Criteria

### [Phase 1: Anki Format I/O](phase-1.md)

Complete Anki reading and writing implementation with all features and edge cases.

- **Phase 1.0**: Anki Reading (.apkg/.colpkg)
  - Progress: 9/10 stories completed (90%) 🔄
  - Status: Anki reading mostly works, with all major note types supported. Stories 1.0.5.1-1.0.5.5 (ZIP validation, missing files, SQLite corruption, JSON validation, partial recovery) completed. Story 1.0.6 rescoped 2026-07-11 to Legacy 1 reading (version detection and modern schema moved to Phase 1.3).

- **Phase 1.1**: Anki Writing (.apkg/.colpkg) + Media File APIs
  - Progress: 11/11 stories completed (100%) ✅
  - Status: Complete! Core writing, media file APIs (including unreferenced media cleanup), plugin data preservation (including SRS round-trips), and plugin data documentation all implemented.

- **Phase 1.2**: Anki Testing and Edge Cases
  - Progress: 2/5 stories completed (40%) 🔄
  - Status: Round-trip tests and ID preservation complete, need comprehensive coverage

- **Phase 1.3**: Modern Anki Support (Package v3 / Schema 18)
  - Progress: 0/11 completed, 11/11 implemented (🧪 awaiting maintainer verification)
  - Status: Implemented 2026-07-11 on the `worktree-anki-modern-schema` branch. Reads and writes Anki's current export format; modern is the default output (breaking, major release); all four round-trip directions verified against real Anki in CI.

**[→ View Phase 1 Stories](phase-1.md)**

---

### [Phase 2: Mnemosyne Format I/O](phase-2.md)

Implement reading and writing support for Mnemosyne format.

- **Phase 2.0**: Mnemosyne Reading
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 2.1**: Mnemosyne Writing
  - Progress: 0/4 stories completed (0%) ⏳

**[→ View Phase 2 Stories](phase-2.md)**

---

### [Phase 3: Mochi Format I/O](phase-3.md)

Implement reading and writing support for Mochi format.

- **Phase 3.0**: Mochi Reading
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 3.1**: Mochi Writing
  - Progress: 0/4 stories completed (0%) ⏳

**[→ View Phase 3 Stories](phase-3.md)**

---

### [Phase 4: SuperMemo Format I/O](phase-4.md)

Implement reading and writing support for SuperMemo format.

- **Phase 4.0**: SuperMemo Reading
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 4.1**: SuperMemo Writing
  - Progress: 0/4 stories completed (0%) ⏳

**[→ View Phase 4 Stories](phase-4.md)**

---

### [Phase 5: Universal Format Design](phase-5.md)

Design and document the universal SRS format specification.

- **Phase 5.0**: Universal Format Specification
  - Progress: 1/5 stories completed (20%) 🔄
  - Status: Story 5.0.1 completed 2026-07-10 (`docs/formats/`). All design decisions made as ADR-0004…0012. Story 5.0.2 strategic decision made (ADR-0007, validation pending). Story 5.0.5 spec draft complete, in review (`docs/spec/`). Phase 5 was pulled forward with maintainer approval; remaining: 5.0.3/5.0.4 implementation alignment.

**[→ View Phase 5 Stories](phase-5.md)**

---

### [Phase 6: Conversion Layer Implementation](phase-6.md)

Implement cross-format conversion capabilities.

- **Phase 6.0**: Format Conversion Implementation
  - Progress: 0/5 stories completed (0%) ⏳

**[→ View Phase 6 Stories](phase-6.md)**

---

### [Phase 7: Browser Portability](phase-7.md)

Make the library usable in browsers, Tauri, and Capacitor while keeping full Node support (ADR-0018, ADR-0019).

- **Phase 7.0**: Browser-Portable Core
  - Progress: 0/4 completed, 4/4 implemented (🧪 awaiting maintainer verification)
  - Status: Implemented 2026-07-15 on the `worktree-browser-portability` branch. Bytes-only API (breaking, stays 0.x), pluggable media storage, per-platform zstd, two published bundles, real-browser CI smoke test.

**[→ View Phase 7 Stories](phase-7.md)**

---

## Development Notes

### Library Design Principles

- **Layered Architecture**: Clear separation between format-specific I/O and universal conversion
- **Format Fidelity**: Preserve all format-specific features and data
- **Error Handling**: Use tri-state error pattern for robust error reporting
- **Performance**: Efficient handling of large datasets
- **Extensibility**: Design for easy addition of new formats

### Story Guidelines

- Stories may have dependencies but should be independently testable
- Each story includes comprehensive acceptance criteria
- Complex features are broken down across multiple stories

### Testing Strategy

- **Format I/O Stories**: Unit testing with real SRS files + round-trip testing
- **Conversion Stories**: Cross-format testing + data integrity validation
- **Performance Stories**: Benchmark testing with large datasets
- **Integration Stories**: End-to-end testing with actual SRS applications

---

## Quick Navigation

- [Phase 1: Anki Format I/O](phase-1.md) 🔄
- [Phase 2: Mnemosyne Format I/O](phase-2.md) ⏳
- [Phase 3: Mochi Format I/O](phase-3.md) ⏳
- [Phase 4: SuperMemo Format I/O](phase-4.md) ⏳
- [Phase 5: Universal Format Design](phase-5.md) 🔄
- [Phase 6: Conversion Layer Implementation](phase-6.md) ⏳
- [Phase 7: Browser Portability](phase-7.md) 🧪
