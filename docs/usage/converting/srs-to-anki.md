# Converting Universal SRS Format to Anki Packages

This guide covers converting SRS packages to Anki format for export as `.apkg` files.

## Workflow

The workflow is usually as follows:

1. Create an `SrsPackage` with your data (see **[Creating Guide](../creating/anki/README.md)**).
2. Convert to Anki format (**this guide**).
3. Export the Anki package to a file (see **[Exporting Guide](../exporting/anki/README.md)**).

## Examples

### Basic Conversion

```typescript
import { AnkiPackage } from "srs-converter";

// Assume srsPackage is already created (see Writing Guide)
const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);

switch (ankiResult.status) {
  case "success":
    console.log("✅ Conversion successful!");
    await ankiResult.data.exportToAnkiFile("./output.apkg");
    break;

  case "partial":
    console.warn("⚠️ Conversion completed with issues:");
    ankiResult.issues.forEach((issue) => {
      console.warn(`${issue.severity}: ${issue.message}`);
    });
    // Still usable, but might miss some data
    await ankiResult.data.exportToAnkiFile("./output-partial.apkg");
    break;

  case "failure":
    console.error("❌ Conversion failed:");
    ankiResult.issues.forEach((issue) => {
      console.error(`ERROR: ${issue.message}`);
    });
    break;
}
```

> 📋 **Test:** The success case of this example is tested in [`srs-to-anki.test.ts`](srs-to-anki.test.ts) - "should convert SRS package to Anki format with result handling and file export"

### Strict Mode

```typescript
import { AnkiPackage } from "srs-converter";

// When using strict mode, the conversion will fail on any issues.
// There can be no "partial" status as a result.
const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage, {
  errorHandling: "strict",
});

switch (ankiResult.status) {
  case "success":
    console.log("✅ Conversion successful!");
    await ankiResult.data.exportToAnkiFile("./output.apkg");
    break;

  case "failure":
    console.error("❌ Conversion failed:");
    ankiResult.issues.forEach((issue) => {
      console.error(`ERROR: ${issue.message}`);
    });
    break;
}
```

> 📋 **Test:** The success case of this example is tested in [`srs-to-anki.test.ts`](srs-to-anki.test.ts) - "should convert SRS to Anki in strict mode with no partial results"

## Plugin Data Restoration

When converting from SRS to Anki format, plugin-specific data stored in `applicationSpecificData.ankiData` is automatically restored to the `data` field in notes and cards. This enables full round-trip preservation of Anki add-on data.

```typescript
import { AnkiPackage, createNote, SrsPackage } from "srs-converter";

// Create an SRS package with plugin data in applicationSpecificData
const srsPackage = new SrsPackage();

// ... add decks, note types, etc ...

// Create a note with plugin data
const noteWithPlugin = createNote(
  {
    noteTypeId: "note-type-id",
    deckId: "deck-id",
    fieldValues: [
      ["Front", "Question"],
      ["Back", "Answer"],
    ],
    applicationSpecificData: {
      ankiData: JSON.stringify({
        pluginName: "my-addon",
        customData: "value",
      }),
    },
  },
  noteType,
);

srsPackage.addNote(noteWithPlugin);

// Convert to Anki - plugin data is restored to the data field
const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
const ankiPackage = ankiResult.data;

// Plugin data is now in the data field, ready for Anki add-ons
const notes = ankiPackage.getNotes();
for (const note of notes) {
  console.log("Restored plugin data:", note.data);
  // Output: {"pluginName":"my-addon","customData":"value"}
}
```

For more information on plugin data handling, see the [Reading Anki Packages Guide](../reading/anki/README.md#plugin-data-handling).
