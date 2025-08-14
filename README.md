# srs-converter

A TypeScript library for converting between different spaced repetition system (SRS) formats.

## Features

- **Anki Support**: Convert `.apkg` and `.colpkg` packages to a universal SRS format
- **Complete Data**: Support for notes, cards, decks, and review history
- **Node.js Only**: Currently requires Node.js (browser support planned for future releases)
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Robust validation and tri-state error reporting
- **Well-Tested Dependencies**: Uses established libraries for SQLite parsing, archive handling, and data processing
- **Extensible**: Architecture designed to support additional SRS formats in the future

### Universal SRS Format

The library aims to at some point convert Anki data between several formats with as little data loss as possible. It will also define a universal SRS format in the process with:

- Normalized data structures
- Consistent field naming
- Comprehensive type definitions
- Referential integrity between components
- Extensible architecture for future format support

A RFC-style format description will be provided.

## Installation

**Note**: This package is not yet published to npm.

For development or testing, you can install it locally:

```bash
# Clone the repository
git clone <repository-url>
cd srs-converter

# Install dependencies
pnpm install

# Build the package
pnpm build
```

Once published, it will be available as:

```bash
pnpm install srs-converter
```

## Platform Compatibility

- **Node.js**: Full support (v22+ recommended)
- **Bun** / **Deno**: Not tested
- **Browser**: Not currently supported (uses Node.js-specific filesystem APIs)

**Note**: Browser support is planned for future releases by abstracting file system operations.

## Usage

### Basic: Loading an Anki Package

Load and inspect an Anki deck file without converting it to the universal format.

**Input**: Anki package file (`.apkg` or `.colpkg`)  
**Output**: `AnkiPackage` object with access to raw Anki data

```typescript
import { AnkiPackage } from 'srs-converter';

// Load an Anki .apkg/.colpkg file
const result = await AnkiPackage.fromAnkiExport('./path/to/deck.apkg');

if (result.success) {
  const ankiPackage = result.data;
  
  // Access raw Anki data directly
  console.log('Anki package loaded successfully');
  
  // Inspect the loaded content
  const decks = ankiPackage.getDecks();
  const notes = ankiPackage.getNotes();
  const cards = ankiPackage.getCards();
  const noteTypes = ankiPackage.getNoteTypes();
  const reviews = ankiPackage.getReviews();
  
  console.log(`Found ${decks.length} decks`);
  console.log(`Found ${notes.length} notes`);
  console.log(`Found ${cards.length} cards`);
  console.log(`Found ${noteTypes.length} note types`);
  console.log(`Found ${reviews.length} reviews`);
  
  // Access configuration
  const config = ankiPackage.getConfig();
  console.log('Anki collection config:', config);
  
} else {
  console.error('Failed to load Anki file:', result.issues);
}
```

### Advanced: Converting to Universal SRS Format

Building on the basic example, convert the loaded `AnkiPackage` to a universal SRS format for cross-platform processing.

**Input**: `AnkiPackage` object (from basic example above)  
**Output**: Structured `SrsPackage` with normalized data accessible via TypeScript APIs

```typescript
// Continuing from the basic example above...
// Assume we have a successfully loaded `ankiPackage`

// Convert to universal SRS format
const srsResult = ankiPackage.toSrsPackage();

if (srsResult.success) {
  const srsPackage = srsResult.data;
  
  // Access the normalized data
  console.log(`Converted ${srsPackage.getDecks().length} decks`);
  console.log(`Converted ${srsPackage.getNotes().length} notes`);
  console.log(`Converted ${srsPackage.getCards().length} cards`);
  
  // Work with normalized deck data
  for (const deck of srsPackage.getDecks()) {
    console.log(`Deck: ${deck.name} (ID: ${deck.id})`);
  }
  
  // The SrsPackage provides a standardized API
  // that works the same regardless of the original format
  
} else {
  console.error('Conversion failed:', srsResult.issues);
}
```

## Error Handling

The library uses a tri-state result pattern that distinguishes between complete success, partial success, and total failure:

```typescript
interface ConversionResult<T> {
  status: "success" | "partial" | "failure";
  data?: T;
  issues: ConversionIssue[];
}

interface ConversionIssue {
  severity: "critical" | "error" | "warning";
  message: string;
  context?: {
    itemType?: "card" | "note" | "review" | "deck";
    originalData?: unknown;
  };
}
```

### Handling Different Result Types

```typescript
const result = await AnkiPackage.fromAnkiExport('./deck.apkg');

switch (result.status) {
  case "success":
    // Everything worked perfectly
    console.log("✅ File loaded successfully!");
    if (result.data) {
      const ankiPackage = result.data;
      // Use ankiPackage...
    }
    break;
    
  case "partial":
    // Some issues occurred, but we got usable data
    console.log("⚠️ File loaded with issues:");
    result.issues.forEach(issue => {
      console.log(`${issue.severity}: ${issue.message}`);
    });
    if (result.data) {
      const partialData = result.data; // Still usable
      // Use partialData...
    }
    break;
    
  case "failure":
    // Critical errors prevented loading
    console.log("❌ Failed to load file:");
    result.issues.forEach(issue => {
      if (issue.severity === "critical") {
        console.log(`CRITICAL: ${issue.message}`);
      }
    });
    // result.data is undefined
    break;
}
```

### Error Handling Options

Control how strictly the library handles errors:

```typescript
const options = {
  errorHandling: "strict" as const  // Fail fast on any error
  // or
  errorHandling: "best-effort" as const  // Try to recover and continue
};

const result = await AnkiPackage.fromAnkiExport('./deck.apkg', options);
```

- **`strict`**: Any error stops processing and returns failure (status will be "failure")
- **`best-effort`**: Skip problematic items and continue processing (status can be "partial")

### How Error Modes Affect Results

**Best-effort mode (default):**

```typescript
// A deck with some corrupted cards might still load partially
const result = await AnkiPackage.fromAnkiExport('./partly-corrupt.apkg');
// result.status could be "partial" - you get usable data despite some issues
```

**Strict mode:**

```typescript
const result = await AnkiPackage.fromAnkiExport('./partly-corrupt.apkg', { 
  errorHandling: "strict" 
});
// result.status will be "failure" - any error prevents loading
// result.data will be undefined
```

**When to use strict mode:**

- Critical applications where data integrity is paramount
- When you need guarantees that all data loaded successfully

**When to use best-effort mode:**

- Interactive applications where partial data is still useful
- Migration scenarios where some data loss is acceptable
- Exploratory data analysis where you want to see what you can recover

## Current State

### Format Support Matrix

| Feature | Anki | Mnemosyne | SuperMemo | Mochi | Custom Formats |
|---------|------|-----------|-----------|-------|----------------|
| **Read Support** | ✅ Good | ❌ Planned | ❌ Planned | ❌ Planned | ❌ Planned |
| **Write Support** | ⚠️ Basic | ❌ Planned | ❌ Planned | ❌ Planned | ❌ Planned |
| **File Types** | `.apkg`, `.colpkg` | - | - | - | - |
| **Database Schema** | Legacy v2 | - | - | - | - |

### Anki Format Details

For detailed technical information about the Anki package format, see: [Understanding the Anki .apkg Format (Legacy 2)](https://eikowagenknecht.de/posts/understanding-the-anki-apkg-format-legacy-2/)

| Component | Support Level | Notes |
|-----------|---------------|-------|
| **Decks** | ✅ Full | Name, description, configuration, hierarchy |
| **Note Types** | ✅ Full | Fields, templates, CSS styling, configuration |
| **Notes** | ✅ Full | Content in all fields, tags, modification timestamps |
| **Cards** | ✅ Full | Question/answer templates, due dates, intervals, ease factors |
| **Review History** | ✅ Full | Complete review logs with timestamps and scores |
| **Media Files** | ✅ Full | References and mappings |
| **Formats** | ⚠️ Partial | Only Legacy v2 is supported for now |
| **Plugin Data** | ❌ No | Plugin-specific data may be ignored |
| **Conversion Quality** | ⚠️ Basic | Converting to other formats may result in loss of some data (e.g. formatting, media attachments) |

## Tech Stack

Built with TypeScript and modern tooling. For detailed information about the technology stack, dependencies, and architectural decisions, see the [Architecture Documentation](docs/README.architecture.md).

## Maintainer

This project is maintained by Eiko Wagenknecht.

## Development Documentation

For detailed development information:

- [Architecture Overview](docs/README.architecture.md) - System design and technical decisions
- [Decision Records](docs/decisions/README.md) - Architectural decisions and their rationale
- [Development Commands](docs/README.commands.md) - Package management and build commands
- [Testing Guidelines](docs/README.testing.md) - Testing setup and best practices  
- [Setup Guide](docs/README.setup.md) - Environment setup and prerequisites
- [Git Workflow](docs/README.git.md) - Branching and commit conventions

## License

AGPL-3.0-or-later
