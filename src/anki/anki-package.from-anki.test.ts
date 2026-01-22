/** biome-ignore-all lint/complexity/useLiteralKeys: <It's a test> */
import { describe, expect, it } from "vitest";

import {
  createCard,
  createDeck,
  createNote,
  createNoteType,
  SrsPackage,
  SrsReviewScore,
} from "@/srs-package";

import type { Ease } from "./types";

import { AnkiPackage } from "./anki-package";
import {
  createBasicSrsPackage,
  expectPartial,
  expectSuccess,
  setupTempDir,
} from "./anki-package.fixtures";

setupTempDir();

describe("Conversion Anki → SRS", () => {
  describe("toSrsPackage()", () => {
    it("should convert all Anki data types", async () => {
      // Create a comprehensive SRS package with all data types
      const srsPackage = new SrsPackage();

      const srsDeck = createDeck({
        name: "Comprehensive Test Deck",
        description: "Testing all data type conversions",
      });

      const multiFieldTemplate1 = {
        id: 0,
        name: "Recognition",
        questionTemplate: "{{Word}}",
        answerTemplate: "{{Pronunciation}}<br>{{Meaning}}<br>{{Example}}",
      };

      const multiFieldTemplate2 = {
        id: 1,
        name: "Production",
        questionTemplate: "{{Meaning}}",
        answerTemplate: "{{Word}}<br>{{Pronunciation}}",
      };

      const srsNoteType = createNoteType({
        name: "Comprehensive Note Type",
        fields: [
          { id: 0, name: "Word" },
          { id: 1, name: "Pronunciation" },
          { id: 2, name: "Meaning" },
          { id: 3, name: "Example" },
          { id: 4, name: "Notes" },
        ],
        templates: [multiFieldTemplate1, multiFieldTemplate2],
      });

      // Create multiple notes with different content types
      const note1 = createNote(
        {
          noteTypeId: srsNoteType.id,
          deckId: srsDeck.id,
          fieldValues: [
            ["Word", "猫"],
            ["Pronunciation", "ねこ (neko)"],
            ["Meaning", "cat"],
            ["Example", "猫が好きです。(I like cats.)"],
            ["Notes", "Common animal word"],
          ],
        },
        srsNoteType,
      );

      const note2 = createNote(
        {
          noteTypeId: srsNoteType.id,
          deckId: srsDeck.id,
          fieldValues: [
            ["Word", "犬"],
            ["Pronunciation", "いぬ (inu)"],
            ["Meaning", "dog"],
            ["Example", "犬と散歩します。(I walk with the dog.)"],
            ["Notes", "Another common animal"],
          ],
        },
        srsNoteType,
      );

      // Create cards for both templates
      const card1 = createCard({
        noteId: note1.id,
        templateId: multiFieldTemplate1.id,
      });

      const card2 = createCard({
        noteId: note1.id,
        templateId: multiFieldTemplate2.id,
      });

      const card3 = createCard({
        noteId: note2.id,
        templateId: multiFieldTemplate1.id,
      });

      // Add some reviews with different scores
      const review1 = {
        id: `${card1.id}-${Date.now().toFixed()}`,
        cardId: card1.id,
        timestamp: Date.now() - 86400000, // 1 day ago
        score: SrsReviewScore.Again,
      };

      const review2 = {
        id: `${card2.id}-${(Date.now() + 1).toFixed()}`,
        cardId: card2.id,
        timestamp: Date.now() - 43200000, // 12 hours ago
        score: SrsReviewScore.Normal,
      };

      const review3 = {
        id: `${card3.id}-${(Date.now() + 2).toFixed()}`,
        cardId: card3.id,
        timestamp: Date.now() - 21600000, // 6 hours ago
        score: SrsReviewScore.Easy,
      };

      srsPackage.addDeck(srsDeck);
      srsPackage.addNoteType(srsNoteType);
      srsPackage.addNote(note1);
      srsPackage.addNote(note2);
      srsPackage.addCard(card1);
      srsPackage.addCard(card2);
      srsPackage.addCard(card3);
      srsPackage.addReview(review1);
      srsPackage.addReview(review2);
      srsPackage.addReview(review3);

      // Convert to Anki
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        // Convert back to SRS to verify all data types were preserved
        const convertedSrsResult = ankiPackage.toSrsPackage();
        const convertedSrs = expectSuccess(convertedSrsResult);

        // Verify decks
        const convertedDecks = convertedSrs.getDecks();
        expect(convertedDecks).toHaveLength(1);
        expect(convertedDecks[0]?.name).toBe("Comprehensive Test Deck");
        expect(convertedDecks[0]?.description).toBe("Testing all data type conversions");

        // Verify note types
        const convertedNoteTypes = convertedSrs.getNoteTypes();
        expect(convertedNoteTypes).toHaveLength(1);
        const noteType = convertedNoteTypes[0];
        expect(noteType?.name).toBe("Comprehensive Note Type");
        expect(noteType?.fields).toHaveLength(5);
        expect(noteType?.templates).toHaveLength(2);

        // Verify notes
        const convertedNotes = convertedSrs.getNotes();
        expect(convertedNotes).toHaveLength(2);

        // Verify field values are preserved
        const convertedNote1 = convertedNotes.find((n) =>
          n.fieldValues.some(([field, value]) => field === "Word" && value === "猫"),
        );
        expect(convertedNote1).toBeDefined();
        expect(convertedNote1?.fieldValues).toEqual([
          ["Word", "猫"],
          ["Pronunciation", "ねこ (neko)"],
          ["Meaning", "cat"],
          ["Example", "猫が好きです。(I like cats.)"],
          ["Notes", "Common animal word"],
        ]);

        // Verify cards
        const convertedCards = convertedSrs.getCards();
        expect(convertedCards).toHaveLength(3);

        // Verify reviews
        const convertedReviews = convertedSrs.getReviews();
        expect(convertedReviews).toHaveLength(3);

        // Check that review scores were preserved
        const reviewScores = convertedReviews.map((r) => r.score).sort();
        expect(reviewScores).toEqual(
          [SrsReviewScore.Again, SrsReviewScore.Normal, SrsReviewScore.Easy].sort(),
        );
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should handle conversion options parameter", async () => {
      // Create a basic SRS package for testing
      const { srsPackage } = createBasicSrsPackage();

      // Convert to Anki
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        // Test strict error handling option
        const strictResult = ankiPackage.toSrsPackage({
          errorHandling: "strict",
        });
        const strictSrs = expectSuccess(strictResult);
        expect(strictSrs.getDecks()).toHaveLength(1);

        // Test best-effort error handling option
        const bestEffortResult = ankiPackage.toSrsPackage({
          errorHandling: "best-effort",
        });
        const bestEffortSrs = expectSuccess(bestEffortResult);
        expect(bestEffortSrs.getDecks()).toHaveLength(1);
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should handle review conversion errors gracefully", async () => {
      // Create a basic SRS package first
      const { srsPackage } = createBasicSrsPackage();

      // Convert to Anki
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        // Manually corrupt the review data to trigger error handling
        const corruptedReview = {
          id: null, // This should cause an error during conversion
          cid: 1,
          usn: 0,
          ease: 2,
          ivl: 1,
          lastIvl: 0,
          factor: 2500,
          time: 5000,
          type: 0,
        };

        // Access the database contents and add a corrupted review
        (
          ankiPackage as unknown as { databaseContents: { reviews: unknown[] } }
        ).databaseContents.reviews.push(corruptedReview);

        // Convert back to SRS - this should trigger the error handling path
        const convertResult = ankiPackage.toSrsPackage();

        // The conversion should succeed with partial status due to error handling
        expectPartial(convertResult);

        // Verify that an error was reported
        const hasErrorIssue = convertResult.issues.some((issue) => issue.severity === "error");
        expect(hasErrorIssue).toBe(true);
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it.todo("should handle deck-to-note association logic", async () => {
      // TODO: Test the logic that associates notes with decks based on their cards
    });

    it("should preserve field ordering", async () => {
      // Create an SRS package with specific field ordering
      const srsPackage = new SrsPackage();

      const srsDeck = createDeck({
        name: "Field Order Test Deck",
        description: "Testing field ordering preservation",
      });

      // Create a note type with deliberately ordered fields
      const template = {
        id: 0,
        name: "Order Test",
        questionTemplate: "{{Field1}} {{Field2}} {{Field3}}",
        answerTemplate: "{{Field4}} {{Field5}} {{Field6}}",
      };

      const srsNoteType = createNoteType({
        name: "Field Order Test",
        fields: [
          { id: 0, name: "Field1" },
          { id: 1, name: "Field2" },
          { id: 2, name: "Field3" },
          { id: 3, name: "Field4" },
          { id: 4, name: "Field5" },
          { id: 5, name: "Field6" },
        ],
        templates: [template],
      });

      const srsNote = createNote(
        {
          noteTypeId: srsNoteType.id,
          deckId: srsDeck.id,
          fieldValues: [
            ["Field1", "Value1"],
            ["Field2", "Value2"],
            ["Field3", "Value3"],
            ["Field4", "Value4"],
            ["Field5", "Value5"],
            ["Field6", "Value6"],
          ],
        },
        srsNoteType,
      );

      const srsCard = createCard({
        noteId: srsNote.id,
        templateId: template.id,
      });

      srsPackage.addDeck(srsDeck);
      srsPackage.addNoteType(srsNoteType);
      srsPackage.addNote(srsNote);
      srsPackage.addCard(srsCard);

      // Convert SRS -> Anki -> SRS
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const convertedSrsResult = ankiPackage.toSrsPackage();
        const convertedSrs = expectSuccess(convertedSrsResult);

        // Verify field ordering is preserved
        const convertedNoteType = convertedSrs.getNoteTypes()[0];
        expect(convertedNoteType?.fields).toHaveLength(6);

        const fieldNames = convertedNoteType?.fields.map((f) => f.name);
        expect(fieldNames).toEqual(["Field1", "Field2", "Field3", "Field4", "Field5", "Field6"]);

        // Verify field values maintain their order
        const convertedNote = convertedSrs.getNotes()[0];
        expect(convertedNote?.fieldValues).toEqual([
          ["Field1", "Value1"],
          ["Field2", "Value2"],
          ["Field3", "Value3"],
          ["Field4", "Value4"],
          ["Field5", "Value5"],
          ["Field6", "Value6"],
        ]);

        // Also verify the Anki representation maintains order
        const ankiNoteType = ankiPackage.getNoteTypes()[0];
        expect(ankiNoteType?.flds).toHaveLength(6);

        // Check field order in Anki format
        const ankiFieldNames = ankiNoteType?.flds.map((f) => f.name);
        expect(ankiFieldNames).toEqual([
          "Field1",
          "Field2",
          "Field3",
          "Field4",
          "Field5",
          "Field6",
        ]);

        // Check that field indices are correct
        ankiNoteType?.flds.forEach((field, index) => {
          expect(field.ord).toBe(index);
        });
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it.todo("should map review scores correctly", async () => {
      // TODO: Test Ease → SrsReviewScore mapping
    });

    it.todo("should preserve application-specific data", async () => {
      // TODO: Test that custom data stored in application-specific fields is preserved
    });

    it.todo("should compress unused entities", async () => {
      // TODO: Test that unused note types, decks, etc. are removed after conversion
    });
  });

  describe("Deck conversion", () => {
    it.todo("should preserve deck names and descriptions", async () => {
      // TODO: Test preservation of deck metadata
    });

    it("should store original Anki IDs in applicationSpecificData", async () => {
      // Create SRS package manually
      const srsPackage = new SrsPackage();

      const deck = createDeck({ name: "Test Deck" });
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
      });
      srsPackage.addNoteType(noteType);

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

      // Create a card for the note
      const card = createCard({
        noteId: note.id,
        templateId: 0,
      });
      srsPackage.addCard(card);

      // Convert to Anki
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      // Get Anki IDs
      const ankiDecks = ankiPackage.getDecks();
      const ankiNoteTypes = ankiPackage.getNoteTypes();
      const ankiDeckId = ankiDecks[0]?.id;
      const ankiNoteTypeId = ankiNoteTypes[0]?.id;

      // Convert back to SRS
      const srsResult = ankiPackage.toSrsPackage();
      const srsPackage2 = expectSuccess(srsResult);
      const srsDecks = srsPackage2.getDecks();
      const srsNoteTypes = srsPackage2.getNoteTypes();

      // Find the "Test Deck" (not the default deck)
      const testDeck = srsDecks.find((d) => d.name === "Test Deck");
      const basicNoteType = srsNoteTypes.find((nt) => nt.name === "Basic");

      // Verify original Anki IDs are stored in applicationSpecificData
      expect(testDeck?.applicationSpecificData?.["originalAnkiId"]).toBe(ankiDeckId?.toFixed());
      expect(basicNoteType?.applicationSpecificData?.["originalAnkiId"]).toBe(
        ankiNoteTypeId?.toFixed(),
      );

      await ankiPackage.cleanup();
    });
  });

  describe("Note type conversion", () => {
    it.todo("should convert fields with correct indexing", async () => {
      // TODO: Test field index assignment
    });

    it.todo("should preserve field descriptions", async () => {
      // TODO: Test field description preservation
    });

    it.todo("should convert templates with proper ordering", async () => {
      // TODO: Test template order preservation
    });

    it.todo("should preserve template content", async () => {
      // TODO: Test template content preservation
    });

    it.todo("should handle missing template data", async () => {
      // TODO: Test behavior with incomplete template data
    });
  });

  describe("Note-to-deck association logic", () => {
    it.todo("should map notes to deck of first card", async () => {
      // TODO: Test the logic that assigns notes to decks based on first card
    });

    it.todo("should handle notes with multiple cards in different decks", async () => {
      // TODO: Test edge case where cards belong to different decks
    });

    it.todo("should handle notes without cards", async () => {
      // TODO: Test handling of orphaned notes
    });

    it.todo("should default to deck 1 when mapping fails", async () => {
      // TODO: Test fallback behavior
    });
  });

  describe("Note conversion", () => {
    it.todo("should split Anki field values correctly", async () => {
      // TODO: Test field value splitting logic
    });

    it.todo("should handle missing field values", async () => {
      // TODO: Test behavior with incomplete field data
    });

    it.todo("should preserve field ordering from note type", async () => {
      // TODO: Test field order preservation
    });

    it.todo("should store original Anki metadata", async () => {
      // TODO: Test preservation of original Anki note data
    });
  });

  describe("Card conversion", () => {
    it.todo("should preserve template associations", async () => {
      // TODO: Test template ID preservation
    });

    it.todo("should store original Anki card data", async () => {
      // TODO: Test preservation of Anki card metadata
    });

    it.todo("should handle cards without notes (warning case)", async () => {
      // TODO: Test warning handling for orphaned cards
    });
  });

  describe("Review conversion", () => {
    it.todo("should map all Ease values to SrsReviewScore", async () => {
      // TODO: Test all ease value mappings
    });

    it("should handle invalid ease values", async () => {
      // Create AnkiPackage from a basic SRS package
      const { srsPackage } = createBasicSrsPackage();
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      // Get the actual card ID from the converted package
      const cards = ankiPackage.getCards();
      const cardId = cards[0]?.id;

      // Add a review with invalid ease value (999, not in enum)
      if (cardId) {
        ankiPackage.addReview({
          id: Date.now(),
          cid: cardId,
          usn: 0,
          ease: 999 as unknown as Ease, // Invalid ease value (not 1, 2, 3, or 4)
          ivl: 1,
          lastIvl: 0,
          factor: 2500,
          time: 5000,
          type: 0,
        });
      }

      // Convert back to SRS and verify error handling
      const convertedSrsResult = ankiPackage.toSrsPackage();
      const convertedSrsPackage = expectPartial(convertedSrsResult);

      // Verify that the invalid review was handled properly
      expect(convertedSrsResult.issues).toHaveLength(1);
      expect(convertedSrsResult.issues[0]?.message).toMatch(/Unknown review score/);

      // Verify that the invalid review was not added
      expect(convertedSrsPackage.getReviews()).toHaveLength(0);
    });

    it("should handle null review IDs", async () => {
      // Create AnkiPackage from a basic SRS package
      const { srsPackage } = createBasicSrsPackage();
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      // Get the actual card ID from the converted package
      const cards = ankiPackage.getCards();
      const cardId = cards[0]?.id;

      // Add a review with null ID
      if (cardId) {
        ankiPackage.addReview({
          id: null, // Null review ID
          cid: cardId,
          usn: 0,
          ease: 3, // Valid ease value
          ivl: 1,
          lastIvl: 0,
          factor: 2500,
          time: 5000,
          type: 0,
        });
      }

      // Convert back to SRS and verify error handling
      const convertedSrsResult = ankiPackage.toSrsPackage();
      const convertedSrsPackage = expectPartial(convertedSrsResult);

      // Verify that the review with null ID was handled properly
      expect(convertedSrsResult.issues).toHaveLength(1);
      expect(convertedSrsResult.issues[0]?.message).toMatch(/Review ID is undefined/);

      // Verify that the review with null ID was not added
      expect(convertedSrsPackage.getReviews()).toHaveLength(0);
    });

    it("should map Ease.HARD to SrsReviewScore.Hard", async () => {
      // Create AnkiPackage from a basic SRS package
      const { srsPackage } = createBasicSrsPackage();
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      // Get the actual card ID from the converted package
      const cards = ankiPackage.getCards();
      const cardId = cards[0]?.id;

      if (cardId) {
        ankiPackage.addReview({
          id: Date.now(),
          cid: cardId,
          usn: 0,
          ease: 2, // Ease.HARD
          ivl: 1,
          lastIvl: 0,
          factor: 2500,
          time: 5000,
          type: 0,
        });
      }

      // Convert back to SRS and verify score mapping
      const convertedSrsResult = ankiPackage.toSrsPackage();
      const convertedSrsPackage = expectSuccess(convertedSrsResult);

      // Verify that the review was added with correct score
      expect(convertedSrsPackage.getReviews()).toHaveLength(1);
      expect(convertedSrsPackage.getReviews()[0]?.score).toBe(2); // SrsReviewScore.Hard
    });

    it("should handle reviews for non-existent cards", async () => {
      // Create AnkiPackage from a basic SRS package
      const { srsPackage } = createBasicSrsPackage();
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      // Add a review with a card ID that doesn't exist
      const nonExistentCardId = 999999; // Card ID that doesn't exist
      const reviewId = Date.now();

      ankiPackage.addReview({
        id: reviewId,
        cid: nonExistentCardId,
        usn: 0,
        ease: 3, // Valid ease value
        ivl: 1,
        lastIvl: 0,
        factor: 2500,
        time: 5000,
        type: 0,
      });

      // Convert back to SRS and verify error handling
      const convertedSrsResult = ankiPackage.toSrsPackage();
      const convertedSrsPackage = expectPartial(convertedSrsResult);

      // Verify that the review for non-existent card was handled properly
      expect(convertedSrsResult.issues).toHaveLength(1);
      expect(convertedSrsResult.issues[0]?.message).toMatch(/Card not found for Review ID/);

      // Verify that the review for non-existent card was not added
      expect(convertedSrsPackage.getReviews()).toHaveLength(0);
    });

    it.todo("should use Anki review ID as timestamp", async () => {
      // TODO: Test timestamp extraction from review IDs
    });

    it.todo("should handle cards without reviews", async () => {
      // TODO: Test handling of cards with no review history
    });
  });
});
