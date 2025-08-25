/**
 * Tests for Universal SRS Package creation documentation examples
 * Covers all code samples from README.md
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCard,
  createCompleteDeckStructure,
  createDeck,
  createNote,
  createNoteType,
  SrsPackage,
} from "@/srs-package";

describe("Universal SRS Package Creation Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      join(tmpdir(), "srs-converter-universal-srs-test-"),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Code Sample: Prerequisites Import
  it("should import required modules for universal SRS package creation", () => {
    // Test the documentation example: Prerequisites Import
    // import {
    //   SrsPackage,
    //   createDeck,
    //   createNoteType,
    //   createNote,
    //   createCard,
    //   createCompleteDeckStructure
    // } from 'srs-converter';

    // Verify the imports are available and have expected properties
    expect(SrsPackage).toBeDefined();
    expect(typeof SrsPackage).toBe("function"); // Constructor

    expect(createDeck).toBeDefined();
    expect(typeof createDeck).toBe("function");

    expect(createNoteType).toBeDefined();
    expect(typeof createNoteType).toBe("function");

    expect(createNote).toBeDefined();
    expect(typeof createNote).toBe("function");

    expect(createCard).toBeDefined();
    expect(typeof createCard).toBe("function");

    expect(createCompleteDeckStructure).toBeDefined();
    expect(typeof createCompleteDeckStructure).toBe("function");
  });

  // Code Sample: Creating SRS Package
  it("should create an empty SRS package", () => {
    // Test the documentation example: Creating SRS Package
    // Start with an empty SRS package
    const srsPackage = new SrsPackage();

    // Verify the package is properly initialized
    expect(srsPackage).toBeDefined();
    expect(srsPackage.getDecks()).toHaveLength(0); // Should be empty initially
    expect(srsPackage.getNotes()).toHaveLength(0);
    expect(srsPackage.getCards()).toHaveLength(0);
    expect(srsPackage.getNoteTypes()).toHaveLength(0);
  });

  // Code Sample: Basic Note Type Creation
  it("should create basic note type with front and back fields", () => {
    const srsPackage = new SrsPackage();

    // Test the documentation example: Basic Note Type Creation
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

    // Verify the note type was created correctly
    expect(basicNoteType.name).toBe("Basic");
    expect(basicNoteType.fields).toHaveLength(2);
    expect(basicNoteType.fields[0]?.name).toBe("Front");
    expect(basicNoteType.fields[1]?.name).toBe("Back");
    expect(basicNoteType.templates).toHaveLength(1);
    expect(basicNoteType.templates[0]?.name).toBe("Card 1");
    expect(basicNoteType.templates[0]?.questionTemplate).toBe("{{Front}}");
    expect(basicNoteType.templates[0]?.answerTemplate).toBe(
      "{{Front}} - {{Back}}",
    );

    // Verify it was added to the package
    const noteTypes = srsPackage.getNoteTypes();
    expect(noteTypes).toHaveLength(1);
    expect(noteTypes[0]).toEqual(basicNoteType);
  });

  // Code Sample: Bidirectional Note Type Creation
  it("should create note type that generates forward and reverse cards", () => {
    const srsPackage = new SrsPackage();

    // Test the documentation example: Bidirectional Note Type Creation
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

    // Verify the bidirectional note type
    expect(basicReversedNoteType.name).toBe("Basic (and reversed card)");
    expect(basicReversedNoteType.fields).toHaveLength(2);
    expect(basicReversedNoteType.templates).toHaveLength(2);

    // Check first template (Forward)
    expect(basicReversedNoteType.templates[0]?.name).toBe("Card 1");
    expect(basicReversedNoteType.templates[0]?.questionTemplate).toBe(
      "{{Front}}",
    );
    expect(basicReversedNoteType.templates[0]?.answerTemplate).toBe(
      "{{Front}} - {{Back}}",
    );

    // Check second template (Reverse)
    expect(basicReversedNoteType.templates[1]?.name).toBe("Card 2");
    expect(basicReversedNoteType.templates[1]?.questionTemplate).toBe(
      "{{Back}}",
    );
    expect(basicReversedNoteType.templates[1]?.answerTemplate).toBe(
      "{{Back}} - {{Front}}",
    );

    const noteTypes = srsPackage.getNoteTypes();
    expect(noteTypes).toHaveLength(1);
    expect(noteTypes[0]).toEqual(basicReversedNoteType);
  });

  // Code Sample: Cloze Note Type Creation
  it("should create cloze deletion note type", () => {
    const srsPackage = new SrsPackage();

    // Test the documentation example: Cloze Note Type Creation
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
          answerTemplate: "{{cloze:Text}} - {{Extra}}",
        },
      ],
    });

    srsPackage.addNoteType(clozeNoteType);

    // Verify the cloze note type
    expect(clozeNoteType.name).toBe("Cloze");
    expect(clozeNoteType.fields).toHaveLength(2);
    expect(clozeNoteType.fields[0]?.name).toBe("Text");
    expect(clozeNoteType.fields[1]?.name).toBe("Extra");
    expect(clozeNoteType.templates).toHaveLength(1);
    expect(clozeNoteType.templates[0]?.name).toBe("Cloze");
    expect(clozeNoteType.templates[0]?.questionTemplate).toBe("{{cloze:Text}}");
    expect(clozeNoteType.templates[0]?.answerTemplate).toBe(
      "{{cloze:Text}} - {{Extra}}",
    );

    const noteTypes = srsPackage.getNoteTypes();
    expect(noteTypes).toHaveLength(1);
    expect(noteTypes[0]).toEqual(clozeNoteType);
  });

  // Code Sample: Simple Deck Creation
  it("should create basic deck with name and description", () => {
    const srsPackage = new SrsPackage();

    // Test the documentation example: Simple Deck Creation
    const deck = createDeck({
      name: "My Study Deck",
      description: "A deck created using universal SRS package creation",
    });

    srsPackage.addDeck(deck);

    // Verify it was added to the package
    const decks = srsPackage.getDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0]).toEqual(deck);
  });

  // Code Sample: Basic Notes Creation
  it("should create basic notes with field values and tags", () => {
    // Set up prerequisites
    const srsPackage = new SrsPackage();

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

    const deck = createDeck({
      name: "Test Deck",
      description: "For testing notes",
    });
    srsPackage.addDeck(deck);

    // Test the documentation example: Basic Notes Creation
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

    // Verify the notes were created correctly
    expect(basicNote1.noteTypeId).toBe(basicNoteType.id);
    expect(basicNote1.deckId).toBe(deck.id);
    expect(basicNote1.fieldValues).toEqual([
      ["Front", "What is the capital of France?"],
      ["Back", "Paris"],
    ]);

    expect(basicNote2.noteTypeId).toBe(basicNoteType.id);
    expect(basicNote2.fieldValues).toEqual([
      ["Front", "What is 2 + 2?"],
      ["Back", "4"],
    ]);

    // Verify they were added to the package
    const notes = srsPackage.getNotes();
    expect(notes).toHaveLength(2);
    expect(notes).toContainEqual(basicNote1);
    expect(notes).toContainEqual(basicNote2);
  });

  // Code Sample: Bidirectional Notes Creation
  it("should create note that generates two cards (forward and reverse)", () => {
    // Set up prerequisites
    const srsPackage = new SrsPackage();

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

    const deck = createDeck({
      name: "Bidirectional Test",
      description: "Testing bidirectional notes",
    });
    srsPackage.addDeck(deck);

    // Test the documentation example: Bidirectional Notes Creation
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

    // Verify the bidirectional note
    expect(biNote.noteTypeId).toBe(basicReversedNoteType.id);
    expect(biNote.deckId).toBe(deck.id);
    expect(biNote.fieldValues).toEqual([
      ["Front", "Hello"],
      ["Back", "Hola"],
    ]);

    const notes = srsPackage.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(biNote);
  });

  // Code Sample: Cloze Notes Creation
  it("should create cloze deletion notes with multiple cloze markers", () => {
    // Set up prerequisites
    const srsPackage = new SrsPackage();

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
          answerTemplate: "{{cloze:Text}} - {{Extra}}",
        },
      ],
    });
    srsPackage.addNoteType(clozeNoteType);

    const deck = createDeck({
      name: "Cloze Test",
      description: "Testing cloze notes",
    });
    srsPackage.addDeck(deck);

    // Test the documentation example: Cloze Notes Creation
    const clozeNote = createNote(
      {
        noteTypeId: clozeNoteType.id,
        deckId: deck.id,
        fieldValues: [
          [
            "Text",
            "The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.",
          ],
          ["Extra", "This is a fundamental concept in biology."],
        ],
      },
      clozeNoteType,
    );

    srsPackage.addNote(clozeNote);

    // Verify the cloze note
    expect(clozeNote.noteTypeId).toBe(clozeNoteType.id);
    expect(clozeNote.deckId).toBe(deck.id);
    expect(clozeNote.fieldValues).toEqual([
      [
        "Text",
        "The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.",
      ],
      ["Extra", "This is a fundamental concept in biology."],
    ]);

    const notes = srsPackage.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(clozeNote);
  });

  // Code Sample: Complete Deck Structure Helper
  it("should use helper function to create complete deck structure in one call", () => {
    // Test the documentation example: Complete Deck Structure Helper
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

    // Verify the complete structure was created
    expect(completeDeck).toBeDefined();

    // Check deck
    const decks = completeDeck.getDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0]?.name).toBe("Quick Language Deck");
    expect(decks[0]?.description).toBe("Basic vocabulary");

    // Check note types
    const noteTypes = completeDeck.getNoteTypes();
    expect(noteTypes).toHaveLength(1);
    expect(noteTypes[0]?.name).toBe("Language Basic");
    expect(noteTypes[0]?.fields).toHaveLength(2);
    expect(noteTypes[0]?.fields[0]?.name).toBe("Native");
    expect(noteTypes[0]?.fields[1]?.name).toBe("Foreign");
    expect(noteTypes[0]?.templates).toHaveLength(1);

    // Check notes
    const notes = completeDeck.getNotes();
    expect(notes).toHaveLength(3);
    expect(notes[0]?.fieldValues).toEqual([
      ["Native", "Hello"],
      ["Foreign", "Hola"],
    ]);
    expect(notes[1]?.fieldValues).toEqual([
      ["Native", "Goodbye"],
      ["Foreign", "Adiós"],
    ]);
    expect(notes[2]?.fieldValues).toEqual([
      ["Native", "Thank you"],
      ["Foreign", "Gracias"],
    ]);
  });

  // Code Sample: Complete Example Function
  it("should create Spanish learning deck using universal approach", () => {
    // Test the documentation example: Complete Example Function
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
            answerTemplate: "{{English}} - {{Spanish}} - {{Example}}",
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

      // console.log("✅ Universal SRS package created!");
      // console.log("Use the converting guides to target specific formats");

      return srsPackage;
    }

    // Run the complete example function
    const spanishDeck = createLanguageLearningDeck();

    // Verify the comprehensive structure
    expect(spanishDeck).toBeDefined();

    const decks = spanishDeck.getDecks();
    const noteTypes = spanishDeck.getNoteTypes();
    const notes = spanishDeck.getNotes();

    // Verify deck structure
    expect(decks).toHaveLength(1);
    expect(decks[0]?.name).toBe("Spanish Learning");
    expect(decks[0]?.description).toBe("Spanish learning deck");

    // Verify note types
    expect(noteTypes).toHaveLength(2);
    const vocabType = noteTypes.find((nt) => nt.name === "Vocabulary");
    const sentenceType = noteTypes.find(
      (nt) => nt.name === "Sentence Practice",
    );

    expect(vocabType).toBeDefined();
    expect(vocabType?.fields).toHaveLength(3);
    expect(vocabType?.templates).toHaveLength(2); // Bidirectional

    expect(sentenceType).toBeDefined();
    expect(sentenceType?.fields).toHaveLength(2);
    expect(sentenceType?.templates).toHaveLength(1);

    // Verify notes
    expect(notes).toHaveLength(4); // 3 vocab + 1 sentence

    const houseNote = notes.find((n) =>
      n.fieldValues.some(
        ([field, value]) => field === "English" && value === "House",
      ),
    );
    expect(houseNote).toBeDefined();

    const greetingNote = notes.find((n) =>
      n.fieldValues.some(
        ([field, value]) => field === "Spanish" && value === "¿Cómo estás?",
      ),
    );
    expect(greetingNote).toBeDefined();
  });
});
