/**
 * Tests for Raw Anki Methods creation documentation examples
 * Covers all code samples from raw-anki-methods.md
 */

import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnkiPackage } from "@/anki/anki-package";
import {
  basicAndReversedCardModel,
  basicModel,
  basicOptionalReversedCardModel,
  basicTypeInTheAnswerModel,
  clozeModel,
  defaultDeck,
  imageOcclusionModel,
} from "@/anki/constants";
import {
  type CardsTable,
  CardType,
  type Deck,
  DeckDynamicity,
  type NotesTable,
  NoteTypeKind,
  QueueType,
  type RevlogTable,
} from "@/index";

describe("Raw Anki Methods Creation Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      join(tmpdir(), "srs-converter-raw-anki-methods-test-"),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Code Sample 4.1: Prerequisites Import (lines 11-14)
  it("should import required modules for raw Anki methods", () => {
    // Test the documentation example: Prerequisites Import
    // import { AnkiPackage } from "srs-converter";
    // import {
    //   basicModel,
    //   basicAndReversedCardModel,
    //   clozeModel,
    //   defaultDeck,
    // } from "srs-converter/anki/constants";

    // Verify the imports are available and have expected properties
    expect(AnkiPackage).toBeDefined();
    expect(typeof AnkiPackage.fromDefault).toBe("function");

    expect(basicModel).toBeDefined();
    expect(basicModel.name).toBe("Basic (srs-converter)");

    expect(basicAndReversedCardModel).toBeDefined();
    expect(basicAndReversedCardModel.name).toBe(
      "Basic (and reversed card) (srs-converter)",
    );

    expect(clozeModel).toBeDefined();
    expect(clozeModel.name).toBe("Cloze (srs-converter)");

    expect(defaultDeck).toBeDefined();
    expect(defaultDeck.name).toBeTypeOf("string");
  });

  // Code Sample 4.2: Creating Empty Anki Package
  it("should create an empty Anki package from default", async () => {
    // Test the documentation example: Creating Empty Anki Package
    // Start with a fresh Anki package
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    expect(result.data).toBeDefined();

    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    // Verify the package is properly initialized
    expect(ankiPackage).toBeDefined();
    expect(ankiPackage.getDecks().length).toBe(1); // Should have default deck
    expect(ankiPackage.getNotes().length).toBe(0); // Deck should be empty
    expect(ankiPackage.getCards().length).toBe(0); // Deck should be empty
  });

  // Code Sample 4.3: Adding Custom Deck
  it("should add custom deck with all required Anki deck properties", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    // Test the documentation example: Adding Custom Deck
    const customDeck: Deck = {
      id: Date.now(),
      name: "My Custom Deck",
      desc: "A custom deck created using raw Anki methods",
      extendRev: 50,
      extendNew: 0,
      usn: 0,
      collapsed: false,
      browserCollapsed: true,
      dyn: DeckDynamicity.STATIC,
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

    // Verify the deck was added (not in the docs)
    const decks = ankiPackage.getDecks();
    const addedDeck = decks.find((deck) => deck.name === "My Custom Deck");

    expect(addedDeck).toBeDefined();
    expect(addedDeck?.desc).toBe(
      "A custom deck created using raw Anki methods",
    );
    expect(addedDeck?.extendRev).toBe(50);
    expect(addedDeck?.conf).toBe(1);
    expect(Array.isArray(addedDeck?.newToday)).toBe(true);
    expect(addedDeck?.newToday).toEqual([0, 0]);
  });

  // Code Sample 4.4: Adding Built-in Note Types
  it("should add built-in note types to the package", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    // Test the documentation example: Adding Built-in Note Types
    // Add built-in note types
    ankiPackage.addNoteType(basicModel); // Basic
    ankiPackage.addNoteType(basicAndReversedCardModel); // Basic (and reversed card)
    ankiPackage.addNoteType(basicOptionalReversedCardModel); // Basic (optional reversed card)
    ankiPackage.addNoteType(basicTypeInTheAnswerModel); // Basic (type in the answer)
    ankiPackage.addNoteType(clozeModel); // Cloze
    ankiPackage.addNoteType(imageOcclusionModel); // Image Occlusion

    // Verify the note types were added
    const noteTypes = ankiPackage.getNoteTypes();

    const basicType = noteTypes.find(
      (nt) => nt.name === "Basic (srs-converter)",
    );
    const basicAndReversedType = noteTypes.find(
      (nt) => nt.name === "Basic (and reversed card) (srs-converter)",
    );
    const basicOptionalReversedType = noteTypes.find(
      (nt) => nt.name === "Basic (optional reversed card) (srs-converter)",
    );
    const clozeType = noteTypes.find(
      (nt) => nt.name === "Cloze (srs-converter)",
    );
    const imageOcclusionType = noteTypes.find(
      (nt) => nt.name === "Image Occlusion (srs-converter)",
    );

    expect(basicType).toBeDefined();
    expect(basicAndReversedType).toBeDefined();
    expect(basicOptionalReversedType).toBeDefined();
    expect(clozeType).toBeDefined();
    expect(imageOcclusionType).toBeDefined();

    expect(clozeType?.type).toBe(NoteTypeKind.CLOZE); // Cloze type
  });

  // Code Sample 4.5: Creating Custom Note Type - Simplified for testing
  it("should create custom note type with fields, templates, and CSS", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    // Test the documentation example: Creating Custom Note Type
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

    // Verify the custom note type was added
    const noteTypes = ankiPackage.getNoteTypes();
    const addedType = noteTypes.find((nt) => nt.name === "Custom Note Type");

    expect(addedType).toEqual(customNoteType);
  });

  // Code Sample 4.6: Basic Note Creation
  it("should create basic note and corresponding card with all required properties", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    ankiPackage.addNoteType(basicModel);

    // Test the documentation example: Basic Note Creation
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

    // Verify the note and card were added
    const notes = ankiPackage.getNotes();
    const cards = ankiPackage.getCards();

    const addedNote = notes.find((n) => n.id === basicNote.id);
    const addedCard = cards.find((c) => c.id === basicCard.id);

    expect(addedNote).toEqual(basicNote);
    expect(addedCard).toEqual(basicCard);
  });

  // Code Sample 4.7: Bidirectional Note Creation
  it("should create bidirectional note that generates two cards", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    ankiPackage.addNoteType(basicAndReversedCardModel);

    // Test the documentation example: Bidirectional Note Creation
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

    // Verify the bidirectional setup
    const notes = ankiPackage.getNotes();
    const cards = ankiPackage.getCards();

    const addedNote = notes.find((n) => n.id === biNote.id);
    const relatedCards = cards.filter((c) => c.nid === biNote.id);

    expect(addedNote).toEqual(biNote);

    expect(relatedCards).toHaveLength(2);
    expect(relatedCards.find((c) => c.ord === 0)).toBeDefined(); // First template
    expect(relatedCards.find((c) => c.ord === 1)).toBeDefined(); // Second template
  });

  // Code Sample 4.8: Cloze Note Creation
  it("should create cloze deletion notes with multiple cloze markers", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    ankiPackage.addNoteType(clozeModel);

    // Test the documentation example: Cloze Note Creation
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

    // Verify the cloze setup
    const notes = ankiPackage.getNotes();
    const cards = ankiPackage.getCards();

    const addedNote = notes.find((n) => n.id === clozeNote.id);
    const relatedCards = cards.filter((c) => c.nid === clozeNote.id);

    expect(addedNote).toEqual(clozeNote);
    expect(relatedCards).toHaveLength(2);
    expect(relatedCards.find((c) => c.ord === 0)).toEqual(clozeCard1);
    expect(relatedCards.find((c) => c.ord === 1)).toEqual(clozeCard2);
  });

  // Code Sample 4.9: Adding Review History
  it("should add review entry for tracking card performance", async () => {
    // Setup (not in the docs)
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    ankiPackage.addNoteType(basicModel);

    // Create a note and card first
    let nextTimestamp = Date.now();
    const getUniqueTimestamp = () => ++nextTimestamp;

    const testNote = {
      id: getUniqueTimestamp(),
      guid: `ReviewNote_${Date.now().toFixed()}`,
      mid: basicModel.id,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      tags: "",
      flds: "Test question for review\x1fTest answer",
      sfld: "Test question for review",
      csum: 0,
      flags: 0,
      data: "",
    };

    const testCard = {
      id: getUniqueTimestamp(),
      nid: testNote.id,
      did: defaultDeck.id,
      ord: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      type: 0,
      queue: 0,
      due: 1,
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

    ankiPackage.addNote(testNote);
    ankiPackage.addCard(testCard);

    // Test the documentation example: Adding Review History
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

    // Verify the review was added
    const reviews = ankiPackage.getReviews();
    const addedReview = reviews.find((r) => r.id === review.id);

    expect(addedReview).toEqual(review);
  });

  // Code Sample: Adding Media Files
  it("should add media files to an Anki package", async () => {
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    // Test the documentation example: Adding Media Files
    // Method 1: Add from file path
    await ankiPackage.addMediaFile(
      "image.png",
      "tests/fixtures/media/image.png",
    );

    // Method 2: Add from Buffer
    const buffer = await readFile("tests/fixtures/media/audio.mp3");
    await ankiPackage.addMediaFile("audio.mp3", buffer);

    // Method 3: Add from ReadableStream
    const stream = createReadStream("tests/fixtures/media/video.mp4");
    await ankiPackage.addMediaFile("video.mp4", stream);

    // Verify media files are added
    const mediaFiles = ankiPackage.listMediaFiles();
    expect(mediaFiles).toContain("image.png");
    expect(mediaFiles).toContain("audio.mp3");
    expect(mediaFiles).toContain("video.mp4");
    expect(mediaFiles).toHaveLength(3);
  });
});
