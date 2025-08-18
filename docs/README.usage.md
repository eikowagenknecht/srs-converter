# Usage Guide

This guide provides comprehensive examples for using the srs-converter library to work with SRS (Spaced Repetition System) data.

## Basic: Loading an Anki Package

Load and inspect an Anki deck file without converting it to the universal format.

**Input**: Anki package file (`.apkg` or `.colpkg`)  
**Output**: `AnkiPackage` object with access to raw Anki data

```typescript
import { AnkiPackage } from 'srs-converter';

// Load an Anki .apkg/.colpkg file
const result = await AnkiPackage.fromAnkiExport('./path/to/deck.apkg');

if (result.status === "success") {
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

## Advanced: Converting to Universal SRS Format

Building on the basic example, convert the loaded `AnkiPackage` to a universal SRS format for cross-platform processing.

**Input**: `AnkiPackage` object (from basic example above)  
**Output**: Structured `SrsPackage` with normalized data accessible via TypeScript APIs

```typescript
// Continuing from the basic example above...
// Assume we have a successfully loaded `ankiPackage`

// Convert to universal SRS format
const srsResult = ankiPackage.toSrsPackage();

if (srsResult.status === "success") {
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

The library supports two error handling modes:

- **`strict`**: Stop on first error (returns "success" or "failure" only)
- **`best-effort`** (default): Skip problematic items and continue (can return "partial")

```typescript
const result = await AnkiPackage.fromAnkiExport('./deck.apkg', {
  errorHandling: "best-effort"
});
```

All operations return a result object with status and optional issues:

```typescript
switch (result.status) {
  case "success":
    console.log("✅ File loaded successfully!");
    const ankiPackage = result.data;
    break;
    
  // This can only occur in best-effort mode
  case "partial":
    console.log("⚠️ File loaded with issues:");
    result.issues.forEach(issue => {
      console.log(`${issue.severity}: ${issue.message}`);
    });
    const partialData = result.data; // Still usable
    break;
    
  case "failure":
    console.log("❌ Failed to load file:");
    result.issues.forEach(issue => {
      console.log(`CRITICAL: ${issue.message}`);
    });
    break;
}
```
