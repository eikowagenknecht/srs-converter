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

### `/src/anki/`

Anki format support module:

#### `anki-package.ts`

- `AnkiPackage` class - Main interface for Anki data
- Static factories: `fromAnkiExport()`, `fromSrsPackage()`, `fromDefault()`
- Export method: `toAnkiExport()`
- Conversion method: `toSrsPackage()`

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
.apkg file → unzip → SQLite DB + media → AnkiDatabase → AnkiPackage → SrsPackage
```

1. **File Extraction**: Unzip .apkg/.colpkg to temporary directory
2. **Database Parsing**: Load SQLite database using sql.js
3. **Data Validation**: Validate schema and data integrity
4. **Object Creation**: Create AnkiPackage instance with validated data
5. **Format Conversion**: Transform to universal SRS format

### Writing Anki Files

```plaintext
SrsPackage → AnkiPackage → SQLite DB + media → zip → .apkg file
```

1. **Data Transformation**: Convert from universal format to Anki structures
2. **Database Creation**: Build SQLite database with proper schema
3. **File Assembly**: Create temporary directory with database and media
4. **Archive Creation**: Zip contents to create .apkg file

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
- **Code Quality**: ESLint, Biome, and Prettier
- **Git Hooks**: lefthook for automated quality checks
- **Build System**: TypeScript compiler (tsc)

### Runtime Dependencies

The library uses 7 carefully selected runtime dependencies:

| Dependency | Version | Purpose |
|------------|---------|---------|
| **`sql.js`** | 1.13.0 | SQLite database engine compiled to JavaScript for reading Anki databases |
| **`kysely`** | 0.28.5 | Type-safe SQL query builder for database operations |
| **`kysely-wasm`** | 1.2.1 | WASM support for Kysely to work with sql.js |
| **`unzipper`** | 0.12.3 | Extract contents from Anki .apkg/.colpkg archive files |
| **`archiver`** | 7.0.1 | Create zip archives (used for testing and potential export features) |
| **`protobufjs`** | 7.5.3 | Parse Protocol Buffer data used in some Anki formats |
| **`uuid`** | 11.1.0 | Generate unique identifiers for SRS components |

All dependencies are well-maintained, widely-used libraries in the JavaScript ecosystem.

### Development Dependencies

Key development tools for maintaining code quality:

- **`vitest`**: Fast unit testing with TypeScript support
- **`typescript`**: Type checking and compilation
- **`@biomejs/biome`**: Fast linting and code formatting
- **`eslint`**: Additional linting rules and plugin support
- **`prettier`**: Code formatting standardization
- **`lefthook`**: Git hooks management for automated quality checks

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

### Browser Compatibility

- Replace Node.js filesystem APIs with File API
- Bundle optimization for different environments
- Web Worker support for large conversions

## Security Considerations

- Input validation for all external data
- Temporary file cleanup
- SQL injection prevention through parameterized queries
