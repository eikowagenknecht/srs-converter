# Reading SRS Data

This guide covers importing existing Anki packages using srs-converter.

## Basic: Importing an Anki Package

Load an Anki deck file without converting it to the universal format.

**Input**: Anki package file (`.apkg` or `.colpkg`)  
**Output**: `AnkiPackage` object with access to raw Anki data

```typescript
import { AnkiPackage } from "srs-converter";

// Load an Anki .apkg/.colpkg file
const result = await AnkiPackage.fromAnkiExport("./path/to/deck.apkg");

switch (result.status) {
  case "success":
    console.log("✅ File loaded successfully!");
    const ankiPackage = result.data;
    // ... Handle data here ...
    break;

  // This can only occur in best-effort mode (default)
  case "partial":
    console.log("⚠️ File loaded with issues:");
    result.issues.forEach((issue) => {
      console.log(`${issue.severity}: ${issue.message}`);
    });
    // Still usable, but might miss some data
    const partialData = result.data;
    // ... Handle data here ...
    break;

  case "failure":
    console.log("❌ Failed to load file:");
    result.issues.forEach((issue) => {
      console.log(`CRITICAL: ${issue.message}`);
    });
    break;
}
```

> 📋 **Test:** This example is tested in [`anki/README.test.ts`](README.test.ts) - "should load an Anki package file with comprehensive error handling"

## Complete Reading Example

Here's a complete example that loads an Anki package and extracts some information:

```typescript
import { AnkiPackage } from "srs-converter";

console.log(`Analyzing: ${filePath}`);

const result = await AnkiPackage.fromAnkiExport(filePath);

if (result.status === "failure") {
  console.error(
    "❌ Failed to load file:",
    result.issues.map((i) => i.message),
  );
  return;
}

const ankiPackage = result.data;

// Basic statistics
console.log("\n=== Package Statistics ===");
console.log(`Decks: ${ankiPackage.getDecks().length}`);
console.log(`Note Types: ${ankiPackage.getNoteTypes().length}`);
console.log(`Notes: ${ankiPackage.getNotes().length}`);
console.log(`Cards: ${ankiPackage.getCards().length}`);
console.log(`Reviews: ${ankiPackage.getReviews().length}`);

// Deck breakdown
console.log("\n=== Deck Breakdown ===");
const decks = ankiPackage.getDecks();
const cards = ankiPackage.getCards();

for (const deck of decks) {
  const deckCards = cards.filter((card) => card.did === deck.id);
  console.log(`"${deck.name}": ${deckCards.length} cards`);
}

// Note type analysis
console.log("\n=== Note Types ===");
const noteTypes = ankiPackage.getNoteTypes();
const notes = ankiPackage.getNotes();

for (const noteType of noteTypes) {
  const typeNotes = notes.filter((note) => note.mid === noteType.id);
  console.log(`"${noteType.name}": ${typeNotes.length} notes`);
  console.log(`  Fields: ${noteType.flds.map((f) => f.name).join(", ")}`);
  console.log(`  Templates: ${noteType.tmpls.map((t) => t.name).join(", ")}`);
}

console.log("\n=== Analysis Complete ===");
```

> 📋 **Test:** This example is tested in [`anki/README.test.ts`](README.test.ts) - "should analyze an Anki package comprehensively and extract statistics"

## Working with Media Files

Anki packages can contain media files (e.g., images, audio, video).
You can list and retrieve these files using the media file APIs:

```typescript
import { AnkiPackage } from "srs-converter";
import { createWriteStream } from "node:fs";

const result = await AnkiPackage.fromAnkiExport("./deck-with-media.apkg");

if (result.status === "failure") {
  console.error("Failed to load package");
  return;
}

const ankiPackage = result.data;

// List all media files in the package
const mediaFiles = ankiPackage.listMediaFiles();
console.log(`Found ${mediaFiles.length} media files`);

for (const filename of mediaFiles) {
  // Get file size
  const size = await ankiPackage.getMediaFileSize(filename);
  console.log(`${filename}: ${size} bytes`);

  // Stream the file content
  const stream = ankiPackage.getMediaFile(filename);

  // Example: Save to disk
  const writeStream = createWriteStream(`./output/${filename}`);
  stream.pipe(writeStream);

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

console.log("Media files extracted successfully");
```

The `getMediaFile()` method returns a Node.js ReadableStream for memory-efficient handling of large files.
You can pipe it to a file, process it in chunks, or convert it to a buffer.

> 📋 **Test:** This example is tested in [`anki/README.test.ts`](README.test.ts) - "should list and retrieve media files from an Anki package"

## Converting to Universal SRS Format

For information about converting loaded Anki packages to the universal SRS format for cross-platform processing, see **[→ Anki to SRS Conversion Guide](../../converting/anki-to-srs.md)**.

## See Also

See the [Creating Guide for Anki](../../creating/anki/README.md) for information on creating packages and the [Exporting Guide for Anki](../../exporting/anki/README.md) for writing packages to Anki files.
