import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import {
  createAnkiDatabaseWithData,
  createTestZip,
  getTempDir,
  getValidAnkiDatabaseBuffer,
  setupTempDir,
  validMetaV2,
} from "./anki-package.fixtures";

setupTempDir();

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

  describe("Corrupted ZIP Archive Handling", () => {
    it("should detect and report truncated ZIP files with specific message", async () => {
      const tempDir = getTempDir();
      // Create a truncated ZIP file (valid ZIP header but incomplete)
      const truncatedZipPath = join(tempDir, "truncated.apkg");
      // ZIP file signature (PK\x03\x04) followed by partial local file header
      const truncatedContent = Buffer.from([
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
      ]);
      await writeFile(truncatedZipPath, truncatedContent);

      const result = await AnkiPackage.fromAnkiExport(truncatedZipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Specific message for truncated ZIP (has ZIP magic bytes)
      expect(result.issues[0]?.message).toMatch(/ZIP archive is truncated/i);
      expect(result.issues[0]?.message).toMatch(/re-download|re-export/i);
    });

    it("should detect and report non-ZIP files with specific message", async () => {
      const tempDir = getTempDir();
      // Create a text file renamed to .apkg
      const textFilePath = join(tempDir, "not-a-zip.apkg");
      await writeFile(textFilePath, "This is not a ZIP file, just plain text content.");

      const result = await AnkiPackage.fromAnkiExport(textFilePath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Specific message for non-ZIP files (no ZIP magic bytes)
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/i);
      expect(result.issues[0]?.message).toMatch(/exported from Anki/i);
    });

    it("should detect and report empty files with specific message", async () => {
      const tempDir = getTempDir();
      // Create an empty file
      const emptyFilePath = join(tempDir, "empty.apkg");
      await writeFile(emptyFilePath, Buffer.alloc(0));

      const result = await AnkiPackage.fromAnkiExport(emptyFilePath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Specific message for empty files
      expect(result.issues[0]?.message).toMatch(/empty \(0 bytes\)/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect and report random binary data as invalid ZIP", async () => {
      const tempDir = getTempDir();
      // Create a file with random binary data (no ZIP magic bytes)
      const binaryFilePath = join(tempDir, "random-binary.apkg");
      // Ensure we don't accidentally create a valid ZIP signature
      const randomBytes = Buffer.from([
        0x00,
        0x01,
        0x02,
        0x03, // Not PK\x03\x04
        ...Array.from({ length: 1020 }, () => Math.floor(Math.random() * 256)),
      ]);
      await writeFile(binaryFilePath, randomBytes);

      const result = await AnkiPackage.fromAnkiExport(binaryFilePath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Random binary without ZIP magic should be detected as "not a valid ZIP"
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/i);
    });

    it("should provide actionable error messages with guidance", async () => {
      const tempDir = getTempDir();
      // Create a non-ZIP file
      const textFilePath = join(tempDir, "not-a-zip.apkg");
      await writeFile(textFilePath, "Not a ZIP file");

      const result = await AnkiPackage.fromAnkiExport(textFilePath);

      expect(result.status).toBe("failure");
      expect(result.issues[0]?.message).toBeTruthy();
      // Error message should be descriptive and help user understand the issue
      const message = result.issues[0]?.message ?? "";
      expect(message.length).toBeGreaterThan(50); // Should be a meaningful, actionable message
      // Should mention Anki for context
      expect(message).toMatch(/Anki/i);
    });
  });

  describe("Missing Required Files Handling", () => {
    it("should detect and report missing meta file with specific message", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-meta.apkg");
      // Create ZIP with media and database, but no meta file
      await createTestZip(zipPath, [
        { content: "{}", name: "media" },
        { content: Buffer.alloc(100), name: "collection.anki21" }, // Dummy database
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/missing.*'meta'/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect and report missing media file with specific message", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-media.apkg");
      // Create ZIP with valid meta and database, but no media file
      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: Buffer.alloc(100), name: "collection.anki21" }, // Dummy database
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/missing.*'media'/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect and report missing database file with specific message", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-database.apkg");
      // Create ZIP with valid meta and media, but no database file
      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/missing.*'collection\.anki21'/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should report all missing files when multiple are missing", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-multiple.apkg");
      // Create ZIP with only valid meta, missing media and database
      await createTestZip(zipPath, [{ content: validMetaV2, name: "meta" }]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      // Should have multiple critical issues for each missing file
      const criticalIssues = result.issues.filter((issue) => issue.severity === "critical");
      expect(criticalIssues.length).toBeGreaterThanOrEqual(2);
      // Check that both media and database are mentioned
      const allMessages = criticalIssues.map((i) => i.message).join(" ");
      expect(allMessages).toMatch(/media/i);
      expect(allMessages).toMatch(/collection\.anki21/i);
    });

    it("should detect empty ZIP archive and report missing meta file", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "empty-archive.apkg");
      // Create an empty ZIP archive
      await createTestZip(zipPath, []);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      // Should have critical issue for missing meta file (checked first)
      const criticalIssues = result.issues.filter((issue) => issue.severity === "critical");
      expect(criticalIssues.length).toBeGreaterThanOrEqual(1);
      expect(criticalIssues[0]?.message).toMatch(/meta/i);
    });

    it("should provide actionable guidance for missing files", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-files-guidance.apkg");
      // Create ZIP with valid meta and database, but missing media file
      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: Buffer.alloc(100), name: "collection.anki21" },
        // Missing media file
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message
      expect(message.length).toBeGreaterThan(50);
      // Should mention Anki for context
      expect(message).toMatch(/Anki/i);
      // Should provide guidance to re-export
      expect(message).toMatch(/re-export/i);
    });
  });

  describe("Corrupted SQLite Database Handling", () => {
    it("should detect and report corrupted database file (random bytes) with specific message", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "corrupted-db.apkg");
      // Create database file with random bytes (not valid SQLite)
      const randomBytes = Buffer.from(
        Array.from({ length: 100 }, () => Math.floor(Math.random() * 256)),
      );
      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: randomBytes, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect invalid SQLite header and provide guidance
      expect(result.issues[0]?.message).toMatch(/not a valid SQLite database.*re-export/is);
    });

    it("should detect and report empty database file with specific message", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "empty-db.apkg");
      // Create an empty database file (0 bytes)
      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: Buffer.alloc(0), name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect empty database and provide guidance
      expect(result.issues[0]?.message).toMatch(/empty.*0 bytes.*re-export/is);
    });

    it("should detect and report truncated database file with specific message", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "truncated-db.apkg");
      // Create a truncated database file (valid SQLite header but too short)
      // SQLite header is "SQLite format 3\0" (16 bytes)
      const truncatedDb = Buffer.from("SQLite format 3\0");
      // Add just a few more bytes to make it seem truncated
      const truncatedContent = Buffer.concat([truncatedDb, Buffer.alloc(10)]);

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: truncatedContent, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Truncated files with valid header may open but have no tables
      expect(result.issues[0]?.message).toMatch(/missing required tables.*re-export/is);
    });

    it("should detect and report database with missing required tables", async () => {
      const tempDir = getTempDir();
      // Create a valid SQLite database but without Anki's required tables
      const sqlJsModule = await import("sql.js");
      const InitSqlJs = sqlJsModule.default;
      const SQL = await InitSqlJs();
      const emptyDb = new SQL.Database();
      // Create a simple table that is NOT an Anki table
      emptyDb.run("CREATE TABLE dummy (id INTEGER PRIMARY KEY, name TEXT)");
      const dbBuffer = Buffer.from(emptyDb.export());

      const zipPath = join(tempDir, "missing-tables-db.apkg");
      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: dbBuffer, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should report missing required tables with specific table names and guidance
      expect(result.issues[0]?.message).toMatch(
        /missing required tables.*(col|notes|cards|revlog|graves).*re-export/is,
      );
    });

    it("should detect database file that is too small to be valid SQLite", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "tiny-db.apkg");
      // Create a file that's smaller than the SQLite header (16 bytes)
      const tinyContent = Buffer.from("SQLite"); // Only 6 bytes

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: tinyContent, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect file is too small and provide guidance
      expect(result.issues[0]?.message).toMatch(/truncated.*too small.*re-export/is);
    });

    it("should provide actionable guidance for corrupted database", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "corrupted-db-guidance.apkg");
      // Create database file with invalid content
      const invalidContent = Buffer.from("This is not a database file!");

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: invalidContent, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message mentioning Anki and re-export
      expect(message.length).toBeGreaterThan(50);
      expect(message).toMatch(/Anki.*re-export/is);
    });
  });

  describe("Invalid JSON in Media Metadata Handling", () => {
    it("should detect and report malformed JSON syntax in media file", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "malformed-json-media.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create media file with invalid JSON syntax
      const malformedJson = '{ "0": "image.png", "1": }'; // Missing value

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: malformedJson, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid JSON.*cannot be parsed/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect and report wrong JSON structure (array instead of object)", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "array-media.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create media file with array instead of object
      const arrayJson = '["image.png", "audio.mp3"]';

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: arrayJson, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid structure.*array/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should handle empty media file gracefully (valid case - no media)", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "empty-media-file.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create empty media file (0 bytes)
      const emptyContent = "";

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: emptyContent, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

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
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "empty-json-object-media.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create media file with empty JSON object
      const emptyObjectJson = "{}";

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: emptyObjectJson, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

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
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "invalid-value-type-media.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create media file with number value instead of string
      const invalidValueJson = '{ "0": 12345 }';

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: invalidValueJson, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid entry.*number.*instead of.*string/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect null value in media mapping", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "null-value-media.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create media file with null value
      const nullValueJson = '{ "0": null }';

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: nullValueJson, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(/invalid entry.*null.*instead of.*string/i);
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should provide actionable guidance for invalid media JSON", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "guidance-test-media.apkg");
      const validDb = await getValidAnkiDatabaseBuffer();
      // Create media file with invalid JSON
      const brokenJson = "not valid json at all {{{";

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: brokenJson, name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message mentioning Anki and re-export
      expect(message.length).toBeGreaterThan(50);
      expect(message).toMatch(/re-export.*Anki/is);
    });
  });

  describe("Partial Data Recovery", () => {
    it("should return partial status with valid and invalid notes (best-effort mode)", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "partial-notes.apkg");

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
            flds: "Front 1\u001FBack 1",
          },
          {
            id: 2000,
            guid: "valid2",
            mid: 1_234_567_890_123, // Valid note type
            flds: "Front 2\u001FBack 2",
          },
          {
            id: 3000,
            guid: "invalid",
            mid: 9_999_999_999_999, // Non-existent note type
            flds: "Invalid\u001FNote",
          },
        ],
      });

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();
      expect(result.issues.length).toBeGreaterThan(0);

      // Verify invalid note is reported
      const noteIssue = result.issues.find((i) => i.context?.itemType === "note");
      expect(noteIssue).toBeDefined();
      expect(noteIssue?.severity).toBe("error");
      expect(noteIssue?.message).toMatch(/Note.*invalid/i);

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
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "strict-mode.apkg");

      // Create database with a note referencing non-existent note type
      const validDb = await createAnkiDatabaseWithData({
        cards: [{ did: 1, id: 100, nid: 1000 }],
        notes: [
          {
            flds: "Front\u001FBack",
            guid: "valid",
            id: 1000,
            mid: 1_234_567_890_123,
          },
          {
            id: 2000,
            guid: "invalid",
            mid: 9_999_999_999_999, // Non-existent note type
            flds: "Invalid\u001FNote",
          },
        ],
      });

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "strict",
      });

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);

      // Verify error is reported
      const noteIssue = result.issues.find((i) => i.context?.itemType === "note");
      expect(noteIssue).toBeDefined();
      expect(noteIssue?.severity).toBe("error");
    });

    it("should skip cards referencing non-existent decks", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-deck-ref.apkg");

      // Create database with card referencing non-existent deck
      const validDb = await createAnkiDatabaseWithData({
        cards: [
          { did: 1, id: 100, nid: 1000 }, // Valid deck
          { did: 99_999, id: 200, nid: 1000 }, // Non-existent deck
        ],
        notes: [
          {
            flds: "Front\u001FBack",
            guid: "note1",
            id: 1000,
            mid: 1_234_567_890_123,
          },
        ],
      });

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Verify card error is reported
      const cardIssue = result.issues.find(
        (i) => i.context?.itemType === "card" && i.message.includes("non-existent"),
      );
      expect(cardIssue).toBeDefined();
      expect(cardIssue?.message).toMatch(/deck/i);

      // Verify only valid card remains
      if (result.data) {
        expect(result.data.getCards().length).toBe(1);
      }
    });

    it("should skip reviews referencing non-existent cards", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-card-ref.apkg");

      // Create database with review referencing non-existent card
      const validDb = await createAnkiDatabaseWithData({
        cards: [{ did: 1, id: 100, nid: 1000 }],
        notes: [
          {
            flds: "Front\u001FBack",
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

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Verify review error is reported
      const reviewIssue = result.issues.find((i) => i.context?.itemType === "review");
      expect(reviewIssue).toBeDefined();
      expect(reviewIssue?.message).toMatch(/non-existent card/i);

      // Verify only valid review remains
      if (result.data) {
        expect(result.data.getReviews().length).toBe(1);
      }
    });

    it("should report all issues in the result", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "multiple-issues.apkg");

      // Create database with multiple types of issues
      const validDb = await createAnkiDatabaseWithData({
        cards: [
          { did: 1, id: 100, nid: 1000 },
          { did: 1, id: 200, nid: 2000 }, // Will be orphaned when note is skipped
          { did: 77_777, id: 300, nid: 1000 }, // Non-existent deck
        ],
        notes: [
          {
            flds: "Front\u001FBack",
            guid: "valid",
            id: 1000,
            mid: 1_234_567_890_123,
          },
          {
            flds: "Bad\u001FNote",
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

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

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
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "missing-media-files.apkg");

      // Create a valid database
      const validDb = await createAnkiDatabaseWithData({});

      // Create media mapping that references files that don't exist in the zip
      const mediaMapping = JSON.stringify({
        "0": "image.png",
        "1": "audio.mp3",
      });

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: mediaMapping, name: "media" },
        { content: validDb, name: "collection.anki21" },
        // Note: NOT including the actual media files "0" and "1"
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      // Should succeed (missing media is just a warning)
      expect(["success", "partial"]).toContain(result.status);
      expect(result.data).toBeDefined();

      // Should have warnings about missing media files
      const mediaWarnings = result.issues.filter(
        (i) => i.context?.itemType === "media" && i.severity === "warning",
      );
      expect(mediaWarnings.length).toBe(2);
      expect(mediaWarnings[0]?.message).toMatch(/image\.png/);
      expect(mediaWarnings[1]?.message).toMatch(/audio\.mp3/);
    });

    it("should return success when there are no issues", async () => {
      const tempDir = getTempDir();
      const zipPath = join(tempDir, "clean-package.apkg");

      // Create a completely valid database
      const validDb = await createAnkiDatabaseWithData({
        cards: [{ did: 1, id: 100, nid: 1000 }],
        notes: [
          {
            flds: "Front 1\u001FBack 1",
            guid: "note1",
            id: 1000,
            mid: 1_234_567_890_123,
          },
        ],
        reviews: [{ cid: 100, id: 1001 }],
      });

      await createTestZip(zipPath, [
        { content: validMetaV2, name: "meta" },
        { content: "{}", name: "media" },
        { content: validDb, name: "collection.anki21" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

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

    it.todo("should handle different export versions", async () => {
      // TODO: Test compatibility with various export versions
    });

    it.todo("should provide clear error messages for unsupported versions", async () => {
      // TODO: Test error messaging for unsupported versions
    });

    it.todo("should handle database schema migrations", async () => {
      // TODO: Test schema migration handling
    });
  });
});
