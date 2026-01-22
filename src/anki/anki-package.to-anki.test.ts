/** biome-ignore-all lint/complexity/useLiteralKeys: <It's a test> */
import { describe, expect, it } from "vitest";

import {
  createCard,
  createDeck,
  createNote,
  createNoteType,
  createReview,
  SrsPackage,
  SrsReviewScore,
} from "@/srs-package";

import type { Ease } from "./types";

import { AnkiPackage } from "./anki-package";
import {
  createBasicSrsPackage,
  createBasicTemplate,
  expectFailure,
  expectSuccess,
  setupTempDir,
} from "./anki-package.fixtures";
import { extractTimestampFromUuid } from "./util";

setupTempDir();

describe("Conversion SRS → Anki", () => {
  describe("fromSrsPackage()", () => {
    it("should convert a basic SRS package", async () => {
      const {
        srsPackage,
        deck,
        noteType: srsNoteType,
        note: srsNote,
      } = createBasicSrsPackage({
        frontValue: "What is the capital of France?",
        backValue: "Paris",
      });

      const result = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(result);

      try {
        const ankiDeck = ankiPackage.getDecks()[0];
        expect(ankiDeck).toBeDefined();
        if (!ankiDeck) throw new Error("Deck not found");

        // Check if all deck data is there
        expect(ankiDeck.name).toBe(deck.name);
        expect(ankiDeck.desc).toBe(deck.description);

        // Check if all note types are there
        const ankiNoteType = ankiPackage.getNoteTypes()[0];
        expect(ankiNoteType).toBeDefined();
        if (!ankiNoteType) throw new Error("Note type not found");
        expect(ankiNoteType.name).toBe(srsNoteType.name);
        expect(ankiNoteType.flds).toHaveLength(2);
        if (!ankiNoteType.flds[0] || !ankiNoteType.flds[1]) throw new Error("Field not found");
        expect(ankiNoteType.flds[0].name).toBe("Front");
        expect(ankiNoteType.flds[1].name).toBe("Back");
        expect(ankiNoteType.did).toEqual(ankiDeck.id);

        // Check if all notes are there
        const ankiNote = ankiPackage.getNotes()[0];
        expect(ankiNote).toBeDefined();
        if (!ankiNote) throw new Error("Note not found");
        expect(ankiNote.id).toBe(extractTimestampFromUuid(srsNote.id));
        expect(ankiNote.mid).toBe(extractTimestampFromUuid(srsNoteType.id));
        const fields = ankiNote.flds.split("\x1f");
        expect(fields).toHaveLength(2);
        expect(fields[0]).toEqual("What is the capital of France?");
        expect(fields[1]).toEqual("Paris");
        expect(ankiNote.sfld).toBe("What is the capital of France?");

        // Check if all cards are there
        const ankiCard = ankiPackage.getCards()[0];
        expect(ankiCard).toBeDefined();
        if (!ankiCard) throw new Error("Card not found");
        // expect(ankiCard1.id).toBe(generateUniqueIdFromUuid(srsCard.id));
        expect(ankiCard.nid).toBe(ankiNote.id);
        expect(ankiCard.ord).toBe(0);
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should remove unused note types", async () => {
      const { srsPackage } = createBasicSrsPackage({
        frontValue: "What is the capital of France?",
        backValue: "Paris",
      });

      // Add an unused note type
      const unusedSrsNotetype = createNoteType({
        name: "Basically useless",
        fields: [
          { id: 0, name: "Front" },
          { id: 1, name: "Back" },
        ],
        templates: [createBasicTemplate()],
      });
      srsPackage.addNoteType(unusedSrsNotetype);

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const ankiDeck = ankiPackage.getDecks()[0];
        expect(ankiDeck).toBeDefined();
        if (!ankiDeck) throw new Error("Deck not found");

        // Check that the unused note type was removed
        const noteTypes = ankiPackage.getNoteTypes();
        expect(noteTypes).toHaveLength(1);
        if (!noteTypes[0]) throw new Error("Note type not found");
        expect(noteTypes[0].name).toBe("Basic");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should handle empty SRS packages", async () => {
      const emptySrsPackage = new SrsPackage();
      const result = await AnkiPackage.fromSrsPackage(emptySrsPackage);
      expectFailure(result);
      expect(result.issues[0]?.message).toMatch(/The package must contain exactly one deck/);
    });

    it("should convert note types with multiple fields and templates", async () => {
      const srsPackage = new SrsPackage();

      const deck = createDeck({ name: "Test Deck" });
      const noteType = createNoteType({
        name: "Language Learning",
        fields: [
          { id: 0, name: "Word" },
          { id: 1, name: "Pronunciation" },
          { id: 2, name: "Meaning" },
          { id: 3, name: "Example" },
          { id: 4, name: "Notes" },
        ],
        templates: [
          {
            id: 0,
            name: "Recognition",
            questionTemplate: "{{Word}}",
            answerTemplate: "{{Pronunciation}}\n\n{{Meaning}}\n\n{{Example}}",
          },
          {
            id: 1,
            name: "Production",
            questionTemplate: "{{Meaning}}",
            answerTemplate: "{{Word}}",
          },
        ],
      });

      // Create a note that uses all the fields
      const note = createNote(
        {
          noteTypeId: noteType.id,
          deckId: deck.id,
          fieldValues: [
            ["Word", "猫"],
            ["Pronunciation", "ねこ (neko)"],
            ["Meaning", "cat"],
            ["Example", "猫が好きです。"],
            ["Notes", "Common animal word"],
          ],
        },
        noteType,
      );

      // Create a card for the note
      const card = createCard({
        noteId: note.id,
        templateId: 0,
      });

      srsPackage.addDeck(deck);
      srsPackage.addNoteType(noteType);
      srsPackage.addNote(note);
      srsPackage.addCard(card);

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const convertedSrsResult = ankiPackage.toSrsPackage();
        const convertedSrs = expectSuccess(convertedSrsResult);
        const convertedNoteType = convertedSrs.getNoteTypes()[0];

        expect(convertedNoteType?.fields).toHaveLength(5);
        expect(convertedNoteType?.fields.map((f) => f.name)).toEqual([
          "Word",
          "Pronunciation",
          "Meaning",
          "Example",
          "Notes",
        ]);
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should convert note types with multiple templates", async () => {
      const srsPackage = new SrsPackage();
      const deck = createDeck({ name: "Test Deck" });

      const bidirectionalNoteType = createNoteType({
        name: "Bidirectional",
        fields: [
          { id: 0, name: "Front" },
          { id: 1, name: "Back" },
        ],
        templates: [
          {
            id: 0,
            name: "Front to Back",
            questionTemplate: "{{Front}}",
            answerTemplate: "{{Back}}",
          },
          {
            id: 1,
            name: "Back to Front",
            questionTemplate: "{{Back}}",
            answerTemplate: "{{Front}}",
          },
        ],
      });

      const note = createNote(
        {
          noteTypeId: bidirectionalNoteType.id,
          deckId: deck.id,
          fieldValues: [
            ["Front", "Hello"],
            ["Back", "こんにちは"],
          ],
        },
        bidirectionalNoteType,
      );

      const card1 = createCard({
        noteId: note.id,
        templateId: 0,
      });

      const card2 = createCard({
        noteId: note.id,
        templateId: 1,
      });

      srsPackage.addDeck(deck);
      srsPackage.addNoteType(bidirectionalNoteType);
      srsPackage.addNote(note);
      srsPackage.addCard(card1);
      srsPackage.addCard(card2);

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const convertedSrsResult = ankiPackage.toSrsPackage();
        const convertedSrs = expectSuccess(convertedSrsResult);
        const convertedNoteType = convertedSrs.getNoteTypes()[0];

        expect(convertedNoteType?.templates).toHaveLength(2);
        expect(convertedNoteType?.templates[0]?.name).toBe("Front to Back");
        expect(convertedNoteType?.templates[1]?.name).toBe("Back to Front");
      } finally {
        await ankiPackage.cleanup();
      }
    });
  });

  describe("Deck conversion", () => {
    it.todo("should preserve deck descriptions", async () => {
      // TODO: Test that deck descriptions are preserved and converted properly
    });

    it.todo("should handle missing descriptions gracefully", async () => {
      // TODO: Test behavior when deck description is undefined/null
    });

    it("should preserve original Anki IDs when available", async () => {
      // Create SRS package with originalAnkiId in applicationSpecificData
      const srsPackage = new SrsPackage();

      const deck = createDeck({
        name: "Test Deck",
        applicationSpecificData: {
          originalAnkiId: "1234567890",
        },
      });
      srsPackage.addDeck(deck);

      const noteType = createNoteType({
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
            answerTemplate: "{{Back}}",
          },
        ],
        applicationSpecificData: {
          originalAnkiId: "9876543210",
        },
      });
      srsPackage.addNoteType(noteType);

      // Add a note so the package is valid
      const note = createNote(
        {
          noteTypeId: noteType.id,
          deckId: deck.id,
          fieldValues: [
            ["Front", "Question"],
            ["Back", "Answer"],
          ],
        },
        noteType,
      );
      srsPackage.addNote(note);

      // Convert to Anki
      const result = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(result);
      const decks = ankiPackage.getDecks();
      const noteTypes = ankiPackage.getNoteTypes();

      // Verify original IDs were used
      expect(decks[0]?.id).toBe(1234567890);
      expect(noteTypes[0]?.id).toBe(9876543210);

      await ankiPackage.cleanup();
    });
  });

  describe("Note type conversion", () => {
    it.todo("should convert fields with proper ordering", async () => {
      // TODO: Test that field order is preserved and properly indexed
    });

    it.todo("should handle field descriptions", async () => {
      // TODO: Test conversion of field descriptions
    });

    it.todo("should convert templates with HTML/Markdown", async () => {
      // TODO: Test template conversion with various markup formats
    });

    it.todo("should preserve template names and ordering", async () => {
      // TODO: Test that template names and order are maintained
    });

    it.todo("should set default CSS styling", async () => {
      // TODO: Test that appropriate default CSS is applied
    });

    it.todo("should set default LaTeX templates", async () => {
      // TODO: Test that LaTeX pre/post templates are set correctly
    });

    it.todo("should handle note types without descriptions", async () => {
      // TODO: Test behavior when note type has no description
    });
  });

  describe("Note conversion", () => {
    it.todo("should generate valid Anki GUIDs", async () => {
      // TODO: Test that generated GUIDs are valid base91 encoded values
    });

    it.todo("should join field values correctly", async () => {
      // TODO: Test that field values are joined with proper separators
    });

    it.todo("should handle empty field values", async () => {
      // TODO: Test behavior with empty or missing field values
    });

    it.todo("should set sort field to first field value", async () => {
      // TODO: Test that sfld is set to the first field's value
    });

    it.todo("should handle unicode content properly", async () => {
      // TODO: Test unicode handling in field values
    });

    it.todo("should preserve field value ordering", async () => {
      // TODO: Test that field values maintain correct order
    });
  });

  describe("Card conversion", () => {
    it.todo("should associate cards with correct decks", async () => {
      // TODO: Test deck association through note relationships
    });

    it.todo("should map template IDs correctly", async () => {
      // TODO: Test that template IDs are properly mapped
    });

    it.todo("should handle cards without notes (error case)", async () => {
      // TODO: Test error handling for orphaned cards
    });

    it("should preserve application-specific data", async () => {
      // Create a basic SRS package and convert to Anki
      const { srsPackage } = createBasicSrsPackage();
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        // Convert back to SRS to test application-specific data preservation
        const resultSrsResult = ankiPackage.toSrsPackage();
        const resultPackage = expectSuccess(resultSrsResult);

        // Find a card to check its application-specific data
        const card = resultPackage.getCards()[0];

        // Verify the specific fields are preserved
        if (card?.applicationSpecificData) {
          expect(card.applicationSpecificData["ankiDue"]).toBeDefined();
          expect(card.applicationSpecificData["ankiQueue"]).toBeDefined();
          expect(card.applicationSpecificData["ankiType"]).toBeDefined();
          expect(card.applicationSpecificData["originalAnkiId"]).toBeDefined();
          expect(card.applicationSpecificData["ankiData"]).toBeDefined();

          // Verify the data types are correct (should be strings)
          expect(typeof card.applicationSpecificData["ankiDue"]).toBe("string");
          expect(typeof card.applicationSpecificData["ankiQueue"]).toBe("string");
          expect(typeof card.applicationSpecificData["ankiType"]).toBe("string");
          expect(typeof card.applicationSpecificData["ankiData"]).toBe("string");
        } else {
          throw new Error("Card or applicationSpecificData is undefined");
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });
  });

  describe("Review conversion", () => {
    it.todo("should map all SrsReviewScore values to Ease", async () => {
      // TODO: Test all possible score mappings
    });

    it("should handle invalid review scores", async () => {
      const { srsPackage } = createBasicSrsPackage({
        frontValue: "Question",
        backValue: "Answer",
      });

      // Convert to Anki first to get valid cards
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      // Get the first card ID from the existing cards
      const cards = ankiPackage.getCards();
      expect(cards).toBeDefined();
      if (cards.length === 0) {
        throw new Error("No cards found in database");
      }
      const firstCard = cards[0];
      if (!firstCard?.id) {
        throw new Error("First card or card ID is missing");
      }

      // Create a review with invalid ease but valid card ID
      ankiPackage.addReview({
        id: 999999,
        cid: firstCard.id, // Valid card ID
        usn: 0,
        ease: 999 as unknown as Ease, // Invalid ease value (type-cast for testing)
        ivl: 1,
        lastIvl: 0,
        factor: 2500,
        time: 5000,
        type: 0,
      });

      // Convert to SRS to trigger the error handling
      const srsResult = ankiPackage.toSrsPackage();

      expect(srsResult.status).toBe("partial");
      expect(srsResult.issues).toHaveLength(1);

      // Check that the error includes information about the unknown review score
      expect(srsResult.issues[0]?.message).toContain("Unknown review score");
      expect(srsResult.issues[0]?.message).toContain("999");
      expect(srsResult.issues[0]?.message).toContain("Skipping review");

      await ankiPackage.cleanup();
    });

    it.skip("should handle review conversion exceptions", async () => {
      // This test attempts to trigger the catch block in review conversion.
      // However, normal invalid data doesn't seem to cause exceptions in the conversion logic
      // The createReview and addReview methods are too simple to throw exceptions easily
      // This test is skipped as it's difficult to trigger the catch block without mocking
      // or creating very specific runtime errors that don't occur in normal data scenarios
      // TODO: Consider using test spies/mocks to force exceptions in the try block
      // or investigate if there are specific data patterns that cause runtime errors
    });

    it("should use review timestamp as Anki ID", async () => {
      // Create SRS package with a review
      const srsPackage = new SrsPackage();

      const deck = createDeck({ name: "Test Deck" });
      srsPackage.addDeck(deck);

      const noteType = createNoteType({
        name: "Basic",
        fields: [{ id: 0, name: "Front" }],
        templates: [
          {
            id: 0,
            name: "Card 1",
            questionTemplate: "{{Front}}",
            answerTemplate: "{{Front}}",
          },
        ],
      });
      srsPackage.addNoteType(noteType);

      const note = createNote(
        {
          noteTypeId: noteType.id,
          deckId: deck.id,
          fieldValues: [["Front", "Test"]],
        },
        noteType,
      );
      srsPackage.addNote(note);

      const card = createCard({
        noteId: note.id,
        templateId: 0,
      });
      srsPackage.addCard(card);

      const timestamp = 1234567890000;
      const review = createReview({
        cardId: card.id,
        timestamp: timestamp,
        score: SrsReviewScore.Normal,
      });
      srsPackage.addReview(review);

      // Convert to Anki
      const result = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(result);
      const reviews = ankiPackage.getReviews();

      // Verify timestamp is used as Anki review ID (since no originalAnkiId is stored)
      expect(reviews[0]?.id).toBe(timestamp);

      await ankiPackage.cleanup();
    });

    it.todo("should handle missing card associations", async () => {
      // TODO: Test error handling for reviews without valid cards
    });
  });
});
