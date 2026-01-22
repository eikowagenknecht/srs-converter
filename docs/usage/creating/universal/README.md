# Universal SRS Package Creation Guide

This guide covers creating SRS packages using the clean, normalized SRS format. This approach provides good ergonomics with TypeScript-friendly APIs while being future-proof for multiple SRS formats.

> [!warning]
> The universal format is in alpha. Things **will** change and break.

## Overview

The Universal SRS Package approach uses normalized data structures with helper functions like `createNote`, `createDeck`, and `createNoteType`.
The data can then be [converted](../../converting/README.md) to various SRS formats automatically, so you don't have to deal with format-specific details.

## Prerequisites

```typescript
import {
  SrsPackage,
  createDeck,
  createNoteType,
  createNote,
  createCard,
  createCompleteDeckStructure,
} from "srs-converter";
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should import required modules for universal SRS package creation"

## Basic Setup: Creating an SRS Package

```typescript
// Start with an empty SRS package
const srsPackage = new SrsPackage();
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create an empty SRS package"

## Note Types

### Basic Note Type

```typescript
const basicNoteType = createNoteType({
  name: "Basic",
  fields: [
    { id: 0, name: "Front" },
    { id: 1, name: "Back" },
  ],
  templates: [
    {
      id: 0,
      name: "Card 1",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Front}} - {{Back}}",
    },
  ],
});

srsPackage.addNoteType(basicNoteType);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create basic note type with front and back fields"

### Basic & Reversed Note Type

```typescript
const basicReversedNoteType = createNoteType({
  name: "Basic (and reversed card)",
  fields: [
    { id: 0, name: "Front" },
    { id: 1, name: "Back" },
  ],
  templates: [
    {
      id: 0,
      name: "Card 1",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Front}} - {{Back}}",
    },
    {
      id: 1,
      name: "Card 2",
      questionTemplate: "{{Back}}",
      answerTemplate: "{{Back}} - {{Front}}",
    },
  ],
});

srsPackage.addNoteType(basicReversedNoteType);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create note type that generates forward and reverse cards"

### Cloze Note Type

```typescript
const clozeNoteType = createNoteType({
  name: "Cloze",
  fields: [
    { id: 0, name: "Text" },
    { id: 1, name: "Extra" },
  ],
  templates: [
    {
      id: 0,
      name: "Cloze",
      questionTemplate: "{{cloze:Text}}",
      answerTemplate: "{{cloze:Text}}<br>{{Extra}}",
    },
  ],
});

srsPackage.addNoteType(clozeNoteType);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create cloze deletion note type"

## Decks

### Simple Deck

```typescript
const deck = createDeck({
  name: "My Study Deck",
  description: "A deck created using universal SRS package creation",
});

srsPackage.addDeck(deck);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create basic deck with name and description"

## Notes and Cards

### Basic Notes

```typescript
// Create basic notes
const basicNote1 = createNote(
  {
    noteTypeId: basicNoteType.id,
    deckId: deck.id,
    fieldValues: [
      ["Front", "What is the capital of France?"],
      ["Back", "Paris"],
    ],
  },
  basicNoteType,
);

const basicNote2 = createNote(
  {
    noteTypeId: basicNoteType.id,
    deckId: deck.id,
    fieldValues: [
      ["Front", "What is 2 + 2?"],
      ["Back", "4"],
    ],
  },
  basicNoteType,
);

srsPackage.addNote(basicNote1);
srsPackage.addNote(basicNote2);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create basic notes with field values and tags"

### Bidirectional Notes

```typescript
const biNote = createNote(
  {
    noteTypeId: basicReversedNoteType.id,
    deckId: deck.id,
    fieldValues: [
      ["Front", "Hello"],
      ["Back", "Hola"],
    ],
  },
  basicReversedNoteType,
);

srsPackage.addNote(biNote);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create note that generates two cards (forward and reverse)"

### Cloze Notes

```typescript
const clozeNote = createNote(
  {
    noteTypeId: clozeNoteType.id,
    deckId: deck.id,
    fieldValues: [
      ["Text", "The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell."],
      ["Extra", "This is a fundamental concept in biology."],
    ],
  },
  clozeNoteType,
);

srsPackage.addNote(clozeNote);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create cloze deletion notes with multiple cloze markers"

## Complete Deck Structure Helper

For simpler cases, you can use the `createCompleteDeckStructure` helper:

```typescript
const completeDeck = createCompleteDeckStructure({
  deck: {
    name: "Quick Language Deck",
    description: "Basic vocabulary",
  },
  noteTypes: [
    {
      id: "language-basic-note-type",
      name: "Language Basic",
      fields: [
        { id: 0, name: "Native" },
        { id: 1, name: "Foreign" },
      ],
      templates: [
        {
          id: 0,
          name: "Native → Foreign",
          questionTemplate: "{{Native}}",
          answerTemplate: "{{Native}} - {{Foreign}}",
        },
      ],
      notes: [
        {
          fieldValues: [
            ["Native", "Hello"],
            ["Foreign", "Hola"],
          ],
        },
        {
          fieldValues: [
            ["Native", "Goodbye"],
            ["Foreign", "Adiós"],
          ],
        },
        {
          fieldValues: [
            ["Native", "Thank you"],
            ["Foreign", "Gracias"],
          ],
        },
      ],
    },
  ],
});
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should use helper function to create complete deck structure in one call"

## Complete Example

Here's a complete example creating a deck with multiple note types:

```typescript
import { SrsPackage, createDeck, createNoteType, createNote } from "srs-converter";

function createLanguageLearningDeck() {
  const srsPackage = new SrsPackage();

  // Create deck
  const deck = createDeck({
    name: "Spanish Learning",
    description: "Spanish learning deck",
  });
  srsPackage.addDeck(deck);

  // Basic vocabulary note type
  const vocabNoteType = createNoteType({
    name: "Vocabulary",
    fields: [
      { id: 0, name: "English" },
      { id: 1, name: "Spanish" },
      { id: 2, name: "Example" },
    ],
    templates: [
      {
        id: 0,
        name: "English → Spanish",
        questionTemplate: "{{English}}",
        answerTemplate: "{{Spanish}} - {{English}} - {{Example}}",
      },
      {
        id: 1,
        name: "Spanish → English",
        questionTemplate: "{{Spanish}}",
        answerTemplate: "{{Spanish}} - {{English}} - {{Example}}",
      },
    ],
  });
  srsPackage.addNoteType(vocabNoteType);

  // Sentence practice note type
  const sentenceNoteType = createNoteType({
    name: "Sentence Practice",
    fields: [
      { id: 0, name: "Spanish" },
      { id: 1, name: "English" },
    ],
    templates: [
      {
        id: 0,
        name: "Translate",
        questionTemplate: "Translate: {{Spanish}}",
        answerTemplate: "{{Spanish}} - {{English}}",
      },
    ],
  });
  srsPackage.addNoteType(sentenceNoteType);

  // Add vocabulary notes
  const vocabData = [
    { english: "House", spanish: "Casa", example: "Mi casa es grande." },
    { english: "Water", spanish: "Agua", example: "Necesito agua fría." },
    {
      english: "Food",
      spanish: "Comida",
      example: "La comida está deliciosa.",
    },
  ];

  for (const vocab of vocabData) {
    const note = createNote(
      {
        noteTypeId: vocabNoteType.id,
        deckId: deck.id,
        fieldValues: [
          ["English", vocab.english],
          ["Spanish", vocab.spanish],
          ["Example", vocab.example],
        ],
      },
      vocabNoteType,
    );

    srsPackage.addNote(note);
  }

  // Add sentence notes
  const sentenceNote = createNote(
    {
      noteTypeId: sentenceNoteType.id,
      deckId: deck.id,
      fieldValues: [
        ["Spanish", "¿Cómo estás?"],
        ["English", "How are you?"],
      ],
    },
    sentenceNoteType,
  );
  srsPackage.addNote(sentenceNote);

  console.log("✅ Universal SRS package created!");
  console.log("Use the converting guides to target specific formats");

  return srsPackage;
}

createLanguageLearningDeck().catch(console.error);
```

> 📋 **Test:** This example is tested in [`universal/README.test.ts`](README.test.ts) - "should create comprehensive Spanish learning deck using universal approach"
