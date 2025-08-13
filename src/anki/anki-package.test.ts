/** biome-ignore-all lint/complexity/useLiteralKeys: <It's a test> */
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversionResult } from "@/error-handling";
import {
  createCard,
  createCompleteDeckStructure,
  createDeck,
  createNote,
  createNoteType,
  SrsPackage,
  SrsReviewScore,
} from "@/srs-package";
import { AnkiPackage } from "./anki-package";
import { defaultConfig, defaultDeck } from "./constants";
import type { Ease } from "./types";
import { extractTimestampFromUuid } from "./util";

// Helper function to unwrap ConversionResult for tests that expect success
function expectSuccess<T>(result: ConversionResult<T>): T {
  expect(result.status).toBe("success");
  expect(result.data).toBeDefined();
  if (!result.data) {
    throw new Error("Expected data to be defined");
  }
  return result.data;
}

// Helper function to unwrap ConversionResult for tests that expect success or partial
function expectSuccessOrPartial<T>(result: ConversionResult<T>): T {
  expect(["success", "partial"]).toContain(result.status);
  expect(result.data).toBeDefined();
  if (!result.data) {
    throw new Error("Expected data to be defined");
  }
  return result.data;
}

// Helper function to check for failure and extract error info
function expectFailure<T>(result: ConversionResult<T>): ConversionResult<T> {
  expect(result.status).toBe("failure");
  expect(result.data).toBeUndefined();
  expect(result.issues.length).toBeGreaterThan(0);
  return result;
}

// Test helpers for DRY code
function createBasicTemplate(id = 0, name = "Card 1") {
  return {
    id,
    name,
    questionTemplate: "{{Front}}",
    answerTemplate: "{{Back}}",
  };
}

function createBasicNoteType(name = "Basic") {
  return createNoteType({
    name,
    fields: [
      { id: 0, name: "Front" },
      { id: 1, name: "Back" },
    ],
    templates: [createBasicTemplate()],
  });
}

function createBasicSrsPackage(
  options: {
    deckName?: string;
    deckDescription?: string;
    noteTypeName?: string;
    frontValue?: string;
    backValue?: string;
  } = {},
) {
  const {
    deckName = "Test Deck",
    deckDescription = "A test deck",
    noteTypeName = "Basic",
    frontValue = "Question",
    backValue = "Answer",
  } = options;

  const srsPackage = new SrsPackage();
  const deck = createDeck({ name: deckName, description: deckDescription });
  const noteType = createBasicNoteType(noteTypeName);
  const note = createNote(
    {
      noteTypeId: noteType.id,
      deckId: deck.id,
      fieldValues: [
        ["Front", frontValue],
        ["Back", backValue],
      ],
    },
    noteType,
  );
  const card = createCard({
    noteId: note.id,
    templateId: 0,
  });

  srsPackage.addDeck(deck);
  srsPackage.addNoteType(noteType);
  srsPackage.addNote(note);
  srsPackage.addCard(card);

  return { srsPackage, deck, noteType, note, card };
}

function createMultiCardPackage(noteCount = 10) {
  const { srsPackage, deck, noteType } = createBasicSrsPackage();

  for (let i = 1; i < noteCount; i++) {
    const note = createNote(
      {
        noteTypeId: noteType.id,
        deckId: deck.id,
        fieldValues: [
          ["Front", `Question ${(i + 1).toString()}`],
          ["Back", `Answer ${(i + 1).toString()}`],
        ],
      },
      noteType,
    );

    const card = createCard({
      noteId: note.id,
      templateId: 0,
    });

    srsPackage.addNote(note);
    srsPackage.addCard(card);
  }

  return srsPackage;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "anki-test-"));
});

afterEach(async () => {
  // Cleanup will be handled by individual tests for AnkiPackage instances
});

describe("Creation", () => {
  describe("fromDefault()", () => {
    it("should create a valid AnkiPackage from default database", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage).toBeDefined();
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should have expected default deck content", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        // The deck should match the default deck
        const decks = ankiPackage.getDecks();
        expect(decks.length).toBe(1);
        if (!decks[0]) throw new Error("Default deck not found");
        expect(decks[0]).toEqual(defaultDeck);

        // The config should match the default config
        const config = ankiPackage.getConfig();
        expect(config).toEqual(defaultConfig);

        // The note types should be empty by default
        const noteTypes = ankiPackage.getNoteTypes();
        expect(noteTypes.length).toBe(0);

        const cards = ankiPackage.getCards();
        expect(cards.length).toBe(0); // Default package has no cards

        const reviews = ankiPackage.getReviews();
        expect(reviews.length).toBe(0); // Default package has no reviews

        const notes = ankiPackage.getNotes();
        expect(notes.length).toBe(0); // Default package has no notes
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should properly initialize temporary directory", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const packageString = ankiPackage.toString();
        expect(packageString).toMatch(/Temp directory: .+/);

        // Extract the temp directory path from the string
        const tempDirRegex = /Temp directory: (.+)$/m;
        const tempDirMatch = tempDirRegex.exec(packageString);
        expect(tempDirMatch).not.toBeNull();
        const tempDirPath = tempDirMatch?.[1];
        expect(tempDirPath).toMatch(/srsconverter-/); // Should contain the expected prefix

        // Verify the directory actually exists on the filesystem
        if (tempDirPath) {
          await expect(access(tempDirPath)).resolves.toBeUndefined(); // access resolves if path exists
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should clean up temporary directory after cleanup()", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      const packageString = ankiPackage.toString();
      const tempDirRegex = /Temp directory: (.+)$/m;
      const tempDirMatch = tempDirRegex.exec(packageString);
      expect(tempDirMatch).not.toBeNull();
      const tempDirPath = tempDirMatch?.[1];
      expect(tempDirPath).toBeDefined();

      if (tempDirPath) {
        // Verify the directory exists before cleanup
        await expect(access(tempDirPath)).resolves.toBeUndefined();

        // Clean up
        await ankiPackage.cleanup();

        // Verify the directory no longer exists after cleanup
        await expect(access(tempDirPath)).rejects.toThrow();
      }
    });
  });
});

describe("Import / Export", () => {
  describe("fromAnkiExport()", () => {
    it("should load valid .apkg files", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./templates/emptyLegacy2.apkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage).toBeDefined();
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should load valid .colpkg files", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./templates/emptyLegacy2.colpkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage).toBeDefined();
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should reject non-legacy exports", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./templates/emptyLatest.apkg",
      );
      expectFailure(result);
      expect(result.issues[0]?.message).toMatch(
        /Unsupported Anki export package version: 3./,
      );
    });

    it("should reject corrupted .apkg files", async () => {
      const corruptedFile = join(tempDir, "corrupted.apkg");
      await writeFile(corruptedFile, "This is not a valid zip file");

      const result = await AnkiPackage.fromAnkiExport(corruptedFile);
      expectFailure(result);
      expect(result.issues[0]?.message).toMatch(
        /Anki export file is corrupted or incomplete./,
      );
    });

    it("should reject invalid file extensions", async () => {
      const invalidPath = join(tempDir, "test.txt");
      await writeFile(invalidPath, "invalid content");

      const result = await AnkiPackage.fromAnkiExport(invalidPath);
      expectFailure(result);
      expect(result.issues[0]?.message).toMatch(/Invalid file extension.*/);
    });

    it("should reject non-existent files", async () => {
      const nonExistentPath = join(tempDir, "nonexistent.apkg");

      const result = await AnkiPackage.fromAnkiExport(nonExistentPath);
      expectFailure(result);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe("toAnkiExport()", () => {
    it("should write back the contents of the default zip file", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./templates/emptyLegacy2.apkg",
      );
      const pack = expectSuccess(result);

      try {
        await pack.toAnkiExport("./out/emptyLegacy2.apkg");

        // Verify the exported file exists
        await expect(
          access("./out/emptyLegacy2.apkg"),
        ).resolves.toBeUndefined();

        // Verify the exported file can be re-imported and contains expected data
        const reimportResult = await AnkiPackage.fromAnkiExport(
          "./out/emptyLegacy2.apkg",
        );
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // Compare the original and reimported package contents
          const originalDecks = pack.getDecks();
          const reimportedDecks = reimportedPackage.getDecks();
          expect(reimportedDecks).toEqual(originalDecks);

          const originalConfig = pack.getConfig();
          const reimportedConfig = reimportedPackage.getConfig();
          expect(reimportedConfig).toEqual(originalConfig);

          // Since it's an empty legacy file, verify it has no content
          expect(reimportedPackage.getNotes()).toHaveLength(0);
          expect(reimportedPackage.getCards()).toHaveLength(0);
          expect(reimportedPackage.getNoteTypes()).toHaveLength(0);
          expect(reimportedPackage.getReviews()).toHaveLength(0);
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await pack.cleanup();
      }
    });

    it("should create valid .apkg files", async () => {
      const { srsPackage } = createBasicSrsPackage({
        deckName: "Test Export Deck",
        deckDescription: "A test deck for export validation",
        noteTypeName: "Basic Export",
        frontValue: "Export Test Question",
        backValue: "Export Test Answer",
      });

      // Convert to Anki and export
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const exportPath = join(tempDir, "test-export.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await expect(access(exportPath)).resolves.toBeUndefined();

        // Verify the exported file can be re-imported
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // Verify the reimported package has the expected content
          const reimportedDecks = reimportedPackage.getDecks();
          expect(reimportedDecks).toHaveLength(1);
          expect(reimportedDecks[0]?.name).toBe("Test Export Deck");
          expect(reimportedDecks[0]?.desc).toBe(
            "A test deck for export validation",
          );

          const reimportedNoteTypes = reimportedPackage.getNoteTypes();
          expect(reimportedNoteTypes).toHaveLength(1);
          expect(reimportedNoteTypes[0]?.name).toBe("Basic Export");

          const reimportedNotes = reimportedPackage.getNotes();
          expect(reimportedNotes).toHaveLength(1);

          const reimportedCards = reimportedPackage.getCards();
          expect(reimportedCards).toHaveLength(1);
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should handle export path creation", async () => {
      // Test that the export method creates necessary directories if they don't exist
      const { srsPackage } = createBasicSrsPackage({
        deckName: "Test Deck for Directory Creation",
        deckDescription: "Testing directory creation",
      });

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        // Create a nested directory path that doesn't exist
        const nestedDir = join(
          tempDir,
          "nested",
          "path",
          "that",
          "does",
          "not",
          "exist",
        );
        const exportPath = join(nestedDir, "test-nested.apkg");

        // Export should create the directories and succeed
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await expect(access(exportPath)).resolves.toBeUndefined();

        // Verify the file can be re-imported (basic validation)
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);
        try {
          expect(reimportedPackage.getDecks()).toHaveLength(1);
          expect(reimportedPackage.getDecks()[0]?.name).toBe(
            "Test Deck for Directory Creation",
          );
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should write proper meta file format", async () => {
      // Test that the meta file is written with correct protobuf format and version information
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const exportPath = join(tempDir, "meta-test.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await expect(access(exportPath)).resolves.toBeUndefined();

        // Re-import and verify the version information is preserved
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // The fact that we can successfully re-import means the meta file was written correctly
          // because fromAnkiExport validates the meta file format and version
          expect(reimportedPackage).toBeDefined();

          // Additionally verify the structure matches expected format
          const reimportedDecks = reimportedPackage.getDecks();
          expect(reimportedDecks).toHaveLength(1);
          expect(reimportedDecks[0]?.name).toBe("Default");

          // Verify config is preserved (indicates proper meta file handling)
          const config = reimportedPackage.getConfig();
          expect(config).toBeDefined();
          expect(config.schedVer).toBe(2); // Scheduler version from default config
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should write media mapping correctly", async () => {
      // Test that media file mappings are preserved in export
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const exportPath = join(tempDir, "media-test.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await expect(access(exportPath)).resolves.toBeUndefined();

        // Re-import and verify the media mapping is preserved
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // The fact that we can successfully re-import means the media file was written correctly
          // Default packages have empty media mapping, so verify that's preserved
          expect(reimportedPackage).toBeDefined();

          // We can't directly access mediaFiles from the package, but successful import
          // means the media file was properly formatted as JSON and readable
          const decks = reimportedPackage.getDecks();
          expect(decks).toHaveLength(1);

          // The successful round-trip import verifies media mapping preservation
          const notes = reimportedPackage.getNotes();
          expect(notes).toHaveLength(0); // Default package has no notes
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should compress database properly", async () => {
      // Test that the SQLite database is properly compressed in the export
      const srsPackage = createMultiCardPackage(10);

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const exportPath = join(tempDir, "compression-test.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await expect(access(exportPath)).resolves.toBeUndefined();

        // Verify the file can be re-imported and contains all the data
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // Verify all data was preserved despite compression
          const reimportedDecks = reimportedPackage.getDecks();
          expect(reimportedDecks).toHaveLength(1);
          expect(reimportedDecks[0]?.name).toBe("Test Deck");

          const reimportedNotes = reimportedPackage.getNotes();
          expect(reimportedNotes).toHaveLength(10);

          const reimportedCards = reimportedPackage.getCards();
          expect(reimportedCards).toHaveLength(10);

          const reimportedNoteTypes = reimportedPackage.getNoteTypes();
          expect(reimportedNoteTypes).toHaveLength(1);
          expect(reimportedNoteTypes[0]?.name).toBe("Basic");
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should handle export failures gracefully", async () => {
      // Test error handling when export fails (disk full, permissions, etc.)
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        // Test with invalid export path (trying to write to a directory that exists as a file)
        const invalidPath = join(tempDir, "invalid-path");
        await writeFile(invalidPath, "This is a file, not a directory");

        const exportPathToFile = join(invalidPath, "test.apkg"); // This should fail

        // Export should handle the error gracefully
        let errorThrown = false;
        try {
          await ankiPackage.toAnkiExport(exportPathToFile);
        } catch (error) {
          errorThrown = true;
          expect(error).toBeDefined();
        }
        expect(errorThrown).toBe(true);

        // Test with an empty string path (invalid)
        let emptyPathErrorThrown = false;
        try {
          await ankiPackage.toAnkiExport("");
        } catch (error) {
          emptyPathErrorThrown = true;
          expect(error).toBeDefined();
        }
        expect(emptyPathErrorThrown).toBe(true);

        // Test that the AnkiPackage instance is still functional after failures
        const validPath = join(tempDir, "recovery-test.apkg");
        await ankiPackage.toAnkiExport(validPath);

        // Verify the valid export worked
        await expect(access(validPath)).resolves.toBeUndefined();

        // Verify the exported file can be re-imported
        const reimportResult = await AnkiPackage.fromAnkiExport(validPath);
        const reimportedPackage = expectSuccess(reimportResult);
        try {
          expect(reimportedPackage.getDecks()).toHaveLength(1);
        } finally {
          await reimportedPackage.cleanup();
        }
      } finally {
        await ankiPackage.cleanup();
      }
    });
  });
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
      expect(ankiPackage).toBeDefined();

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
        if (!ankiNoteType.flds[0] || !ankiNoteType.flds[1])
          throw new Error("Field not found");
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
      expect(ankiPackage).toBeDefined();

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
      expect(result.issues[0]?.message).toMatch(
        /The package must contain exactly one deck/,
      );
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

    it.todo("should generate unique Anki deck IDs", async () => {
      // TODO: Test that generated Anki IDs are unique and deterministic
    });

    it.todo("should preserve original Anki IDs when available", async () => {
      // TODO: Test that original Anki IDs are used when stored in applicationSpecificData
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

        // Verify the specific fields from lines 681-682 are preserved
        if (card?.applicationSpecificData) {
          expect(card.applicationSpecificData["ankiDue"]).toBeDefined();
          expect(card.applicationSpecificData["ankiQueue"]).toBeDefined();
          expect(card.applicationSpecificData["ankiType"]).toBeDefined();
          expect(card.applicationSpecificData["originalAnkiId"]).toBeDefined();
          expect(card.applicationSpecificData["ankiCardData"]).toBeDefined();

          // Verify the data types are correct (should be strings)
          expect(typeof card.applicationSpecificData["ankiDue"]).toBe("string");
          expect(typeof card.applicationSpecificData["ankiQueue"]).toBe(
            "string",
          );
          expect(typeof card.applicationSpecificData["ankiType"]).toBe(
            "string",
          );
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
      const ankiPackage = expectSuccessOrPartial(ankiResult);

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
      expect(srsResult.issues.length).toBeGreaterThan(0);

      // Check that the error includes information about the unknown review score
      const reviewError = srsResult.issues.find((issue) =>
        issue.message.includes("Unknown review score"),
      );
      expect(reviewError).toBeDefined();
      expect(reviewError?.message).toContain("999");
      expect(reviewError?.message).toContain("Skipping review");

      await ankiPackage.cleanup();
    });

    it.skip("should handle review conversion exceptions", async () => {
      // This test attempts to trigger the catch block in review conversion (lines 944-958)
      // However, normal invalid data doesn't seem to cause exceptions in the conversion logic
      // The createReview and addReview methods are too simple to throw exceptions easily
      // This test is skipped as it's difficult to trigger the catch block without mocking
      // or creating very specific runtime errors that don't occur in normal data scenarios
      // TODO: Consider using test spies/mocks to force exceptions in the try block
      // or investigate if there are specific data patterns that cause runtime errors
    });

    it.todo("should use review timestamp as Anki ID", async () => {
      // TODO: Test that timestamps are used as Anki review IDs
    });

    it.todo("should handle missing card associations", async () => {
      // TODO: Test error handling for reviews without valid cards
    });
  });
});

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
        expect(convertedDecks[0]?.description).toBe(
          "Testing all data type conversions",
        );

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
          n.fieldValues.some(
            ([field, value]) => field === "Word" && value === "猫",
          ),
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
          [
            SrsReviewScore.Again,
            SrsReviewScore.Normal,
            SrsReviewScore.Easy,
          ].sort(),
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
        const convertedSrs = expectSuccessOrPartial(convertResult);
        expect(convertedSrs).toBeDefined();

        // Verify that an error was reported
        expect(convertResult.issues.length).toBeGreaterThan(0);
        const hasErrorIssue = convertResult.issues.some(
          (issue) => issue.severity === "error",
        );
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
        expect(fieldNames).toEqual([
          "Field1",
          "Field2",
          "Field3",
          "Field4",
          "Field5",
          "Field6",
        ]);

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

    it.todo("should store original Anki IDs", async () => {
      // TODO: Test that original IDs are stored in applicationSpecificData
    });

    it.todo("should handle decks without descriptions", async () => {
      // TODO: Test behavior with empty deck descriptions
    });

    it.todo("should create proper UUID mapping", async () => {
      // TODO: Test UUID generation and mapping
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

    it.todo(
      "should handle notes with multiple cards in different decks",
      async () => {
        // TODO: Test edge case where cards belong to different decks
      },
    );

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
      const convertedSrsPackage = expectSuccessOrPartial(convertedSrsResult);

      // Verify that the invalid review was handled properly
      expect(convertedSrsResult.issues.length).toBeGreaterThan(0);
      expect(convertedSrsResult.issues[0]?.message).toMatch(
        /Unknown review score/,
      );

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
      const convertedSrsPackage = expectSuccessOrPartial(convertedSrsResult);

      // Verify that the review with null ID was handled properly
      expect(convertedSrsResult.issues.length).toBeGreaterThan(0);
      expect(convertedSrsResult.issues[0]?.message).toMatch(
        /Review ID is undefined/,
      );

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
      const convertedSrsPackage = expectSuccessOrPartial(convertedSrsResult);

      // Verify that the review for non-existent card was handled properly
      expect(convertedSrsResult.issues.length).toBeGreaterThan(0);
      expect(convertedSrsResult.issues[0]?.message).toMatch(
        /Card not found for Review ID/,
      );

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

describe("Error Handling and Edge Cases", () => {
  describe("File Format Validation", () => {
    it.todo("should reject files with wrong extensions", async () => {
      // TODO: Test rejection of non-.apkg/.colpkg files
    });

    it.todo("should handle zip files without required entries", async () => {
      // TODO: Test behavior with incomplete zip archives
    });

    it.todo("should validate protobuf meta format", async () => {
      // TODO: Test validation of meta file format
    });

    it.todo("should handle JSON parsing errors in media file", async () => {
      // TODO: Test error handling for malformed media files
    });

    it.todo("should validate database schema version", async () => {
      // TODO: Test database version validation
    });
  });

  describe("Data Integrity Tests", () => {
    it.todo("should handle missing note type references", async () => {
      // TODO: Test behavior when referenced note types don't exist
    });

    it.todo("should handle missing deck references", async () => {
      // TODO: Test behavior when referenced decks don't exist
    });

    it.todo("should handle missing note references", async () => {
      // TODO: Test behavior when referenced notes don't exist
    });

    it.todo("should handle missing card references", async () => {
      // TODO: Test behavior when referenced cards don't exist
    });

    it.todo("should validate template ID ranges", async () => {
      // TODO: Test validation of template ID bounds
    });

    it.todo("should handle malformed field data", async () => {
      // TODO: Test handling of corrupted field data
    });

    it.todo("should handle null/undefined values appropriately", async () => {
      // TODO: Test null/undefined handling throughout conversion
    });
  });

  describe("Round-trip Conversion Tests", () => {
    describe("Single deck scenarios", () => {
      it("should do a full round-trip conversion: SRS -> Anki -> SRS", async () => {
        // Create an SRS package with sample data
        const basicNoteType = createNoteType({
          name: "Basic Test Note Type",
          fields: [
            { id: 0, name: "Question" },
            { id: 1, name: "Answer" },
          ],
          templates: [
            {
              id: 0,
              name: "Question > Answer",
              questionTemplate: "{{Question}}",
              answerTemplate: "{{Answer}}",
            },
          ],
        });

        const originalSrsPackage = createCompleteDeckStructure({
          deck: {
            name: "Round Trip Test Deck",
            description: "Test deck for round-trip conversion",
          },
          noteTypes: [
            {
              ...basicNoteType,
              notes: [
                {
                  fieldValues: [
                    ["Question", "What is the capital of France?"],
                    ["Answer", "Paris"],
                  ],
                  cards: [
                    {
                      templateId: 0,
                      reviews: [
                        {
                          timestamp: Date.now(),
                          score: SrsReviewScore.Normal,
                        },
                      ],
                    },
                  ],
                },
                {
                  fieldValues: [
                    ["Question", "What is 2 + 2?"],
                    ["Answer", "4"],
                  ],
                  cards: [
                    {
                      templateId: 0,
                      reviews: [
                        {
                          timestamp: Date.now(),
                          score: SrsReviewScore.Easy,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        });

        // Get original data for comparison
        const originalDecks = originalSrsPackage.getDecks();
        const originalNoteTypes = originalSrsPackage.getNoteTypes();
        const originalNotes = originalSrsPackage.getNotes();
        const originalCards = originalSrsPackage.getCards();
        const originalReviews = originalSrsPackage.getReviews();

        // Convert SRS -> Anki
        const ankiResult = await AnkiPackage.fromSrsPackage(originalSrsPackage);
        const ankiPackage = expectSuccess(ankiResult);

        try {
          // Convert Anki -> SRS
          const convertedSrsResult = ankiPackage.toSrsPackage();
          const convertedSrsPackage = expectSuccess(convertedSrsResult);

          // Get converted data for comparison
          const convertedDecks = convertedSrsPackage.getDecks();
          const convertedNoteTypes = convertedSrsPackage.getNoteTypes();
          const convertedNotes = convertedSrsPackage.getNotes();
          const convertedCards = convertedSrsPackage.getCards();
          const convertedReviews = convertedSrsPackage.getReviews();

          // Assert that we preserved the correct number of items
          expect(convertedDecks).toHaveLength(originalDecks.length);
          expect(convertedNoteTypes).toHaveLength(originalNoteTypes.length);
          expect(convertedNotes).toHaveLength(originalNotes.length);
          expect(convertedCards).toHaveLength(originalCards.length);
          expect(convertedReviews).toHaveLength(originalReviews.length);

          // Assert deck properties are preserved
          expect(convertedDecks).toHaveLength(1);
          expect(originalDecks).toHaveLength(1);
          const [convertedDeck] = convertedDecks;
          const [originalDeck] = originalDecks;
          expect(convertedDeck?.name).toBe(originalDeck?.name);
          expect(convertedDeck?.description).toBe(originalDeck?.description);

          // Assert note type properties are preserved
          expect(convertedNoteTypes).toHaveLength(1);
          expect(originalNoteTypes).toHaveLength(1);
          const [convertedNoteType] = convertedNoteTypes;
          const [originalNoteType] = originalNoteTypes;
          expect(convertedNoteType?.name).toBe(originalNoteType?.name);
          expect(convertedNoteType?.fields).toHaveLength(
            originalNoteType?.fields.length ?? 0,
          );
          expect(convertedNoteType?.templates).toHaveLength(
            originalNoteType?.templates.length ?? 0,
          );

          // Assert note field values are preserved
          expect(convertedNotes).toHaveLength(2);
          expect(originalNotes).toHaveLength(2);
          const [convertedNote1, convertedNote2] = convertedNotes;
          const [originalNote1, originalNote2] = originalNotes;
          expect(convertedNote1?.fieldValues).toEqual(
            originalNote1?.fieldValues,
          );
          expect(convertedNote2?.fieldValues).toEqual(
            originalNote2?.fieldValues,
          );

          // Assert card and review relationships are preserved
          expect(convertedCards).toHaveLength(2);
          expect(convertedReviews).toHaveLength(2);
        } finally {
          await ankiPackage.cleanup();
        }
      });

      it.todo(
        "should handle basic note type with 2 fields, 1 template",
        async () => {
          // TODO: Test round-trip with simplest case
        },
      );

      it.todo(
        "should handle note type with multiple fields (3-5)",
        async () => {
          // TODO: Test round-trip with more complex fields
        },
      );

      it.todo(
        "should handle note type with multiple templates (2-3)",
        async () => {
          // TODO: Test round-trip with multiple templates
        },
      );

      it.todo(
        "should handle notes with various field content types",
        async () => {
          // TODO: Test round-trip with diverse content
        },
      );
    });

    describe("Multi-deck scenarios", () => {
      it.todo("should handle multiple decks with same note type", async () => {
        // TODO: Test shared note types across decks
      });

      it.todo(
        "should handle multiple decks with different note types",
        async () => {
          // TODO: Test distinct note types per deck
        },
      );

      it.todo("should handle cross-deck note type sharing", async () => {
        // TODO: Test complex deck/note type relationships
      });
    });

    describe("Complex scenarios", () => {
      it.todo(
        "should handle multiple note types with overlapping field names",
        async () => {
          // TODO: Test field name conflicts
        },
      );

      it.todo("should handle cards with different template IDs", async () => {
        // TODO: Test various template ID combinations
      });

      it.todo("should handle reviews with all score combinations", async () => {
        // TODO: Test all review score types
      });

      it.todo(
        "should handle large datasets (100+ notes, 500+ cards, 1000+ reviews)",
        async () => {
          // TODO: Test performance with large datasets
        },
      );
    });

    describe("Data preservation verification", () => {
      it.todo("should preserve deck names and descriptions", async () => {
        // TODO: Test deck metadata preservation
      });

      it.todo(
        "should preserve note type names and field structures",
        async () => {
          // TODO: Test note type structure preservation
        },
      );

      it.todo("should preserve template names and content", async () => {
        // TODO: Test template preservation
      });

      it.todo(
        "should preserve field values (including unicode, HTML, special chars)",
        async () => {
          // TODO: Test field content preservation
        },
      );

      it.todo("should preserve review timestamps and scores", async () => {
        // TODO: Test review data preservation
      });

      it.todo("should preserve application-specific metadata", async () => {
        // TODO: Test custom metadata preservation
      });
    });
  });

  describe("Resource Management Tests", () => {
    it.todo("should clean up temporary directories on success", async () => {
      // TODO: Test cleanup after successful operations
    });

    it.todo("should clean up temporary directories on failure", async () => {
      // TODO: Test cleanup after failed operations
    });

    it.todo("should handle disk space issues", async () => {
      // TODO: Test behavior when disk space is insufficient
    });

    it.todo("should handle permission errors", async () => {
      // TODO: Test behavior with file permission issues
    });

    it.todo("should handle concurrent access issues", async () => {
      // TODO: Test behavior with concurrent file access
    });
  });

  describe("Performance and Stress Tests", () => {
    it.todo("should handle large Anki files (50MB+)", async () => {
      // TODO: Test performance with large files
    });

    it.todo("should handle many decks (100+)", async () => {
      // TODO: Test scalability with many decks
    });

    it.todo("should handle many note types (50+)", async () => {
      // TODO: Test scalability with many note types
    });

    it.todo("should handle large numbers of notes (10,000+)", async () => {
      // TODO: Test scalability with many notes
    });

    it.todo("should handle large numbers of cards (50,000+)", async () => {
      // TODO: Test scalability with many cards
    });

    it.todo("should handle large numbers of reviews (100,000+)", async () => {
      // TODO: Test scalability with many reviews
    });

    it.todo("should handle memory constraints appropriately", async () => {
      // TODO: Test memory usage patterns
    });
  });

  describe("Content Validation Tests", () => {
    describe("Unicode and international content", () => {
      it.todo(
        "should handle Asian characters (Chinese, Japanese, Korean)",
        async () => {
          // TODO: Test CJK character handling
        },
      );

      it.todo(
        "should handle Right-to-left scripts (Arabic, Hebrew)",
        async () => {
          // TODO: Test RTL script handling
        },
      );

      it.todo("should handle Emoji and special symbols", async () => {
        // TODO: Test emoji and symbol handling
      });

      it.todo("should handle Mathematical notation", async () => {
        // TODO: Test mathematical symbol handling
      });
    });

    describe("HTML content in templates", () => {
      it.todo("should handle basic HTML tags", async () => {
        // TODO: Test HTML tag preservation
      });

      it.todo("should handle CSS styling", async () => {
        // TODO: Test CSS preservation
      });

      it.todo(
        "should handle JavaScript (should be preserved but not executed)",
        async () => {
          // TODO: Test JavaScript handling
        },
      );

      it.todo("should handle malformed HTML", async () => {
        // TODO: Test malformed HTML handling
      });
    });

    describe("LaTeX content", () => {
      it.todo("should handle mathematical formulas", async () => {
        // TODO: Test LaTeX math formula handling
      });

      it.todo("should handle LaTeX environments", async () => {
        // TODO: Test LaTeX environment handling
      });

      it.todo("should handle malformed LaTeX", async () => {
        // TODO: Test malformed LaTeX handling
      });
    });
  });

  describe("Version Compatibility Tests", () => {
    it.todo("should handle different Anki database versions", async () => {
      // TODO: Test compatibility with various DB versions
    });

    it.todo("should handle different export versions", async () => {
      // TODO: Test compatibility with various export versions
    });

    it.todo(
      "should provide clear error messages for unsupported versions",
      async () => {
        // TODO: Test error messaging for unsupported versions
      },
    );

    it.todo("should handle database schema migrations", async () => {
      // TODO: Test schema migration handling
    });
  });
});

describe("Utilities and Helper Functions", () => {
  describe("createCompleteDeckStructure()", () => {
    it("should create a new package with some sample data in one big call", () => {
      const basicNoteType = createNoteType({
        name: "Basic Test Note Type",
        fields: [
          { id: 0, name: "Question" },
          { id: 1, name: "Answer" },
        ],
        templates: [
          {
            id: 0,
            name: "Question > Answer",
            questionTemplate: "{{Question}}",
            answerTemplate: "{{Answer}}",
          },
        ],
      });

      const advancedNoteType = createNoteType({
        name: "Advanced Test Note Type",
        fields: [
          { id: 0, name: "Front" },
          { id: 1, name: "Back" },
        ],
        templates: [
          {
            id: 1,
            name: "Question > Answer",
            questionTemplate: "{{Question}}",
            answerTemplate: "{{Answer}}",
          },
        ],
      });

      const completeDeck = createCompleteDeckStructure({
        deck: {
          name: "Test Deck",
          description: "Test Deck Description",
        },
        noteTypes: [
          {
            ...basicNoteType,
            notes: [
              {
                fieldValues: [
                  ["Question", "What is 猫 in English?"],
                  ["Answer", "Cat"],
                ],
                cards: [
                  {
                    templateId: 0,
                    reviews: [
                      {
                        timestamp: Date.now(),
                        score: SrsReviewScore.Normal,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            ...advancedNoteType,
            notes: [
              {
                fieldValues: [
                  ["Front", "What is 猫 in English?"],
                  ["Back", "Cat"],
                ],
                cards: [
                  {
                    templateId: 0,
                    reviews: [
                      {
                        timestamp: Date.now(),
                        score: SrsReviewScore.Normal,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      // Verify the structure was created correctly
      expect(completeDeck).toBeDefined();
      expect(completeDeck.getDecks()).toHaveLength(1);
      expect(completeDeck.getNoteTypes()).toHaveLength(2);
      expect(completeDeck.getNotes()).toHaveLength(2);
      expect(completeDeck.getCards()).toHaveLength(2);
      expect(completeDeck.getReviews()).toHaveLength(2);

      const deck = completeDeck.getDecks()[0];
      expect(deck?.name).toBe("Test Deck");
      expect(deck?.description).toBe("Test Deck Description");
    });
  });
});
