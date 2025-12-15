# Raw Anki Methods Guide

This guide covers creating Anki packages using direct manipulation of Anki's internal structures. This approach gives you maximum flexibility and very precise control over the output but requires understanding Anki's [internal format](https://eikowagenknecht.de/posts/understanding-the-anki-apkg-format-legacy-2/).

Raw Anki methods work directly with Anki's database structures using the same field names and formats that Anki uses internally. You'll work with types like `NotesTable`, `CardsTable`, and use arcane field names like `flds`, `sfld`, `mid`, and `usn`.

For simpler use cases, consider the [SRS Package Conversion](../README.md) approach instead.

## Prerequisites

```typescript
import { AnkiPackage } from "srs-converter";
import {
  basicModel,
  basicAndReversedCardModel,
  clozeModel,
  defaultDeck,
} from "srs-converter/anki/constants";
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should import required modules for raw Anki methods"

## Basic Setup: Creating an Empty Anki Package

```typescript
// Start with a fresh Anki package
const result = await AnkiPackage.fromDefault();
const ankiPackage = result.data;
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should create an empty Anki package from default"

This comes with an empty deck called "Default".

## Decks

### Adding a Custom Deck

```typescript
const customDeck: Deck = {
  id: Date.now(),
  name: "My Custom Deck",
  desc: "A custom deck created using raw Anki methods",
  extendRev: 50,
  extendNew: 0,
  usn: 0,
  collapsed: false,
  browserCollapsed: true,
  dyn: 0, // DeckDynamicity.STATIC
  newToday: [0, 0] as [number, number],
  revToday: [0, 0] as [number, number],
  lrnToday: [0, 0] as [number, number],
  timeToday: [0, 0] as [number, number],
  conf: 1, // Configuration group ID
  reviewLimit: null,
  newLimit: null,
  reviewLimitToday: null,
  newLimitToday: null,
  mod: Math.floor(Date.now() / 1000),
};

ankiPackage.addDeck(customDeck);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should add custom deck with all required Anki deck properties"

## Note Types

### Adding Built-in Note Types

srs-converter provides constants for common Anki note types (the same note types used by a fresh Anki installation).

```typescript
// Add built-in note types
ankiPackage.addNoteType(basicModel); // Basic
ankiPackage.addNoteType(basicAndReversedCardModel); // Basic (and reversed card)
ankiPackage.addNoteType(basicOptionalReversedCardModel); // Basic (optional reversed card)
ankiPackage.addNoteType(basicTypeInTheAnswerModel); // Basic (type in the answer)
ankiPackage.addNoteType(clozeModel); // Cloze
ankiPackage.addNoteType(imageOcclusionModel); // Image Occlusion
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should add built-in note types to the package"

### Creating Custom Note Types

```typescript
const customNoteType = {
  id: 1640000000000, // Use timestamp-based ID
  name: "Custom Note Type",
  flds: [
    {
      id: null,
      name: "Question",
      ord: 0,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      tag: null,
      preventDeletion: false,
    },
    {
      id: null,
      name: "Answer",
      ord: 1,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      tag: null,
      preventDeletion: false,
    },
    {
      id: null,
      name: "Extra",
      ord: 2,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      tag: null,
      preventDeletion: false,
    },
  ],
  tmpls: [
    {
      id: null,
      name: "Card 1",
      ord: 0,
      qfmt: "<div>{{Question}}</div>",
      afmt: "{{Question}}<hr>{{Answer}}<br><br>{{Extra}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
    },
  ],
  css: `.card {
    font-family: Arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background-color: white;
  }`,
  sortf: 0, // Which field to sort by
  did: null,
  usn: 0,
  maxTaken: 60,
  tags: [],
  vers: [],
  type: 0, // 0 = standard, 1 = cloze
  mod: Math.floor(Date.now() / 1000),
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  latexsvg: false,
  req: [],
  originalStockKind: null,
};

ankiPackage.addNoteType(customNoteType);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should create custom note type with fields, templates, and CSS"

## Notes and Cards

### Basic Note Type Example

```typescript
// Helper function for unique timestamps
let nextTimestamp = Date.now();
const getUniqueTimestamp = () => ++nextTimestamp;

// Create a basic note
const basicNote: NotesTable = {
  id: getUniqueTimestamp(),
  guid: `BasicNote_${Date.now().toFixed()}`,
  mid: basicModel.id,
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  tags: "",
  flds: "What is the capital of France?\x1fParis", // Fields separated by \x1f
  sfld: "What is the capital of France?", // Sort field (first field typically)
  csum: 0,
  flags: 0,
  data: "",
};

ankiPackage.addNote(basicNote);

// Create corresponding card
const basicCard: CardsTable = {
  id: getUniqueTimestamp(),
  nid: basicNote.id, // Note ID
  did: defaultDeck.id, // Deck ID
  ord: 0, // Template ordinal (0 for first template)
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  type: CardType.NEW,
  queue: QueueType.NEW,
  due: 1, // Due date (days from collection creation for new cards)
  ivl: 0, // Interval in days
  factor: 0, // Ease factor (2500 = 250%)
  reps: 0, // Number of reviews
  lapses: 0, // Number of lapses
  left: 0, // Reviews left until the card becomes a review card
  odue: 0, // Original due date (for filtered decks)
  odid: 0, // Original deck ID (for filtered decks)
  flags: 0,
  data: "",
};

ankiPackage.addCard(basicCard);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should create basic note and corresponding card with all required properties"

### Basic & Reversed Note Type Example

```typescript
// Helper function for unique timestamps
let nextTimestamp = Date.now();
const getUniqueTimestamp = () => ++nextTimestamp;

// Create a bidirectional note (generates 2 cards)
const biNote: NotesTable = {
  id: getUniqueTimestamp(),
  guid: `BiNote_${Date.now().toFixed()}`,
  mid: basicAndReversedCardModel.id,
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  tags: "",
  flds: "Apple\x1fPomme", // English \x1f French
  sfld: "Apple",
  csum: 0,
  flags: 0,
  data: "",
};

ankiPackage.addNote(biNote);

// Card 1: English → French
const card1: CardsTable = {
  id: getUniqueTimestamp(),
  nid: biNote.id,
  did: defaultDeck.id,
  ord: 0, // First template
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  type: CardType.NEW,
  queue: QueueType.NEW,
  due: 2,
  ivl: 0,
  factor: 0,
  reps: 0,
  lapses: 0,
  left: 0,
  odue: 0,
  odid: 0,
  flags: 0,
  data: "",
};

// Card 2: French → English
const card2: CardsTable = {
  id: getUniqueTimestamp(),
  nid: biNote.id,
  did: defaultDeck.id,
  ord: 1, // Second template
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  type: CardType.NEW,
  queue: QueueType.NEW,
  due: 3,
  ivl: 0,
  factor: 0,
  reps: 0,
  lapses: 0,
  left: 0,
  odue: 0,
  odid: 0,
  flags: 0,
  data: "",
};

ankiPackage.addCard(card1);
ankiPackage.addCard(card2);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should create bidirectional note that generates two cards"

### Cloze Note Type Example

```typescript
// Helper function for unique timestamps
let nextTimestamp = Date.now();
const getUniqueTimestamp = () => ++nextTimestamp;

// Create a cloze note
const clozeNote: NotesTable = {
  id: getUniqueTimestamp(),
  guid: `ClozeNote_${Date.now().toFixed()}`,
  mid: clozeModel.id,
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  tags: "",
  flds: "The {{c1::capital}} of France is {{c2::Paris}}\x1fExtra info about France",
  sfld: "The capital of France is Paris", // Sorting text without cloze markers
  csum: 0,
  flags: 0,
  data: "",
};

ankiPackage.addNote(clozeNote);

// Cloze need to be generated based on {{c1::}}, {{c2::}} etc.
// Card 1: Tests "capital"
const clozeCard1: CardsTable = {
  id: getUniqueTimestamp(),
  nid: clozeNote.id,
  did: defaultDeck.id,
  ord: 0, // Cloze 1
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  type: CardType.NEW,
  queue: QueueType.NEW,
  due: 4,
  ivl: 0,
  factor: 0,
  reps: 0,
  lapses: 0,
  left: 0,
  odue: 0,
  odid: 0,
  flags: 0,
  data: "",
};

// Card 2: Tests "Paris"
const clozeCard2: CardsTable = {
  id: getUniqueTimestamp(),
  nid: clozeNote.id,
  did: defaultDeck.id,
  ord: 1, // Cloze 2
  mod: Math.floor(Date.now() / 1000),
  usn: -1,
  type: CardType.NEW,
  queue: QueueType.NEW,
  due: 5,
  ivl: 0,
  factor: 0,
  reps: 0,
  lapses: 0,
  left: 0,
  odue: 0,
  odid: 0,
  flags: 0,
  data: "",
};

ankiPackage.addCard(clozeCard1);
ankiPackage.addCard(clozeCard2);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should create cloze deletion notes with multiple cloze markers"

## Adding Review History

```typescript
// Add a review for a card
const review: RevlogTable = {
  id: getUniqueTimestamp(),
  cid: testCard.id, // Card needs no be created or looked up before
  usn: 0,
  ease: 3, // 1=again, 2=hard, 3=good, 4=easy
  ivl: 1, // New interval in days
  lastIvl: 0, // Previous interval
  factor: 2500, // New ease factor (2500 = 250%)
  time: 5000, // Time taken to answer in milliseconds
  type: 0, // 0=learning, 1=review, 2=relearn, 3=cram
};

ankiPackage.addReview(review);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should add review entry for tracking card performance"

## Adding Media Files

You can add media files (images, audio, video, etc.) to your Anki packages:

```typescript
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";

// Method 1: Add from file path
await ankiPackage.addMediaFile("image.png", "./path/to/image.png");

// Method 2: Add from Buffer
const buffer = await readFile("./audio.mp3");
await ankiPackage.addMediaFile("audio.mp3", buffer);

// Method 3: Add from ReadableStream
const stream = createReadStream("./video.mp4");
await ankiPackage.addMediaFile("video.mp4", stream);
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should add media files to an Anki package"

Please note that each filename must be unique because Anki uses filenames as references in notes.
Attempting to add a duplicate filename will throw an error.

## Removing Media Files

You can remove media files from your Anki packages:

```typescript
// Remove a media file by filename
await ankiPackage.removeMediaFile("image.png");

// After removing a file, the name can be reused to add a new file
await ankiPackage.removeMediaFile("old-image.png");
await ankiPackage.addMediaFile("old-image.png", "./path/to/new-image.png");
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should remove media files from an Anki package"

Notes:

- Attempting to remove a non-existent file will throw an error.
- Removed files will not be included in exported packages.
- After removing a file, you can add a new file with the same name.
- This operation removes both the file from disk and from the package's media mapping.

## Removing Unreferenced Media Files

You can clean up media files that are not referenced by any notes:

```typescript
// Remove all media files that aren't referenced in note fields
const removedFiles = await ankiPackage.removeUnreferencedMediaFiles();

console.log(`Removed ${removedFiles.length} unreferenced files:`);
console.log(removedFiles); // Array of filenames that were removed
```

> 📋 **Test:** This example is tested in [`anki/raw-anki-methods.test.ts`](raw-anki-methods.test.ts) - "should remove unreferenced media files"

The method scans all note fields for media references and removes any files that aren't found. It detects common Anki media reference formats:

- Images: `<img src="filename.jpg">`
- Audio/Video: `[sound:filename.mp3]` (Anki uses `[sound:]` for both audio and video)

Notes:

- Returns an array of filenames that were removed
- Only removes files that are not referenced in any note field
- The regex pattern used for detection can be easily modified in the source if additional formats are discovered

## FAQ

### What do I put in each field?

It's not you. The format is absolutely not self-explanatory. I tried to put as much useful information into the type definitions as possible, so check these out. I also [wrote about the format in detail on my blog](https://eikowagenknecht.de/posts/understanding-the-anki-apkg-format-legacy-2/).

### My fields don't show up in Anki

- You need to use `\x1f` (ASCII Unit Separator) between fields in the `flds` string.
- The `sfld` field should contain the sort field (typically the first field) without separators.
- Field content can contain HTML, but it needs to be escaped (e.g. do not write ">" but "&gt;"). CSS styling goes in the note type's `css` field.

## Exporting

For information about exporting your created packages to .apkg files, see **[→ Exporting Guide](../../exporting/anki/README.md)**.
