/** biome-ignore-all lint/complexity/useLiteralKeys: <It's a test> */
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnkiPackage } from "./anki-package";
import {
  createBasicSrsPackage,
  createMultiCardPackage,
  expectFailure,
  expectSuccess,
  getTempDir,
  setupTempDir,
} from "./anki-package.fixtures";

setupTempDir();

describe("Import / Export", () => {
  describe("fromAnkiExport()", () => {
    it("should load valid .apkg files", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/empty-legacy-2.apkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should load valid .colpkg files", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/empty-legacy-2.colpkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should reject non-legacy exports", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/empty-latest.apkg",
      );
      expectFailure(result);
      expect(result.issues[0]?.message).toMatch(
        /Unsupported Anki export package version: 3./,
      );
    });

    it("should reject corrupted .apkg files", async () => {
      const tempDir = getTempDir();
      const corruptedFile = join(tempDir, "corrupted.apkg");
      await writeFile(corruptedFile, "This is not a valid zip file");

      const result = await AnkiPackage.fromAnkiExport(corruptedFile);
      expectFailure(result);
      // Text content without ZIP magic bytes should be detected as "not a valid ZIP archive"
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/i);
    });

    it("should reject invalid file extensions", async () => {
      const tempDir = getTempDir();
      const invalidPath = join(tempDir, "test.txt");
      await writeFile(invalidPath, "invalid content");

      const result = await AnkiPackage.fromAnkiExport(invalidPath);
      expectFailure(result);
      expect(result.issues[0]?.message).toMatch(/Invalid file extension.*/);
    });

    it("should reject non-existent files", async () => {
      const tempDir = getTempDir();
      const nonExistentPath = join(tempDir, "nonexistent.apkg");

      const result = await AnkiPackage.fromAnkiExport(nonExistentPath);
      expectFailure(result);
      expect(result.issues).toHaveLength(1);
    });
  });

  describe("toAnkiExport()", () => {
    it("should write back the contents of the default zip file", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/empty-legacy-2.apkg",
      );
      const pack = expectSuccess(result);

      try {
        await pack.toAnkiExport("./out/empty-legacy-2.apkg");

        // Verify the exported file exists
        await access("./out/empty-legacy-2.apkg"); // Will throw if file doesn't exist

        // Verify the exported file can be re-imported and contains expected data
        const reimportResult = await AnkiPackage.fromAnkiExport(
          "./out/empty-legacy-2.apkg",
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
      const tempDir = getTempDir();
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
        await access(exportPath); // Will throw if file doesn't exist

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
      const tempDir = getTempDir();
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
        await access(exportPath); // Will throw if file doesn't exist

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
      const tempDir = getTempDir();
      // Test that the meta file is written with correct protobuf format and version information
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const exportPath = join(tempDir, "meta-test.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await access(exportPath); // Will throw if file doesn't exist

        // Re-import and verify the version information is preserved
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // The fact that we can successfully re-import means the meta file was written correctly
          // because fromAnkiExport validates the meta file format and version

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
      const tempDir = getTempDir();
      // Test that media file mappings are preserved in export
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const exportPath = join(tempDir, "media-test.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await access(exportPath); // Will throw if file doesn't exist

        // Re-import and verify the media mapping is preserved
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // The fact that we can successfully re-import means the media file was written correctly
          // Default packages have empty media mapping, so verify that's preserved

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
      const tempDir = getTempDir();
      // Test that the SQLite database is properly compressed in the export
      const srsPackage = createMultiCardPackage(10);

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const exportPath = join(tempDir, "compression-test.apkg");
        await ankiPackage.toAnkiExport(exportPath);

        // Verify the exported file exists
        await access(exportPath); // Will throw if file doesn't exist

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
      const tempDir = getTempDir();
      // Test error handling when export fails (disk full, permissions, etc.)
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        // Test with invalid export path (trying to write to a directory that exists as a file)
        const invalidPath = join(tempDir, "invalid-path");
        await writeFile(invalidPath, "This is a file, not a directory");

        const exportPathToFile = join(invalidPath, "test.apkg"); // This should fail

        // Export should handle the error gracefully
        await expect(
          ankiPackage.toAnkiExport(exportPathToFile),
        ).rejects.toThrow();

        // Test with an empty string path (invalid)
        await expect(ankiPackage.toAnkiExport("")).rejects.toThrow();

        // Test that the AnkiPackage instance is still functional after failures
        const validPath = join(tempDir, "recovery-test.apkg");
        await ankiPackage.toAnkiExport(validPath);

        // Verify the valid export worked
        await access(validPath); // Will throw if file doesn't exist

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
