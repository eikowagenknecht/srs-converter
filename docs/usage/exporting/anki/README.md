# Exporting to Anki Format

Once you either [created](../../creating/anki/README.md) or [converted into](../../converting/srs-to-anki.md) your Anki content, you can export it to .apkg files that can be used by Anki.

## Basic Export Example

```typescript
// Assume ankiPackage is already loaded (see Reading Guide)
const exportPath = "./my-custom-deck.apkg";
await ankiPackage.toAnkiExport(exportPath);
console.log(`✅ Created Anki package: ${exportPath}`);
```

> 📋 **Test:** This example is tested in [`anki/README.test.ts`](README.test.ts) - "should export an Anki package to file"

That's it. You can now import the file into your Anki application.

## Choosing the Package Format

By default, exports use Anki's modern package format (the same one current
Anki versions produce). If the file needs to be imported by very old Anki
versions (before 2.1.50), request the legacy format instead — this mirrors
Anki's own "Support older Anki versions" export checkbox:

```typescript
await ankiPackage.toAnkiExport("./my-custom-deck.apkg", { legacy: true });
```
