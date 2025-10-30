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
  - Progress: 4/6 stories completed (67%) 🔄
  - Status: Anki reading mostly works, with all major note types supported. Still need schema version support and corrupted file handling.

- **Phase 1.1**: Anki Writing (.apkg/.colpkg) + Media File APIs
  - Progress: 7/9 stories completed (78%) 🔄
  - Status: Core writing, media file retrieval, media file addition, and media file removal APIs complete. Still need: plugin data documentation and unreferenced media cleanup API

- **Phase 1.2**: Anki Testing and Edge Cases
  - Progress: 2/5 stories completed (40%) 🔄
  - Status: Round-trip tests and ID preservation complete, need comprehensive coverage

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
  - Progress: 0/5 stories completed (0%) ⏳

**[→ View Phase 5 Stories](phase-5.md)**

---

### [Phase 6: Conversion Layer Implementation](phase-6.md)

Implement cross-format conversion capabilities.

- **Phase 6.0**: Format Conversion Implementation
  - Progress: 0/5 stories completed (0%) ⏳

**[→ View Phase 6 Stories](phase-6.md)**

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
- [Phase 5: Universal Format Design](phase-5.md) ⏳
- [Phase 6: Conversion Layer Implementation](phase-6.md) ⏳
