# Architecture

This document describes the architecture and design decisions of the srs-converter library.

## Overview

The srs-converter library is designed as a bidirectional converter between different SRS (Spaced Repetition System) formats. It follows a layered architecture with clear separation of concerns.

```plaintext
┌─────────────────────────────────────┐
│          Public API Layer          │
│   (AnkiPackage, SrsPackage, etc)   │
├─────────────────────────────────────┤
│       Universal SRS Format         │
│    (SrsDeck, SrsNote, SrsCard)     │
├─────────────────────────────────────┤
│      Format-Specific Layers        │
│  ┌─────────────┐ ┌─────────────┐   │
│  │    Anki     │ │   Future    │   │
│  │   Module    │ │  Formats    │   │
│  └─────────────┘ └─────────────┘   │
├─────────────────────────────────────┤
│      Core Infrastructure           │
│  (Error Handling, Type System)     │
└─────────────────────────────────────┘
```

## Core Principles

### 1. Extensible Design

- Each SRS format is implemented as a separate module
- New formats can be added without modifying existing code
- Universal SRS format acts as the common interchange layer

### 2. Type Safety

- Full TypeScript support with comprehensive type definitions
- Runtime validation where necessary
- Clear interfaces between modules

### 3. Error Resilience

- Tri-state result pattern for comprehensive error handling
- Configurable error tolerance (strict vs best-effort modes)
- Rich error context for debugging

### 4. Data Integrity

- Referential integrity maintained in universal format
- Immutable data structures where possible
- Defensive copying to prevent mutations

## Module Structure

### `/src/index.ts`

Main entry point that exports all public APIs. Provides a clean interface for consumers.

### `/src/error-handling.ts`

Central error handling system with:

- `ConversionResult<T>` - Tri-state result pattern
- `ConversionIssue` - Rich error information with context
- `IssueCollector` - Centralized error aggregation
- `ConversionOptions` - Configuration for error handling behavior

### `/src/srs-package.ts`

Universal SRS format implementation:

- `SrsPackage` - Root container for all SRS data
- `SrsDeck`, `SrsNote`, `SrsCard`, `SrsReview` - Core data types
- Factory functions for creating instances
- Referential integrity validation
- Media management mirroring `AnkiPackage`: `addMediaFile()`, `getMediaFile()`, `getMediaFileSize()`, `listMediaFiles()`, `removeMediaFile()`, and `cleanup()`. Media content is `Uint8Array`-based and lives in a `MediaStorage` backend owned by the package (disk-backed temp directory on Node, in-memory in browsers; ADR-0018); conversions copy content across, so source and target packages have independent lifetimes and each owner must call `cleanup()`.
- Package-level `applicationSpecificData` (`getApplicationSpecificData()` / `setApplicationSpecificData()`) for collection-scoped metadata that has no per-entity home (e.g. the Anki `col`/`dconf`/`graves` blobs captured for round-trip restoration)

### `/src/anki/`

Anki format support module:

#### `anki-package.ts`

- `AnkiPackage` class - Main interface for Anki data
- Static factories: `fromAnkiExport()` (takes the `.apkg` bytes as `Uint8Array`), `fromSrsPackage()`, `fromDefault()` — all accept `AnkiPackageOptions` (error handling + optional `storage` backend)
- Export method: `toAnkiExport()` — returns the `.apkg` bytes as `Uint8Array`
- Conversion method: `toSrsPackage()` (async — it copies media into the new `SrsPackage`)

#### `database.ts`

- `AnkiDatabase` class - SQLite database operations
- SQL query execution with type safety via Kysely
- Database schema validation

#### `types.ts`

- Complete TypeScript definitions for Anki data structures
- Database table interfaces
- Enums for Anki constants

#### `constants.ts`

- Default values and configurations
- Database schema definitions
- Template data for creating new packages

#### `util.ts`

- Utility functions for Anki-specific operations
- GUID generation, timestamp extraction
- Field manipulation helpers

## Data Flow

### Reading Anki Files

```plaintext
.apkg bytes → unzip (in memory) → SQLite DB + media → AnkiDatabase → AnkiPackage → SrsPackage
```

1. **Entry Extraction**: Read the ZIP entries from the passed bytes (fflate, in memory)
2. **Database Parsing**: Load SQLite database using sql.js
3. **Data Validation**: Validate schema and data integrity
4. **Media Staging**: Store media content in the package's `MediaStorage` backend
5. **Object Creation**: Create AnkiPackage instance with validated data
6. **Format Conversion**: Transform to universal SRS format

### Writing Anki Files

```plaintext
SrsPackage → AnkiPackage → SQLite DB + media → zip (in memory) → .apkg bytes
```

1. **Data Transformation**: Convert from universal format to Anki structures
2. **Database Creation**: Build SQLite database with proper schema
3. **Archive Assembly**: Stream database and media entries into the ZIP (media is read from storage one file at a time)
4. **Result**: `toAnkiExport()` returns the `.apkg` bytes; writing them to disk (or elsewhere) is the caller's job

## Error Handling Architecture

### Tri-State Results

All operations return `ConversionResult<T>` with three possible states:

- **success**: Operation completed without issues
- **partial**: Operation completed with recoverable issues
- **failure**: Operation failed with critical errors

### Error Context

Issues include rich context information:

- `severity`: "critical" | "error" | "warning"
- `message`: Human-readable description
- `context`: Additional debugging information
  - `itemType`: Which data type had the issue
  - `originalData`: Raw data that caused the problem

### Configurable Tolerance

- **strict mode**: Any error causes immediate failure
- **best-effort mode**: Skip problematic items and continue

## Type System Architecture

### Universal Format Types

The universal format uses normalized, platform-agnostic types:

```typescript
interface SrsDeck {
  id: string;
  name: string;
  description?: string;
  configuration: Record<string, unknown>;
}

interface SrsNote {
  id: string;
  noteTypeId: string;
  deckId: string;
  fields: Record<string, string>;
  tags: string[];
  created: Date;
  modified: Date;
}
```

### Format-Specific Types

Each format module defines its own types that map to the original format's data structures:

```typescript
// Anki-specific types
interface NotesTable {
  id: number;
  guid: string;
  mid: number;
  mod: number;
  usn: number;
  tags: string;
  flds: string;
  sfld: string;
  csum: number;
  flags: number;
  data: string;
}
```

## Tech Stack & Dependencies

### Core Technology Stack

This project is built with **TypeScript** and follows modern Node.js development practices:

- **Language**: TypeScript with strict type checking
- **Package Manager**: pnpm (performant, space-efficient)
- **Testing Framework**: Vitest (fast, modern testing)
- **Code Quality**: oxlint, oxfmt for linting and formatting
- **Git Hooks**: lefthook for automated quality checks
- **Build System**: TypeScript compiler (tsc)

### Runtime Dependencies

The library uses carefully selected runtime dependencies:

- **`sql.js`**: SQLite database engine compiled to WebAssembly for reading Anki databases
- **`kysely`**: Type-safe SQL query builder for database operations
- **`kysely-wasm`**: WASM support for Kysely to work with sql.js
- **`fflate`**: Read and write the .apkg/.colpkg ZIP containers, fully in memory (ADR-0018)
- **`@hpcc-js/wasm-zstd`**: zstd compression for the browser build; Node uses native `node:zlib` zstd instead (ADR-0019)
- **`uuid`**: Generate unique identifiers for SRS components

All dependencies are well-maintained, widely-used libraries in the JavaScript ecosystem, and all of them run in browsers as well as in Node/Bun/Deno.

### Platform Portability (ADR-0018)

The public API is bytes-based (`Uint8Array` in/out); file I/O belongs to the caller. The only per-platform code — zstd and the default `MediaStorage` — lives behind the internal `#platform` module with a Node and a browser implementation. Two bundles are published and selected via package.json `exports` conditions (`node` → native zstd + disk-backed media staging, `default` → WASM zstd + in-memory staging). Checksums use a pure-TS SHA-1 for the synchronous field checksum and WebCrypto for media digests. Browser consumers configure the sql.js wasm asset once via `configureSqlJs()`.

### Development Dependencies

Key development tools for maintaining code quality:

- **`vitest`**: Fast unit testing with TypeScript support
- **`typescript`**: Type checking and compilation
- **`oxfmt`**: Fast code formatting
- **`oxlint`**: Fast linting rules and plugin support
- **`lefthook`**: Git hooks management for automated quality checks

## Development Roadmap

The library development follows a structured approach documented in [Development Stories](stories/README.md). The roadmap is organized into phases:

### Phase 1: Complete Anki Format Support

- Complete Anki reading with all features and 100% test coverage
- Implement comprehensive Anki writing capabilities
- Handle all Anki note types (Basic, Cloze, Image Occlusion)

### Phase 2-4: Additional Format Support

- Mnemosyne format I/O implementation
- Mochi format I/O implementation
- SuperMemo format I/O implementation
- Each format gets at least reading support and writing support if feasible

### Phase 5-6: Universal Format and Conversion

- Finalize universal SRS format based on multi-format analysis
- Implement conversion layer between all supported formats
- Cross-format conversion testing and quality metrics

## Future Architecture Considerations

### Adding New Formats

1. Create new module in `/src/[format]/`
2. Implement format-specific types and parsing
3. Add conversion to/from universal format
4. Update public API exports

### Performance Optimizations

- Stream processing for large files
- Lazy loading of media files
- Incremental conversion for large datasets
- Web Worker support for large conversions in browsers

## Security Considerations

- Input validation for all external data
- Temporary file cleanup (Node media staging)
- SQL injection prevention through parameterized queries
