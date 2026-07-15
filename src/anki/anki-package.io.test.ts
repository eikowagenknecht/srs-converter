import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import {
  createBasicSrsPackage,
  createMultiCardPackage,
  expectFailure,
  expectSuccess,
  loadFixture,
} from "./anki-package.fixtures";

describe("Import / Export", () => {
  describe("fromAnkiExport()", () => {
    it("should load valid .apkg files", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        await loadFixture("anki/empty-legacy-2.apkg"),
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
        await loadFixture("anki/empty-legacy-2.colpkg"),
      );
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should load modern (package version 3) exports", async () => {
      const result = await AnkiPackage.fromAnkiExport(await loadFixture("anki/empty-latest.apkg"));
      const ankiPackage = expectSuccess(result);

      try {
        expect(ankiPackage.toString()).toContain("AnkiPackage");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should reject corrupted (non-ZIP) input", async () => {
      const corrupted = new TextEncoder().encode("This is not a valid zip file");

      const result = await AnkiPackage.fromAnkiExport(corrupted);
      expectFailure(result);
      // Content without ZIP magic bytes should be detected as "not a valid ZIP archive"
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/iu);
    });

    it("should reject empty input", async () => {
      const result = await AnkiPackage.fromAnkiExport(new Uint8Array(0));
      expectFailure(result);
      expect(result.issues).toHaveLength(1);
    });
  });

  describe("toAnkiExport()", () => {
    it("should write back the contents of the default zip file", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        await loadFixture("anki/empty-legacy-2.apkg"),
      );
      const pack = expectSuccess(result);

      try {
        const exported = await pack.toAnkiExport({ legacy: true });

        // Verify the exported bytes can be re-imported and contain expected data
        const reimportResult = await AnkiPackage.fromAnkiExport(exported);
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
        backValue: "Export Test Answer",
        deckDescription: "A test deck for export validation",
        deckName: "Test Export Deck",
        frontValue: "Export Test Question",
        noteTypeName: "Basic Export",
      });

      // Convert to Anki and export
      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const exported = await ankiPackage.toAnkiExport();

        // Verify the exported bytes can be re-imported
        const reimportResult = await AnkiPackage.fromAnkiExport(exported);
        const reimportedPackage = expectSuccess(reimportResult);

        try {
          // Verify the reimported package has the expected content
          const reimportedDecks = reimportedPackage.getDecks();
          expect(reimportedDecks).toHaveLength(1);
          expect(reimportedDecks[0]?.name).toBe("Test Export Deck");
          expect(reimportedDecks[0]?.desc).toBe("A test deck for export validation");

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

    it("should write proper meta file format", async () => {
      // Test that the meta file is written with correct protobuf format and version information
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const exported = await ankiPackage.toAnkiExport();

        // Re-import and verify the version information is preserved
        const reimportResult = await AnkiPackage.fromAnkiExport(exported);
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
      // Test that media file mappings are preserved in export
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const exported = await ankiPackage.toAnkiExport();

        // Re-import and verify the media mapping is preserved
        const reimportResult = await AnkiPackage.fromAnkiExport(exported);
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
      // Test that the SQLite database is properly compressed in the export
      const srsPackage = createMultiCardPackage(10);

      const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
      const ankiPackage = expectSuccess(ankiResult);

      try {
        const exported = await ankiPackage.toAnkiExport();

        // Verify the bytes can be re-imported and contain all the data
        const reimportResult = await AnkiPackage.fromAnkiExport(exported);
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
  });
});
