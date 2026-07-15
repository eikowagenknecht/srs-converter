# Exporting to Anki Format

Once you either [created](../../creating/anki/README.md) or [converted into](../../converting/srs-to-anki.md) your Anki content, you can export it to .apkg files that can be used by Anki.

## Basic Export Example

```typescript
import { writeFile } from "node:fs/promises";

// Assume ankiPackage is already loaded (see Reading Guide)
const exportPath = "./my-custom-deck.apkg";
await writeFile(exportPath, await ankiPackage.toAnkiExport());
console.log(`✅ Created Anki package: ${exportPath}`);
```

> 📋 **Test:** This example is tested in [`anki/README.test.ts`](README.test.ts) - "should export an Anki package to file"

`toAnkiExport()` returns the package as a `Uint8Array`, so you write it out yourself — here with `writeFile` in Node, or in the browser by turning the bytes into a `Blob` and triggering a download.

That's it. You can now import the file into your Anki application.

## Choosing the Package Format

By default, exports use Anki's modern package format (the same one current
Anki versions produce). If the file needs to be imported by very old Anki
versions (before 2.1.50), request the legacy format instead — this mirrors
Anki's own "Support older Anki versions" export checkbox:

```typescript
await writeFile("./my-custom-deck.apkg", await ankiPackage.toAnkiExport({ legacy: true }));
```
