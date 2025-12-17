/** biome-ignore-all lint/complexity/useLiteralKeys: <It's a test> */
import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnkiPackage } from "./anki-package";
import {
  createTestAnkiCard,
  createTestAnkiNote,
  createTestAnkiReview,
  createTimestampGenerator,
  expectSuccess,
  setupTempDir,
} from "./anki-package.fixtures";
import {
  basicAndReversedCardModel,
  basicModel,
  clozeModel,
  defaultDeck,
} from "./constants";
import type { Ease } from "./types";

setupTempDir();

describe("Create Deck", () => {
  it("should create valid Anki database directly using only Anki methods", async () => {
    const directOutputPath = join(
      process.cwd(),
      "out",
      "direct-anki-creation.apkg",
    );

    const getTimestamp = createTimestampGenerator();

    // Start with a fresh Anki package
    const ankiResult = await AnkiPackage.fromDefault();
    const ankiPackage = expectSuccess(ankiResult);

    try {
      // Add note types to the Anki package
      ankiPackage.addNoteType(basicModel);
      ankiPackage.addNoteType(basicAndReversedCardModel);
      ankiPackage.addNoteType(clozeModel);

      // Add a custom deck
      const customDeck = {
        ...defaultDeck,
        name: "Direct Anki Creation Deck",
        desc: "A test deck created by srs-converter, using it's Anki methods",
      };
      ankiPackage.addDeck(customDeck);

      // Create Basic note 1 with its card (new card)
      const basicNote1 = createTestAnkiNote(
        {
          noteTypeId: basicModel.id,
          fields: [
            "What is the largest planet in our solar system?",
            "Jupiter",
          ],
        },
        getTimestamp,
      );
      ankiPackage.addNote(basicNote1);

      const basicCard1 = createTestAnkiCard(
        { noteId: basicNote1.id, deckId: customDeck.id },
        getTimestamp,
      );
      ankiPackage.addCard(basicCard1);

      // Create Basic note 2 with learning card and review
      const basicNote2 = createTestAnkiNote(
        {
          noteTypeId: basicModel.id,
          fields: ["Who wrote '1984'?", "George Orwell"],
        },
        getTimestamp,
      );
      ankiPackage.addNote(basicNote2);

      const basicCard2 = createTestAnkiCard(
        {
          noteId: basicNote2.id,
          deckId: customDeck.id,
          type: 1, // Learning card
          queue: 1, // Learning queue
          due: Math.floor(Date.now() / 1000) + 600, // Due in 10 minutes
          reps: 1,
        },
        getTimestamp,
      );
      ankiPackage.addCard(basicCard2);

      ankiPackage.addReview(
        createTestAnkiReview(
          {
            id: getTimestamp(12), // 12 hours ago
            cardId: basicCard2.id,
            ease: 2 as Ease, // Hard
            interval: -600, // 10 minutes (negative for learning interval)
            time: 8000, // 8 seconds to answer
            type: 0, // Learning
          },
          getTimestamp,
        ),
      );

      // Create Bidirectional note with 2 cards and reviews
      const bidirectionalNote = createTestAnkiNote(
        {
          noteTypeId: basicAndReversedCardModel.id,
          fields: [
            "Photosynthesis",
            "The process by which plants convert sunlight into energy",
          ],
        },
        getTimestamp,
      );
      ankiPackage.addNote(bidirectionalNote);

      // Card 1: Front to back (review card)
      const bidirectionalCard1 = createTestAnkiCard(
        {
          noteId: bidirectionalNote.id,
          deckId: customDeck.id,
          templateIndex: 0,
          type: 2, // Review card
          queue: 2, // Review queue
          due: Math.floor(Date.now() / 1000 / 86400) + 3, // Due in 3 days
          interval: 7,
          reps: 2,
        },
        getTimestamp,
      );
      ankiPackage.addCard(bidirectionalCard1);

      ankiPackage.addReview(
        createTestAnkiReview(
          {
            id: getTimestamp(72), // 3 days ago
            cardId: bidirectionalCard1.id,
            ease: 3 as Ease, // Good
            interval: 1,
            time: 5500,
            type: 1, // Review
          },
          getTimestamp,
        ),
      );

      ankiPackage.addReview(
        createTestAnkiReview(
          {
            id: getTimestamp(48), // 2 days ago
            cardId: bidirectionalCard1.id,
            ease: 3 as Ease, // Good
            interval: 7,
            lastInterval: 1,
            time: 4200,
            type: 1, // Review
          },
          getTimestamp,
        ),
      );

      // Card 2: Back to front (review card)
      const bidirectionalCard2 = createTestAnkiCard(
        {
          noteId: bidirectionalNote.id,
          deckId: customDeck.id,
          templateIndex: 1,
          type: 2, // Review card
          queue: 2, // Review queue
          due: Math.floor(Date.now() / 1000 / 86400) + 5, // Due in 5 days
          interval: 14,
          factor: 2600,
          reps: 3,
        },
        getTimestamp,
      );
      ankiPackage.addCard(bidirectionalCard2);

      ankiPackage.addReview(
        createTestAnkiReview(
          {
            id: getTimestamp(36), // 1.5 days ago
            cardId: bidirectionalCard2.id,
            ease: 1 as Ease, // Again
            interval: -600, // Back to learning
            factor: 2300, // Factor decreased due to lapse
            time: 12000, // 12 seconds (struggled)
            type: 1, // Review
          },
          getTimestamp,
        ),
      );

      // Create Cloze note with 2 cards
      const clozeNote = createTestAnkiNote(
        {
          noteTypeId: clozeModel.id,
          fields: [
            "The {{c1::speed of light}} in vacuum is approximately {{c2::299,792,458}} meters per second.",
            "", // Second field for cloze notes
          ],
        },
        getTimestamp,
      );
      ankiPackage.addNote(clozeNote);

      // Cloze card 1: Learning card
      const clozeCard1 = createTestAnkiCard(
        {
          noteId: clozeNote.id,
          deckId: customDeck.id,
          templateIndex: 0, // c1: speed of light
          type: 1, // Learning
          queue: 1, // Learning queue
          due: Math.floor(Date.now() / 1000) + 1200, // Due in 20 minutes
          reps: 1,
        },
        getTimestamp,
      );
      ankiPackage.addCard(clozeCard1);

      ankiPackage.addReview(
        createTestAnkiReview(
          {
            id: getTimestamp(1), // 1 hour ago
            cardId: clozeCard1.id,
            ease: 2 as Ease, // Hard
            interval: -1200, // 20 minutes (learning)
            lastInterval: -600,
            time: 6800,
            type: 0, // Learning
          },
          getTimestamp,
        ),
      );

      // Cloze card 2: New card
      const clozeCard2 = createTestAnkiCard(
        {
          noteId: clozeNote.id,
          deckId: customDeck.id,
          templateIndex: 1, // c2: 299,792,458
          due: 2,
        },
        getTimestamp,
      );
      ankiPackage.addCard(clozeCard2);

      // Verify the Anki package structure
      const decks = ankiPackage.getDecks();
      expect(decks.length).toBe(1);

      const noteTypes = ankiPackage.getNoteTypes();
      expect(noteTypes.length).toBe(3); // Our 3 note types

      const notes = ankiPackage.getNotes();
      expect(notes.length).toBe(4); // Our 4 notes

      const cards = ankiPackage.getCards();
      expect(cards.length).toBe(6); // Our 6 cards

      const reviews = ankiPackage.getReviews();
      expect(reviews.length).toBe(5); // Our 5 reviews

      // Export to Anki file format
      await ankiPackage.toAnkiExport(directOutputPath);
      await access(directOutputPath); // Will throw if file doesn't exist

      // Test that the exported file can be imported back
      const reimportResult = await AnkiPackage.fromAnkiExport(directOutputPath);
      expect(reimportResult.status).toBe("success");
      if (!reimportResult.data) {
        throw new Error("Expected reimportResult.data to be defined");
      }
      const reimportedPackage = reimportResult.data;

      try {
        // Verify the reimported package maintains our data
        const reimportedDecks = reimportedPackage.getDecks();
        expect(reimportedDecks.length).toBe(1);

        const reimportedNoteTypes = reimportedPackage.getNoteTypes();
        expect(reimportedNoteTypes.length).toBe(3);

        const reimportedNotes = reimportedPackage.getNotes();
        expect(reimportedNotes.length).toBe(4);

        const reimportedCards = reimportedPackage.getCards();
        expect(reimportedCards.length).toBe(6);

        const reimportedReviews = reimportedPackage.getReviews();
        expect(reimportedReviews.length).toBe(5);

        // Verify specific content is preserved
        const customDeckFound = reimportedDecks.find(
          (d) => d.name === "Direct Anki Creation Deck",
        );
        expect(customDeckFound).toBeDefined();
        expect(customDeckFound?.desc).toBe(
          "A test deck created by srs-converter, using it's Anki methods",
        );

        // Verify note content
        const jupiterNote = reimportedNotes.find((n) =>
          n.flds.includes("Jupiter"),
        );
        expect(jupiterNote).toBeDefined();

        const clozeNoteFound = reimportedNotes.find((n) =>
          n.flds.includes("speed of light"),
        );
        expect(clozeNoteFound).toBeDefined();
      } finally {
        await reimportedPackage.cleanup();
      }

      console.log(`✅ Created Anki database directly at: ${directOutputPath}.`);
    } finally {
      await ankiPackage.cleanup();
    }
  }, 30000); // Increase timeout for comprehensive test
});

describe("Data Management", () => {
  describe("Add methods", () => {
    it.todo("should add items when database is available", async () => {
      // TODO: Test addDeck, addNote, addCard, addNoteType, addReview methods
    });

    it("should throw errors when database is unavailable", async () => {
      // Create a valid AnkiPackage first
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        // Clear the database contents to simulate an uninitialized state
        (
          ankiPackage as unknown as { databaseContents: undefined }
        ).databaseContents = undefined;

        // Test that all getter methods throw appropriate errors
        expect(() => ankiPackage.getNoteTypes()).toThrow(
          "Database contents not available",
        );
        expect(() => ankiPackage.getDecks()).toThrow(
          "Database contents not available",
        );
        expect(() => ankiPackage.getNotes()).toThrow(
          "Database contents not available",
        );
        expect(() => ankiPackage.getCards()).toThrow(
          "Database contents not available",
        );
        expect(() => ankiPackage.getReviews()).toThrow(
          "Database contents not available",
        );
        expect(() => ankiPackage.getConfig()).toThrow(
          "Database contents not available",
        );
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it.todo("should handle duplicate additions", async () => {
      // TODO: Test behavior when adding duplicate items
    });

    it.todo("should maintain referential integrity", async () => {
      // TODO: Test that relationships between entities are maintained
    });
  });

  describe("Utility methods", () => {
    it.todo("should cleanup() remove temporary directories", async () => {
      // TODO: Test that cleanup properly removes temp directories
    });

    it("should cleanup() handle cleanup failures", async () => {
      // Since we can't easily mock ESM exports, let's test error handling differently
      // by creating a scenario where cleanup actually fails due to permissions
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      let tempDirPath: string | undefined;
      let blockingFile: string | undefined;

      try {
        // First, get the temp directory path from toString output
        const packageString = pkg.toString();
        const tempDirRegex = /Temp directory: (.+)$/m;
        const tempDirMatch = tempDirRegex.exec(packageString);
        tempDirPath = tempDirMatch?.[1];

        if (tempDirPath) {
          // Create a file inside the temp directory to prevent removal
          const fs = await import("node:fs/promises");
          blockingFile = `${tempDirPath}/blocking-file`;
          await fs.writeFile(blockingFile, "test");

          // Make the file read-only to potentially cause cleanup issues
          try {
            await fs.chmod(blockingFile, 0o444);
          } catch {
            // chmod might fail in some environments, that's ok
          }
        }

        // Now cleanup might fail or succeed depending on the filesystem
        await pkg.cleanup();

        // The error should be handled gracefully if it occurs
        // This test primarily verifies that cleanup doesn't throw unhandled errors
      } finally {
        // Manual cleanup - we can't rely on pkg.cleanup() since it may have failed
        const fs = await import("node:fs/promises");

        if (tempDirPath) {
          // First, make any blocking files writable and remove them
          if (blockingFile) {
            try {
              await fs.chmod(blockingFile, 0o755);
              await fs.unlink(blockingFile);
            } catch {
              // File might already be removed or not exist
            }
          }

          // Then remove the entire temp directory - this must succeed
          await fs.rm(tempDirPath, { recursive: true, force: true });
        }
      }
    });

    it("should cleanup() return warning when directory removal fails", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      // Replace the temp directory with a non-existent path to trigger cleanup failure
      const nonExistentPath = "/non/existent/path/that/should/not/exist";
      (pkg as unknown as { tempDir: string }).tempDir = nonExistentPath;

      const cleanupIssues = await pkg.cleanup();

      expect(cleanupIssues).toHaveLength(1);
      expect(cleanupIssues[0]?.severity).toBe("warning");
      expect(cleanupIssues[0]?.message).toContain(
        "Could not clean up temporary files",
      );
      expect(cleanupIssues[0]?.message).toContain(
        "This does not affect your converted data",
      );
      expect(cleanupIssues[0]?.context?.originalData).toBeDefined();
    });

    it.todo("should toString() provide meaningful output", async () => {
      // TODO: Test that toString provides useful information about the package
    });
  });
});
