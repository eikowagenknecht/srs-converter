import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import {
  createAnkiDatabaseWithData,
  createTestZipBytes,
  getValidAnkiDatabaseBuffer,
  validMetaV2,
} from "./anki-package.fixtures";

describe("Error Handling and Edge Cases", () => {
  describe("File Format Validation", () => {
    it.todo("should handle zip files without required entries", async () => {
      // TODO: Test behavior with incomplete zip archives
    });

    it.todo("should handle JSON parsing errors in media file", async () => {
      // TODO: Test error handling for malformed media files
    });

    it.todo("should validate database schema version", async () => {
      // TODO: Test database version validation
    });
  });

  describe("Corrupted ZIP Archive Handling", () => {
    it("should detect and report truncated ZIP files with specific message", async () => {
      // Truncated ZIP: valid ZIP header (PK\x03\x04) but incomplete
      const truncatedContent = Uint8Array.of(
        0x50,
        0x4b,
        0x03,
        0x04, // ZIP signature
        0x14,
        0x00, // Version needed
        0x00,
        0x00, // General purpose flags
        0x08,
        0x00, // Compression method (deflate)
        // Truncated - missing rest of header and data
      );

      const result = await AnkiPackage.fromAnkiExport(truncatedContent);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Specific message for truncated ZIP (has ZIP magic bytes)
      expect(result.issues[0]?.message).toMatch(/ZIP archive is truncated/iu);
      expect(result.issues[0]?.message).toMatch(/re-download|re-export/iu);
    });

    it("should detect and report non-ZIP files with specific message", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        new TextEncoder().encode("This is not a ZIP file, just plain text content."),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Specific message for non-ZIP files (no ZIP magic bytes)
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/iu);
      expect(result.issues[0]?.message).toMatch(/exported from Anki/iu);
    });

    it("should detect and report empty files with specific message", async () => {
      const result = await AnkiPackage.fromAnkiExport(new Uint8Array(0));

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Specific message for empty files
      expect(result.issues[0]?.message).toMatch(/empty \(0 bytes\)/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should detect and report random binary data as invalid ZIP", async () => {
      // Random binary data with no ZIP magic bytes
      const randomBytes = Uint8Array.from([
        0x00,
        0x01,
        0x02,
        0x03, // Not PK\x03\x04
        ...Array.from({ length: 1020 }, () => Math.floor(Math.random() * 256)),
      ]);

      const result = await AnkiPackage.fromAnkiExport(randomBytes);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Random binary without ZIP magic should be detected as "not a valid ZIP"
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/iu);
    });

    it("should provide actionable error messages with guidance", async () => {
      const result = await AnkiPackage.fromAnkiExport(new TextEncoder().encode("Not a ZIP file"));

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.message).toBeTruthy();
      // Error message should be descriptive and help user understand the issue
      const message = result.issues[0]?.message ?? "";
      expect(message.length).toBeGreaterThan(50); // Should be a meaningful, actionable message
      // Should mention Anki for context
      expect(message).toMatch(/Anki/iu);
    });
  });

  describe("Missing Required Files Handling", () => {
    it("should treat a package without 'meta' but with collection.anki21 as Legacy 2", async () => {
      // Anki's own detection falls back to file presence when `meta` is
      // absent — the package must proceed to database validation, not fail
      // on the missing meta file.
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: "{}", name: "media" },
          { content: new Uint8Array(100), name: "collection.anki21" }, // Dummy database
        ]),
      );

      // The dummy database is not valid SQLite, so the failure must come
      // from database validation — proving detection accepted the package.
      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/not a valid SQLite database/iu);
    });

    it("should read a package without 'meta' successfully when the database is valid", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: "{}", name: "media" },
          { content: await getValidAnkiDatabaseBuffer(), name: "collection.anki21" },
        ]),
      );

      expect(result.data).toBeDefined();
      expect(result.issues.filter((issue) => issue.severity === "critical")).toHaveLength(0);
    });

    it("should detect and report missing media file with specific message", async () => {
      // ZIP with valid meta and database, but no media file
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: new Uint8Array(100), name: "collection.anki21" }, // Dummy database
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/missing.*'media'/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should detect and report missing database file with specific message", async () => {
      // ZIP with valid meta and media, but no database file
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/missing.*'collection\.anki21'/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should report all missing files when multiple are missing", async () => {
      // ZIP with only valid meta, missing media and database
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([{ content: validMetaV2, name: "meta" }]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      // Should have multiple critical issues for each missing file
      const criticalIssues = result.issues.filter((issue) => issue.severity === "critical");
      expect(criticalIssues.length).toBeGreaterThanOrEqual(2);
      // Check that both media and database are mentioned
      const allMessages = criticalIssues.map((i) => i.message).join(" ");
      expect(allMessages).toMatch(/media/iu);
      expect(allMessages).toMatch(/collection\.anki21/iu);
    });

    it("should detect empty ZIP archive and report it is not a valid Anki export", async () => {
      // An empty ZIP archive
      const result = await AnkiPackage.fromAnkiExport(createTestZipBytes([]));

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      // No meta file and no collection database → rejected during detection
      const criticalIssues = result.issues.filter((issue) => issue.severity === "critical");
      expect(criticalIssues.length).toBeGreaterThanOrEqual(1);
      expect(criticalIssues[0]?.message).toMatch(/meta/iu);
      expect(criticalIssues[0]?.message).toMatch(/collection database/iu);
    });

    it("should provide actionable guidance for missing files", async () => {
      // ZIP with valid meta and database, but missing media file
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: new Uint8Array(100), name: "collection.anki21" },
          // Missing media file
        ]),
      );

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message
      expect(message.length).toBeGreaterThan(50);
      // Should mention Anki for context
      expect(message).toMatch(/Anki/iu);
      // Should provide guidance to re-export
      expect(message).toMatch(/re-export/iu);
    });
  });

  describe("Corrupted SQLite Database Handling", () => {
    it("should detect and report corrupted database file (random bytes) with specific message", async () => {
      // Database file with random bytes (not valid SQLite)
      const randomBytes = Uint8Array.from(
        Array.from({ length: 100 }, () => Math.floor(Math.random() * 256)),
      );

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: randomBytes, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect invalid SQLite header and provide guidance
      expect(result.issues[0]?.message).toMatch(/not a valid SQLite database.*re-export/isu);
    });

    it("should detect and report empty database file with specific message", async () => {
      // An empty database file (0 bytes)
      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: new Uint8Array(0), name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect empty database and provide guidance
      expect(result.issues[0]?.message).toMatch(/empty.*0 bytes.*re-export/isu);
    });

    it("should detect and report truncated database file with specific message", async () => {
      // Truncated database file (valid SQLite header but too short)
      // SQLite header is "SQLite format 3\0" (16 bytes)
      const header = new TextEncoder().encode("SQLite format 3\0");
      // Add just a few more bytes to make it seem truncated
      const truncatedContent = new Uint8Array(header.length + 10);
      truncatedContent.set(header);

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: truncatedContent, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Truncated files with valid header may open but have no tables
      expect(result.issues[0]?.message).toMatch(/missing required tables.*re-export/isu);
    });

    it("should detect and report database with missing required tables", async () => {
      // Create a valid SQLite database but without Anki's required tables
      const sqlJsModule = await import("sql.js");
      const InitSqlJs = sqlJsModule.default;
      const SQL = await InitSqlJs();
      const emptyDb = new SQL.Database();
      // Create a simple table that is NOT an Anki table
      emptyDb.run("CREATE TABLE dummy (id INTEGER PRIMARY KEY, name TEXT)");
      const dbBuffer = emptyDb.export();

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: dbBuffer, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should report missing required tables with specific table names and guidance
      expect(result.issues[0]?.message).toMatch(
        /missing required tables.*(?<tableName>col|notes|cards|revlog|graves).*re-export/isu,
      );
    });

    it("should detect database file that is too small to be valid SQLite", async () => {
      // A file that's smaller than the SQLite header (16 bytes)
      const tinyContent = new TextEncoder().encode("SQLite"); // Only 6 bytes

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: tinyContent, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect file is too small and provide guidance
      expect(result.issues[0]?.message).toMatch(/truncated.*too small.*re-export/isu);
    });

    it("should provide actionable guidance for corrupted database", async () => {
      // Database file with invalid content
      const invalidContent = new TextEncoder().encode("This is not a database file!");

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: invalidContent, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message mentioning Anki and re-export
      expect(message.length).toBeGreaterThan(50);
      expect(message).toMatch(/Anki.*re-export/isu);
    });
  });

  describe("Invalid JSON in Media Metadata Handling", () => {
    it("should detect and report malformed JSON syntax in media file", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Media file with invalid JSON syntax
      const malformedJson = '{ "0": "image.png", "1": }'; // Missing value

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: malformedJson, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid JSON.*cannot be parsed/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should detect and report wrong JSON structure (array instead of object)", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Media file with array instead of object
      const arrayJson = '["image.png", "audio.mp3"]';

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: arrayJson, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid structure.*array/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should handle empty media file gracefully (valid case - no media)", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Empty media file (0 bytes)
      const emptyContent = "";

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: emptyContent, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      // Should succeed - empty media file is valid
      expect(result.status).toBe("success");
      expect(result.data).toBeDefined();
      if (result.data === undefined) {
        throw new Error("Expected data");
      }
      const mediaFiles = result.data.listMediaFiles();
      expect(mediaFiles).toHaveLength(0);
    });

    it("should handle valid empty JSON object {} (no media)", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Media file with empty JSON object
      const emptyObjectJson = "{}";

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: emptyObjectJson, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      // Should succeed - empty object is valid
      expect(result.status).toBe("success");
      expect(result.data).toBeDefined();
      if (result.data === undefined) {
        throw new Error("Expected data");
      }
      const mediaFiles = result.data.listMediaFiles();
      expect(mediaFiles).toHaveLength(0);
    });

    it("should detect invalid value type in media mapping (number instead of string)", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Media file with number value instead of string
      const invalidValueJson = '{ "0": 12345 }';

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: invalidValueJson, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid entry.*number.*instead of.*string/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should detect null value in media mapping", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Media file with null value
      const nullValueJson = '{ "0": null }';

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: nullValueJson, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid entry.*null.*instead of.*string/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should provide actionable guidance for invalid media JSON", async () => {
      const validDb = await getValidAnkiDatabaseBuffer();
      // Media file with invalid JSON
      const brokenJson = "not valid json at all {{{";

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: brokenJson, name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
      );

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message mentioning Anki and re-export
      expect(message.length).toBeGreaterThan(50);
      expect(message).toMatch(/re-export.*Anki/isu);
    });
  });

  describe("Partial Data Recovery", () => {
    it("should return partial status with valid and invalid notes (best-effort mode)", async () => {
      // Create database with 2 valid notes and 1 note referencing non-existent note type
      const validDb = await createAnkiDatabaseWithData({
        cards: [
          { did: 1, id: 100, nid: 1000 }, // Valid card for valid note
          { did: 1, id: 200, nid: 2000 }, // Valid card for valid note
          { did: 1, id: 300, nid: 3000 }, // Card for invalid note (should be skipped)
        ],
        notes: [
          {
            id: 1000,
            guid: "valid1",
            mid: 1_234_567_890_123, // Valid note type
            flds: "Front 1Back 1",
          },
          {
            id: 2000,
            guid: "valid2",
            mid: 1_234_567_890_123, // Valid note type
            flds: "Front 2Back 2",
          },
          {
            id: 3000,
            guid: "invalid",
            mid: 9_999_999_999_999, // Non-existent note type
            flds: "InvalidNote",
          },
        ],
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
        {
          errorHandling: "best-effort",
        },
      );

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();
      expect(result.issues.length).toBeGreaterThan(0);

      // Verify invalid note is reported
      const noteIssue = result.issues.find((i) => i.context?.itemType === "note");
      expect(noteIssue).toBeDefined();
      expect(noteIssue?.severity).toBe("error");
      expect(noteIssue?.message).toMatch(/Note.*invalid/iu);

      // Verify card for invalid note is also skipped
      const cardIssue = result.issues.find((i) => i.context?.itemType === "card");
      expect(cardIssue).toBeDefined();
      expect(cardIssue?.severity).toBe("error");

      // Verify we still have the valid data
      if (result.data) {
        expect(result.data.getNotes().length).toBe(2); // Only valid notes
        expect(result.data.getCards().length).toBe(2); // Only valid cards
      }
    });

    it("should return failure status in strict mode with recoverable errors", async () => {
      // Create database with a note referencing non-existent note type
      const validDb = await createAnkiDatabaseWithData({
        cards: [{ did: 1, id: 100, nid: 1000 }],
        notes: [
          {
            flds: "FrontBack",
            guid: "valid",
            id: 1000,
            mid: 1_234_567_890_123,
          },
          {
            id: 2000,
            guid: "invalid",
            mid: 9_999_999_999_999, // Non-existent note type
            flds: "InvalidNote",
          },
        ],
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
        {
          errorHandling: "strict",
        },
      );

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);

      // Verify error is reported
      const noteIssue = result.issues.find((i) => i.context?.itemType === "note");
      expect(noteIssue).toBeDefined();
      expect(noteIssue?.severity).toBe("error");
    });

    it("should skip cards referencing non-existent decks", async () => {
      // Create database with card referencing non-existent deck
      const validDb = await createAnkiDatabaseWithData({
        cards: [
          { did: 1, id: 100, nid: 1000 }, // Valid deck
          { did: 99_999, id: 200, nid: 1000 }, // Non-existent deck
        ],
        notes: [
          {
            flds: "FrontBack",
            guid: "note1",
            id: 1000,
            mid: 1_234_567_890_123,
          },
        ],
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
        {
          errorHandling: "best-effort",
        },
      );

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Verify card error is reported
      const cardIssue = result.issues.find(
        (i) => i.context?.itemType === "card" && i.message.includes("non-existent"),
      );
      expect(cardIssue).toBeDefined();
      expect(cardIssue?.message).toMatch(/deck/iu);

      // Verify only valid card remains
      if (result.data) {
        expect(result.data.getCards().length).toBe(1);
      }
    });

    it("should skip reviews referencing non-existent cards", async () => {
      // Create database with review referencing non-existent card
      const validDb = await createAnkiDatabaseWithData({
        cards: [{ did: 1, id: 100, nid: 1000 }],
        notes: [
          {
            flds: "FrontBack",
            guid: "note1",
            id: 1000,
            mid: 1_234_567_890_123,
          },
        ],
        reviews: [
          { cid: 100, id: 1001 }, // Valid card reference
          { cid: 99_999, id: 1002 }, // Non-existent card
        ],
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
        {
          errorHandling: "best-effort",
        },
      );

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Verify review error is reported
      const reviewIssue = result.issues.find((i) => i.context?.itemType === "review");
      expect(reviewIssue).toBeDefined();
      expect(reviewIssue?.message).toMatch(/non-existent card/iu);

      // Verify only valid review remains
      if (result.data) {
        expect(result.data.getReviews().length).toBe(1);
      }
    });

    it("should report all issues in the result", async () => {
      // Create database with multiple types of issues
      const validDb = await createAnkiDatabaseWithData({
        cards: [
          { did: 1, id: 100, nid: 1000 },
          { did: 1, id: 200, nid: 2000 }, // Will be orphaned when note is skipped
          { did: 77_777, id: 300, nid: 1000 }, // Non-existent deck
        ],
        notes: [
          {
            flds: "FrontBack",
            guid: "valid",
            id: 1000,
            mid: 1_234_567_890_123,
          },
          {
            flds: "BadNote",
            guid: "invalid-model",
            id: 2000,
            mid: 8_888_888_888_888,
          },
        ],
        reviews: [
          { cid: 100, id: 1001 },
          { cid: 300, id: 1002 }, // Will be orphaned when card is skipped
          { cid: 66_666, id: 1003 }, // Non-existent card
        ],
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
        {
          errorHandling: "best-effort",
        },
      );

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Should have multiple issues reported
      expect(result.issues.length).toBeGreaterThanOrEqual(3);

      // Verify different item types are in issues
      const itemTypes = result.issues.map((i) => i.context?.itemType).filter(Boolean);
      expect(itemTypes).toContain("note");
      expect(itemTypes).toContain("card");
      expect(itemTypes).toContain("review");
    });

    it("should warn about missing media files", async () => {
      // Create a valid database
      const validDb = await createAnkiDatabaseWithData({});

      // Create media mapping that references files that don't exist in the zip
      const mediaMapping = JSON.stringify({
        "0": "image.png",
        "1": "audio.mp3",
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: mediaMapping, name: "media" },
          { content: validDb, name: "collection.anki21" },
          // Note: NOT including the actual media files "0" and "1"
        ]),
        {
          errorHandling: "best-effort",
        },
      );

      // Should succeed (missing media is just a warning)
      expect(["success", "partial"]).toContain(result.status);
      expect(result.data).toBeDefined();

      // Should have warnings about missing media files
      const mediaWarnings = result.issues.filter(
        (i) => i.context?.itemType === "media" && i.severity === "warning",
      );
      expect(mediaWarnings.length).toBe(2);
      expect(mediaWarnings[0]?.message).toMatch(/image\.png/u);
      expect(mediaWarnings[1]?.message).toMatch(/audio\.mp3/u);
    });

    it("should return success when there are no issues", async () => {
      // Create a completely valid database
      const validDb = await createAnkiDatabaseWithData({
        cards: [{ did: 1, id: 100, nid: 1000 }],
        notes: [
          {
            flds: "Front 1Back 1",
            guid: "note1",
            id: 1000,
            mid: 1_234_567_890_123,
          },
        ],
        reviews: [{ cid: 100, id: 1001 }],
      });

      const result = await AnkiPackage.fromAnkiExport(
        createTestZipBytes([
          { content: validMetaV2, name: "meta" },
          { content: "{}", name: "media" },
          { content: validDb, name: "collection.anki21" },
        ]),
        {
          errorHandling: "best-effort",
        },
      );

      expect(result.status).toBe("success");
      expect(result.data).toBeDefined();
      expect(result.issues.length).toBe(0);
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
      it.todo("should handle Asian characters (Chinese, Japanese, Korean)", async () => {
        // TODO: Test CJK character handling
      });

      it.todo("should handle Right-to-left scripts (Arabic, Hebrew)", async () => {
        // TODO: Test RTL script handling
      });

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

      it.todo("should handle JavaScript (should be preserved but not executed)", async () => {
        // TODO: Test JavaScript handling
      });

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

    it.todo("should handle database schema migrations", async () => {
      // TODO: Test schema migration handling
    });

    async function detectVersionOf(files: { content: string | Uint8Array; name: string }[]) {
      return await AnkiPackage.fromAnkiExport(createTestZipBytes(files));
    }

    it("should report a modern package whose database is not valid zstd", async () => {
      // Protobuf meta: field 1 (varint) = 3, but the database is garbage
      const result = await detectVersionOf([
        { content: Uint8Array.of(0x08, 0x03), name: "meta" },
        { content: "{}", name: "media" },
        { content: new Uint8Array(100), name: "collection.anki21b" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/could not be decompressed/iu);
      expect(result.issues[0]?.message).toMatch(/re-export/iu);
    });

    it("should report a modern package missing its database", async () => {
      const result = await detectVersionOf([
        { content: Uint8Array.of(0x08, 0x03), name: "meta" },
        { content: "{}", name: "media" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/missing.*collection\.anki21b/iu);
    });

    it("should reject Legacy 1 exports (meta version 1) with re-export guidance", async () => {
      const result = await detectVersionOf([
        { content: Uint8Array.of(0x08, 0x01), name: "meta" },
        { content: "{}", name: "media" },
        { content: new Uint8Array(100), name: "collection.anki2" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/Legacy 1/u);
      expect(result.issues[0]?.message).toMatch(/collection\.anki2/u);
    });

    it("should detect Legacy 1 via file presence when 'meta' is absent", async () => {
      const result = await detectVersionOf([
        { content: "{}", name: "media" },
        { content: new Uint8Array(100), name: "collection.anki2" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/Legacy 1/u);
    });

    it("should report unrecognized future versions with the version number", async () => {
      // Protobuf meta: field 1 (varint) = 99
      const result = await detectVersionOf([
        { content: Uint8Array.of(0x08, 0x63), name: "meta" },
        { content: "{}", name: "media" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/Unrecognized Anki package version: 99/u);
    });

    it("should treat an explicit version 0 as unrecognized", async () => {
      const result = await detectVersionOf([
        { content: Uint8Array.of(0x08, 0x00), name: "meta" },
        { content: "{}", name: "media" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/Unrecognized Anki package version: 0/u);
    });

    it("should report an unparsable 'meta' file as corrupted", async () => {
      // 0xff opens a varint that never terminates — invalid wire data
      const result = await detectVersionOf([
        { content: Uint8Array.of(0xff, 0xff, 0xff), name: "meta" },
        { content: "{}", name: "media" },
        { content: new Uint8Array(100), name: "collection.anki21" },
      ]);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/'meta' file.*could not be parsed/iu);
    });
  });
});
