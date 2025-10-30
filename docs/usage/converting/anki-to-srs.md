# Converting Anki Packages to Universal SRS Format

This guide covers converting loaded Anki packages to the universal SRS format for cross-platform processing and data normalization.

## Workflow

The workflow is usually as follows:

1. Load the Anki package (see **[Reading Guide](../reading/anki/README.md)**).
2. Convert to SRS format (**this guide**).
3. Use the data in your application.

## Examples

### Basic Conversion

```typescript
// Assume ankiPackage is already loaded (see Reading Guide)
const srsResult = ankiPackage.toSrsPackage();

switch (srsResult.status) {
  case "success": {
    console.log("✅ Conversion completed successfully!");
    const srsPackage = srsResult.data;
    break;
  }

  case "partial": {
    console.log("⚠️ Conversion completed with issues:");
    srsResult.issues.forEach((issue) => {
      console.log(`${issue.severity}: ${issue.message}`);
    });
    // Still usable, but might miss some data
    const partialData = srsResult.data;
    break;
  }

  case "failure": {
    console.log("❌ Conversion failed:");
    srsResult.issues.forEach((issue) => {
      console.log(`CRITICAL: ${issue.message}`);
    });
    break;
  }
}
```

> 📋 **Test:** The success case of this example is tested in [`anki-to-srs.test.ts`](anki-to-srs.test.ts) - "should convert Anki package to SRS format with comprehensive error handling"

### Strict Mode

```typescript
// When using strict mode, the conversion will fail on any issues.
// There can be no "partial" status as a result.
const srsResult = ankiPackage.toSrsPackage({ errorHandling: "strict" });

switch (srsResult.status) {
  case "success": {
    console.log("✅ Conversion completed successfully!");
    const srsPackage = srsResult.data;
    break;
  }

  case "failure": {
    console.log("❌ Conversion failed:");
    srsResult.issues.forEach((issue) => {
      console.log(`CRITICAL: ${issue.message}`);
    });
    break;
  }
}
```

> 📋 **Test:** The success case of this example is tested in [`anki-to-srs.test.ts`](anki-to-srs.test.ts) - "should convert Anki package to SRS with strict mode error handling"

## Working with Converted Data

Once converted to SRS format, you can modify the data using the APIs of the SRS package.

## Plugin Data Preservation

When converting from Anki to SRS format, plugin-specific data stored in the `data` field of notes and cards is automatically preserved in the `applicationSpecificData.ankiData` field so that it survives round-trip conversions (Anki → SRS → Anki).

```typescript
import { AnkiPackage } from "srs-converter";

// Load an Anki package with plugin data
const ankiResult = await AnkiPackage.fromAnkiExport("./deck-with-plugins.apkg");
const ankiPackage = ankiResult.data;

// Convert to SRS - plugin data is preserved in applicationSpecificData
const srsResult = ankiPackage.toSrsPackage();
const srsPackage = srsResult.data;

// Plugin data is now stored in applicationSpecificData.ankiData
const notes = srsPackage.getNotes();
for (const note of notes) {
  if (note.applicationSpecificData?.ankiData) {
    console.log("Note has plugin data:", note.applicationSpecificData.ankiData);
  }
}

// When converting back to Anki, plugin data is automatically restored
const reconvertedResult = await AnkiPackage.fromSrsPackage(srsPackage);
const reconvertedAnki = reconvertedResult.data;

// Original plugin data is restored to the data field
const reconvertedNotes = reconvertedAnki.getNotes();
for (const note of reconvertedNotes) {
  console.log("Restored plugin data:", note.data);
}
```

> 📋 **Test:** Plugin data preservation is tested in [`anki-to-srs.test.ts`](anki-to-srs.test.ts) - "should preserve plugin data in round-trip conversion"
