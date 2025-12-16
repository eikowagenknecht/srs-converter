/** biome-ignore-all lint/complexity/useLiteralKeys: <It's a test> */
import { Buffer } from "node:buffer";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import archiver from "archiver";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversionResult } from "@/error-handling";
import {
  createCard,
  createCompleteDeckStructure,
  createDeck,
  createNote,
  createNoteType,
  createReview,
  SrsPackage,
  SrsReviewScore,
} from "@/srs-package";
import { AnkiPackage } from "./anki-package";
import {
  basicAndReversedCardModel,
  basicModel,
  clozeModel,
  defaultConfig,
  defaultDeck,
} from "./constants";
import {
  type CardsTable,
  type Ease,
  type NotesTable,
  NoteTypeKind,
  type RevlogTable,
} from "./types";
import { extractTimestampFromUuid, guid64, joinAnkiFields } from "./util";

// #region Helpers - Constants

// Valid meta file for version 2 (Legacy_V2)
// Protobuf encoding: field 1 (varint) with value 2 = [0x08, 0x02]
const validMetaV2 = Buffer.from([0x08, 0x02]);

// #endregion Helpers - Constants

//#region Helpers - Test Results

function expectSuccess<T>(result: ConversionResult<T>): T {
  expect(result.status).toBe("success");
  expect(result.data).toBeDefined();
  if (!result.data) {
    throw new Error("Expected data to be defined");
  }
  return result.data;
}

function expectPartial<T>(result: ConversionResult<T>): T {
  expect(result.status).toBe("partial");
  expect(result.data).toBeDefined();
  expect(result.issues.length).toBeGreaterThan(0);
  if (!result.data) {
    throw new Error("Expected data to be defined");
  }
  return result.data;
}

function expectFailure<T>(result: ConversionResult<T>): ConversionResult<T> {
  expect(result.status).toBe("failure");
  expect(result.data).toBeUndefined();
  expect(result.issues.length).toBeGreaterThan(0);
  return result;
}

//#endregion Helpers - Test Results

//#region Helpers - Basic Entities

// Helper function to create an Anki note (NotesTable) for testing
// Returns NotesTable with id guaranteed to be a number (not null)
function createTestAnkiNote(
  options: {
    id?: number;
    noteTypeId: bigint | number;
    fields: string[];
    tags?: string[];
    guid?: string;
  },
  getTimestamp?: () => number,
): NotesTable & { id: number } {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const id = options.id ?? (getTimestamp ? getTimestamp() : now);
  return {
    id,
    guid: options.guid ?? guid64(),
    mid:
      typeof options.noteTypeId === "bigint"
        ? Number(options.noteTypeId)
        : options.noteTypeId,
    mod: nowSeconds,
    usn: -1,
    tags: (options.tags ?? []).join(" "),
    flds: joinAnkiFields(options.fields),
    sfld: options.fields[0] ?? "",
    csum: 0,
    flags: 0,
    data: "",
  };
}

// Helper function to create an Anki card (CardsTable) for testing
// Returns CardsTable with id guaranteed to be a number (not null)
function createTestAnkiCard(
  options: {
    id?: number;
    noteId: number;
    deckId: number;
    templateIndex?: number;
    type?: number;
    queue?: number;
    due?: number;
    interval?: number;
    factor?: number;
    reps?: number;
    lapses?: number;
  },
  getTimestamp?: () => number,
): CardsTable & { id: number } {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  return {
    id: options.id ?? (getTimestamp ? getTimestamp() : now),
    nid: options.noteId,
    did: options.deckId,
    ord: options.templateIndex ?? 0,
    mod: nowSeconds,
    usn: -1,
    type: options.type ?? 0,
    queue: options.queue ?? 0,
    due: options.due ?? 1,
    ivl: options.interval ?? 0,
    factor: options.factor ?? 2500,
    reps: options.reps ?? 0,
    lapses: options.lapses ?? 0,
    left: 1001,
    odue: 0,
    odid: 0,
    flags: 0,
    data: "",
  };
}

// Helper function to create an Anki review (RevlogTable) for testing
// Returns RevlogTable with id guaranteed to be a number (not null)
function createTestAnkiReview(
  options: {
    id?: number;
    cardId: number;
    ease: Ease;
    interval?: number;
    lastInterval?: number;
    factor?: number;
    time?: number;
    type?: number;
  },
  getTimestamp?: () => number,
): RevlogTable & { id: number } {
  const now = Date.now();
  return {
    id: options.id ?? (getTimestamp ? getTimestamp() : now),
    cid: options.cardId,
    usn: -1,
    ease: options.ease,
    ivl: options.interval ?? 0,
    lastIvl: options.lastInterval ?? 0,
    factor: options.factor ?? 2500,
    time: options.time ?? 5000,
    type: options.type ?? 0,
  };
}

// TODO: Use proper return type
function createBasicTemplate(id = 0, name = "Card 1") {
  return {
    id,
    name,
    questionTemplate: "{{Front}}",
    answerTemplate: "{{Back}}",
  };
}

// TODO: Use proper return type
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

// TODO: Use proper return type
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

// TODO: Use proper return type
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

// #endregion Helpers - Basic Entities

// #region Helpers - Utilities

// Helper function to create a ZIP file with specific contents for testing
async function createTestZip(
  zipPath: string,
  files: { name: string; content: string | Buffer }[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip");

    output.on("close", () => {
      resolve();
    });
    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);
    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }
    void archive.finalize();
  });
}

// Helper for creating unique timestamps in tests (Anki uses timestamps as IDs)
function createTimestampGenerator() {
  let nextTimestamp = Date.now();
  return (hoursAgo?: number) => {
    nextTimestamp += 1;
    return nextTimestamp - (hoursAgo ? hoursAgo * 3600000 : 0);
  };
}

// #endregion Helpers - Utilities

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
          await access(tempDirPath); // Will throw if path doesn't exist
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
        await access(tempDirPath); // Will throw if path doesn't exist

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
        "./tests/fixtures/anki/empty-legacy-2.apkg",
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
        "./tests/fixtures/anki/empty-legacy-2.colpkg",
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
        "./tests/fixtures/anki/empty-latest.apkg",
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
      // Text content without ZIP magic bytes should be detected as "not a valid ZIP archive"
      expect(result.issues[0]?.message).toMatch(/not a valid ZIP archive/i);
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
        await access(exportPath); // Will throw if file doesn't exist

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

describe("Media File APIs", () => {
  const MEDIA_PACKAGE_PATH = "tests/fixtures/anki/mixed-legacy-2.apkg";
  const EXPECTED_FILENAME =
    "paste-ab21b25dd3e4ba4af2a1d8bdfa4c47455e53abac.jpg";

  describe("listMediaFiles()", () => {
    it("should return list of media filenames", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        const mediaFiles = pkg.listMediaFiles();

        expect(mediaFiles).toBeInstanceOf(Array);
        expect(mediaFiles).toContain(EXPECTED_FILENAME);
        expect(mediaFiles).toHaveLength(1);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should return empty array for package with no media", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const mediaFiles = pkg.listMediaFiles();

        expect(mediaFiles).toBeInstanceOf(Array);
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("getMediaFileSize()", () => {
    it("should return correct size for existing media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        const size = await pkg.getMediaFileSize(EXPECTED_FILENAME);

        expect(size).toBe(10701); // Known size from the test file
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error for non-existent media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        await expect(
          pkg.getMediaFileSize("non-existent-file.jpg"),
        ).rejects.toThrow(
          "Media file 'non-existent-file.jpg' not found in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("getMediaFile()", () => {
    it("should return ReadableStream for media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        const stream = pkg.getMediaFile(EXPECTED_FILENAME);

        // Read the stream into memory to verify content
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }

        const buffer = Buffer.concat(chunks);
        expect(buffer.length).toBe(10701); // Known size

        // Verify it's a valid JPEG by checking magic bytes
        expect(buffer[0]).toBe(0xff);
        expect(buffer[1]).toBe(0xd8);
        expect(buffer[2]).toBe(0xff);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error for non-existent media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        expect(() => pkg.getMediaFile("non-existent-file.jpg")).toThrow(
          "Media file 'non-existent-file.jpg' not found in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("addMediaFile()", () => {
    const TEST_IMAGE_PATH = "tests/fixtures/media/image.png";
    const TEST_IMAGE_NAME = "test-image.png";

    it("should add media file from file path", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add the media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Verify it's in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain(TEST_IMAGE_NAME);
        expect(mediaFiles).toHaveLength(1);

        // Verify we can retrieve it
        const size = await pkg.getMediaFileSize(TEST_IMAGE_NAME);
        expect(size).toBeGreaterThan(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should add media file from Buffer", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const buffer = Buffer.from("test content");
        await pkg.addMediaFile("test-buffer.txt", buffer);

        // Verify it's in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain("test-buffer.txt");

        // Verify content is correct
        const stream = pkg.getMediaFile("test-buffer.txt");
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        const retrievedBuffer = Buffer.concat(chunks);
        expect(retrievedBuffer.toString()).toBe("test content");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should add media file from Readable stream", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const { createReadStream } = await import("node:fs");
        const stream = createReadStream(TEST_IMAGE_PATH);
        await pkg.addMediaFile("stream-image.png", stream);

        // Verify it's in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain("stream-image.png");

        // Verify size matches original
        const size = await pkg.getMediaFileSize("stream-image.png");
        const { stat } = await import("node:fs/promises");
        const originalStats = await stat(TEST_IMAGE_PATH);
        expect(size).toBe(originalStats.size);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error when adding duplicate filename", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const buffer = Buffer.from("content");
        await pkg.addMediaFile("duplicate.txt", buffer);

        // Try to add the same filename again
        await expect(pkg.addMediaFile("duplicate.txt", buffer)).rejects.toThrow(
          "Media file 'duplicate.txt' already exists in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error for non-existent source file path", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await expect(
          pkg.addMediaFile("test.txt", "/non/existent/path.txt"),
        ).rejects.toThrow("Failed to add media file 'test.txt'");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should generate sequential media IDs", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add three files
        await pkg.addMediaFile("file1.txt", Buffer.from("content1"));
        await pkg.addMediaFile("file2.txt", Buffer.from("content2"));
        await pkg.addMediaFile("file3.txt", Buffer.from("content3"));

        // All three should be in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);
        expect(mediaFiles).toContain("file1.txt");
        expect(mediaFiles).toContain("file2.txt");
        expect(mediaFiles).toContain("file3.txt");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should include added media files in exported package", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Export to file
        const exportPath = "out/test-with-added-media.apkg";
        await pkg.toAnkiExport(exportPath);

        // Re-read the exported package
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPkg = expectSuccess(reimportResult);

        try {
          // Verify media file is present
          const mediaFiles = reimportedPkg.listMediaFiles();
          expect(mediaFiles).toContain(TEST_IMAGE_NAME);

          // Verify content matches
          const originalStats = await (await import("node:fs/promises")).stat(
            TEST_IMAGE_PATH,
          );
          const reimportedSize =
            await reimportedPkg.getMediaFileSize(TEST_IMAGE_NAME);
          expect(reimportedSize).toBe(originalStats.size);
        } finally {
          await reimportedPkg.cleanup();
        }
      } finally {
        await pkg.cleanup();
      }
    });

    it("should work with packages that already have media", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        // Package already has one media file
        const initialFiles = pkg.listMediaFiles();
        expect(initialFiles).toHaveLength(1);

        // Add another media file
        await pkg.addMediaFile("new-file.txt", Buffer.from("new content"));

        // Now should have two
        const updatedFiles = pkg.listMediaFiles();
        expect(updatedFiles).toHaveLength(2);
        expect(updatedFiles).toContain(EXPECTED_FILENAME); // Original
        expect(updatedFiles).toContain("new-file.txt"); // New
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("removeMediaFile()", () => {
    const TEST_IMAGE_PATH = "tests/fixtures/media/image.png";
    const TEST_IMAGE_NAME = "test-image.png";

    it("should remove an existing media file", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Verify it's there
        let mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain(TEST_IMAGE_NAME);
        expect(mediaFiles).toHaveLength(1);

        // Remove it
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Verify it's gone
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).not.toContain(TEST_IMAGE_NAME);
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error when removing non-existent file", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await expect(pkg.removeMediaFile("non-existent.png")).rejects.toThrow(
          "Media file 'non-existent.png' does not exist in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should remove file from disk", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Verify we can access it
        const size = await pkg.getMediaFileSize(TEST_IMAGE_NAME);
        expect(size).toBeGreaterThan(0);

        // Remove it
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Verify we can't access it anymore
        await expect(pkg.getMediaFileSize(TEST_IMAGE_NAME)).rejects.toThrow(
          "Media file 'test-image.png' not found in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should not include removed files in exported package", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add two media files
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);
        await pkg.addMediaFile(
          "keep-this.txt",
          Buffer.from("keep this content"),
        );

        // Remove one
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Export to file
        const exportPath = "out/test-with-removed-media.apkg";
        await pkg.toAnkiExport(exportPath);

        // Re-read the exported package
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPkg = expectSuccess(reimportResult);

        try {
          // Verify only the kept file is present
          const mediaFiles = reimportedPkg.listMediaFiles();
          expect(mediaFiles).toHaveLength(1);
          expect(mediaFiles).toContain("keep-this.txt");
          expect(mediaFiles).not.toContain(TEST_IMAGE_NAME);
        } finally {
          await reimportedPkg.cleanup();
        }
      } finally {
        await pkg.cleanup();
      }
    });

    it("should work with packages loaded from file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        // Package already has one media file
        const initialFiles = pkg.listMediaFiles();
        expect(initialFiles).toHaveLength(1);
        expect(initialFiles).toContain(EXPECTED_FILENAME);

        // Remove the existing media file
        await pkg.removeMediaFile(EXPECTED_FILENAME);

        // Verify it's gone
        const updatedFiles = pkg.listMediaFiles();
        expect(updatedFiles).toHaveLength(0);
        expect(updatedFiles).not.toContain(EXPECTED_FILENAME);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should remove multiple files correctly", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add three files
        await pkg.addMediaFile("file1.txt", Buffer.from("content1"));
        await pkg.addMediaFile("file2.txt", Buffer.from("content2"));
        await pkg.addMediaFile("file3.txt", Buffer.from("content3"));

        // Verify all are present
        let mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);

        // Remove file2
        await pkg.removeMediaFile("file2.txt");

        // Verify only file2 is gone
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("file1.txt");
        expect(mediaFiles).not.toContain("file2.txt");
        expect(mediaFiles).toContain("file3.txt");

        // Remove file1
        await pkg.removeMediaFile("file1.txt");

        // Verify only file3 remains
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(1);
        expect(mediaFiles).toContain("file3.txt");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error when trying to remove same file twice", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Remove it once (should succeed)
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Try to remove again (should fail)
        await expect(pkg.removeMediaFile(TEST_IMAGE_NAME)).rejects.toThrow(
          "Media file 'test-image.png' does not exist in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should handle removal and re-adding of same filename", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);
        const originalSize = await pkg.getMediaFileSize(TEST_IMAGE_NAME);

        // Remove it
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Add a different file with the same name
        const newContent = Buffer.from("new content with same name");
        await pkg.addMediaFile(TEST_IMAGE_NAME, newContent);

        // Verify the new file is present
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain(TEST_IMAGE_NAME);

        // Verify the content is different (size changed)
        const newSize = await pkg.getMediaFileSize(TEST_IMAGE_NAME);
        expect(newSize).toBe(newContent.length);
        expect(newSize).not.toBe(originalSize);
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("removeUnreferencedMediaFiles()", () => {
    const TEST_IMAGE_PATH = "tests/fixtures/media/image.png";
    const TEST_AUDIO_PATH = "tests/fixtures/media/audio.mp3";
    const TEST_VIDEO_PATH = "tests/fixtures/media/video.mp4"; // Anki uses [sound:] for video too

    it("should remove unreferenced media files", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add media files
        await pkg.addMediaFile("referenced-image.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("referenced-sound.mp3", TEST_AUDIO_PATH);

        // Add a note that references some media
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: [
              '<img src="referenced-image.png">',
              "[sound:referenced-sound.mp3]",
            ],
          }),
        );

        // Verify all files are present
        let mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);

        // Remove unreferenced files
        const removed = await pkg.removeUnreferencedMediaFiles();

        // Verify only the unreferenced file was removed
        expect(removed).toEqual(["unreferenced.png"]);
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("referenced-image.png");
        expect(mediaFiles).toContain("referenced-sound.mp3");
        expect(mediaFiles).not.toContain("unreferenced.png");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should keep files referenced in img tags with various formats", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("with-quotes.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("without-quotes.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("single-quotes.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);

        // Add notes with different img tag formats
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ['<img src="with-quotes.png">', "Back"],
          }),
        );
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ["<img src=without-quotes.png>", "Back"],
          }),
        );
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ["<img src='single-quotes.png'>", "Back"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.png"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);
        expect(mediaFiles).toContain("with-quotes.png");
        expect(mediaFiles).toContain("without-quotes.png");
        expect(mediaFiles).toContain("single-quotes.png");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should keep files referenced in sound tags", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("audio1.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("audio2.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("unreferenced.mp3", TEST_AUDIO_PATH);

        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ["Front", "[sound:audio1.mp3] [sound:audio2.mp3]"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.mp3"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("audio1.mp3");
        expect(mediaFiles).toContain("audio2.mp3");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should keep video files referenced via sound tags (Anki uses [sound:] for video)", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("video1.mp4", TEST_VIDEO_PATH);
        await pkg.addMediaFile("video2.mp4", TEST_VIDEO_PATH);
        await pkg.addMediaFile("unreferenced.mp4", TEST_VIDEO_PATH);

        // Anki uses [sound:] syntax for both audio and video files
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ["Front", "[sound:video1.mp4] [sound:video2.mp4]"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.mp4"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("video1.mp4");
        expect(mediaFiles).toContain("video2.mp4");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should return empty array when no unreferenced files exist", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("referenced.png", TEST_IMAGE_PATH);

        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ['<img src="referenced.png">', "Back"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual([]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(1);
        expect(mediaFiles).toContain("referenced.png");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should remove all files when no notes reference media", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("file1.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("file2.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("file3.png", TEST_IMAGE_PATH);

        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ["Front without media", "Back without media"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toHaveLength(3);
        expect(removed).toContain("file1.png");
        expect(removed).toContain("file2.mp3");
        expect(removed).toContain("file3.png");
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should handle packages with no media files", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ["Front", "Back"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual([]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should scan all note fields for references", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("in-field1.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("in-field2.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);

        // Note with media in different fields
        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: ['<img src="in-field1.png">', "[sound:in-field2.mp3]"],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.png"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("in-field1.png");
        expect(mediaFiles).toContain("in-field2.mp3");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should handle complex HTML with multiple media references", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("img1.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("img2.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("sound1.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);

        pkg.addNote(
          createTestAnkiNote({
            noteTypeId: basicModel.id,
            fields: [
              '<div><img src="img1.png" alt="test"><img src="img2.png"></div>',
              "Text before [sound:sound1.mp3] text after",
            ],
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.png"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error if database not available", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Clear the database contents to simulate unavailable database

        (pkg as unknown as { databaseContents: undefined }).databaseContents =
          undefined;

        await expect(pkg.removeUnreferencedMediaFiles()).rejects.toThrow(
          "Database contents not available",
        );
      } finally {
        // Note: cleanup would fail since we cleared databaseContents, but that's OK for this test
      }
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
          expect(typeof card.applicationSpecificData["ankiQueue"]).toBe(
            "string",
          );
          expect(typeof card.applicationSpecificData["ankiType"]).toBe(
            "string",
          );
          expect(typeof card.applicationSpecificData["ankiData"]).toBe(
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
        const convertedSrs = expectPartial(convertResult);
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
      expect(testDeck?.applicationSpecificData?.["originalAnkiId"]).toBe(
        ankiDeckId?.toFixed(),
      );
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
      const convertedSrsPackage = expectPartial(convertedSrsResult);

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
      const convertedSrsPackage = expectPartial(convertedSrsResult);

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
      const convertedSrsPackage = expectPartial(convertedSrsResult);

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

  describe("Corrupted ZIP Archive Handling (Story 1.0.5.1)", () => {
    it("should detect and report truncated ZIP files with specific message", async () => {
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
      // Create a text file renamed to .apkg
      const textFilePath = join(tempDir, "not-a-zip.apkg");
      await writeFile(
        textFilePath,
        "This is not a ZIP file, just plain text content.",
      );

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

  describe("Missing Required Files Handling (Story 1.0.5.2)", () => {
    it("should detect and report missing meta file with specific message", async () => {
      const zipPath = join(tempDir, "missing-meta.apkg");
      // Create ZIP with media and database, but no meta file
      await createTestZip(zipPath, [
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: Buffer.alloc(100) }, // Dummy database
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
      const zipPath = join(tempDir, "missing-media.apkg");
      // Create ZIP with valid meta and database, but no media file
      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "collection.anki21", content: Buffer.alloc(100) }, // Dummy database
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
      const zipPath = join(tempDir, "missing-database.apkg");
      // Create ZIP with valid meta and media, but no database file
      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(
        /missing.*'collection\.anki21'/i,
      );
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should report all missing files when multiple are missing", async () => {
      const zipPath = join(tempDir, "missing-multiple.apkg");
      // Create ZIP with only valid meta, missing media and database
      await createTestZip(zipPath, [{ name: "meta", content: validMetaV2 }]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      // Should have multiple critical issues for each missing file
      const criticalIssues = result.issues.filter(
        (issue) => issue.severity === "critical",
      );
      expect(criticalIssues.length).toBeGreaterThanOrEqual(2);
      // Check that both media and database are mentioned
      const allMessages = criticalIssues.map((i) => i.message).join(" ");
      expect(allMessages).toMatch(/media/i);
      expect(allMessages).toMatch(/collection\.anki21/i);
    });

    it("should detect empty ZIP archive and report missing meta file", async () => {
      const zipPath = join(tempDir, "empty-archive.apkg");
      // Create an empty ZIP archive
      await createTestZip(zipPath, []);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      // Should have critical issue for missing meta file (checked first)
      const criticalIssues = result.issues.filter(
        (issue) => issue.severity === "critical",
      );
      expect(criticalIssues.length).toBeGreaterThanOrEqual(1);
      expect(criticalIssues[0]?.message).toMatch(/meta/i);
    });

    it("should provide actionable guidance for missing files", async () => {
      const zipPath = join(tempDir, "missing-files-guidance.apkg");
      // Create ZIP with valid meta and database, but missing media file
      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "collection.anki21", content: Buffer.alloc(100) },
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

  describe("Corrupted SQLite Database Handling (Story 1.0.5.3)", () => {
    it("should detect and report corrupted database file (random bytes) with specific message", async () => {
      const zipPath = join(tempDir, "corrupted-db.apkg");
      // Create database file with random bytes (not valid SQLite)
      const randomBytes = Buffer.from(
        Array.from({ length: 100 }, () => Math.floor(Math.random() * 256)),
      );
      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: randomBytes },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect invalid SQLite header and provide guidance
      expect(result.issues[0]?.message).toMatch(
        /not a valid SQLite database.*re-export/is,
      );
    });

    it("should detect and report empty database file with specific message", async () => {
      const zipPath = join(tempDir, "empty-db.apkg");
      // Create an empty database file (0 bytes)
      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: Buffer.alloc(0) },
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
      const zipPath = join(tempDir, "truncated-db.apkg");
      // Create a truncated database file (valid SQLite header but too short)
      // SQLite header is "SQLite format 3\0" (16 bytes)
      const truncatedDb = Buffer.from("SQLite format 3\0");
      // Add just a few more bytes to make it seem truncated
      const truncatedContent = Buffer.concat([truncatedDb, Buffer.alloc(10)]);

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: truncatedContent },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Truncated files with valid header may open but have no tables
      expect(result.issues[0]?.message).toMatch(
        /missing required tables.*re-export/is,
      );
    });

    it("should detect and report database with missing required tables", async () => {
      // Create a valid SQLite database but without Anki's required tables
      const InitSqlJs = (await import("sql.js")).default;
      const SQL = await InitSqlJs();
      const emptyDb = new SQL.Database();
      // Create a simple table that is NOT an Anki table
      emptyDb.run("CREATE TABLE dummy (id INTEGER PRIMARY KEY, name TEXT)");
      const dbBuffer = Buffer.from(emptyDb.export());

      const zipPath = join(tempDir, "missing-tables-db.apkg");
      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: dbBuffer },
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
      const zipPath = join(tempDir, "tiny-db.apkg");
      // Create a file that's smaller than the SQLite header (16 bytes)
      const tinyContent = Buffer.from("SQLite"); // Only 6 bytes

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: tinyContent },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      // Should detect file is too small and provide guidance
      expect(result.issues[0]?.message).toMatch(
        /truncated.*too small.*re-export/is,
      );
    });

    it("should provide actionable guidance for corrupted database", async () => {
      const zipPath = join(tempDir, "corrupted-db-guidance.apkg");
      // Create database file with invalid content
      const invalidContent = Buffer.from("This is not a database file!");

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: invalidContent },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message mentioning Anki and re-export
      expect(message.length).toBeGreaterThan(50);
      expect(message).toMatch(/Anki.*re-export/is);
    });
  });

  describe("Invalid JSON in Media Metadata Handling (Story 1.0.5.4)", () => {
    // Helper function to create a valid SQLite database for testing
    async function createValidAnkiDatabase(): Promise<Buffer> {
      const InitSqlJs = (await import("sql.js")).default;
      const SQL = await InitSqlJs();
      const db = new SQL.Database();

      // Create required Anki tables
      db.run(`
        CREATE TABLE col (
          id INTEGER PRIMARY KEY,
          crt INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          scm INTEGER NOT NULL,
          ver INTEGER NOT NULL,
          dty INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          ls INTEGER NOT NULL,
          conf TEXT NOT NULL,
          models TEXT NOT NULL,
          decks TEXT NOT NULL,
          dconf TEXT NOT NULL,
          tags TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY,
          guid TEXT NOT NULL,
          mid INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          tags TEXT NOT NULL,
          flds TEXT NOT NULL,
          sfld TEXT NOT NULL,
          csum INTEGER NOT NULL,
          flags INTEGER NOT NULL,
          data TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE cards (
          id INTEGER PRIMARY KEY,
          nid INTEGER NOT NULL,
          did INTEGER NOT NULL,
          ord INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          type INTEGER NOT NULL,
          queue INTEGER NOT NULL,
          due INTEGER NOT NULL,
          ivl INTEGER NOT NULL,
          factor INTEGER NOT NULL,
          reps INTEGER NOT NULL,
          lapses INTEGER NOT NULL,
          left INTEGER NOT NULL,
          odue INTEGER NOT NULL,
          odid INTEGER NOT NULL,
          flags INTEGER NOT NULL,
          data TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE revlog (
          id INTEGER PRIMARY KEY,
          cid INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          ease INTEGER NOT NULL,
          ivl INTEGER NOT NULL,
          lastIvl INTEGER NOT NULL,
          factor INTEGER NOT NULL,
          time INTEGER NOT NULL,
          type INTEGER NOT NULL
        )
      `);
      db.run(
        "CREATE TABLE graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL)",
      );

      // Insert minimal collection data
      const now = Date.now();
      const defaultDeck = {
        "1": {
          id: 1,
          name: "Default",
          mod: now,
          usn: -1,
          lrnToday: [0, 0],
          revToday: [0, 0],
          newToday: [0, 0],
          timeToday: [0, 0],
          collapsed: false,
          desc: "",
          dyn: 0,
          conf: 1,
          extendNew: 10,
          extendRev: 50,
        },
      };
      const defaultModel = {
        "1234567890123": {
          id: 1234567890123,
          name: "Basic",
          type: 0,
          mod: now,
          usn: -1,
          sortf: 0,
          did: 1,
          tmpls: [
            {
              name: "Card 1",
              ord: 0,
              qfmt: "{{Front}}",
              afmt: "{{FrontSide}}<hr id=answer>{{Back}}",
              bqfmt: "",
              bafmt: "",
              did: null,
              bfont: "",
              bsize: 0,
              id: 0,
            },
          ],
          flds: [
            {
              name: "Front",
              ord: 0,
              sticky: false,
              rtl: false,
              font: "Arial",
              size: 20,
              media: [],
              id: 0,
              tag: null,
              preventDeletion: false,
              description: "",
              plainText: false,
              collapsed: false,
              excludeFromSearch: false,
            },
            {
              name: "Back",
              ord: 1,
              sticky: false,
              rtl: false,
              font: "Arial",
              size: 20,
              media: [],
              id: 1,
              tag: null,
              preventDeletion: false,
              description: "",
              plainText: false,
              collapsed: false,
              excludeFromSearch: false,
            },
          ],
          css: ".card { font-family: arial; font-size: 20px; }",
          latexPre: "",
          latexPost: "",
          latexsvg: false,
          req: [[0, "any", [0]]],
          originalStockKind: 1,
          tags: [],
        },
      };
      const defaultConf = {
        activeDecks: [1],
        curDeck: 1,
        newSpread: 0,
        collapseTime: 1200,
        timeLim: 0,
        estTimes: true,
        dueCounts: true,
        curModel: "1234567890123",
        nextPos: 1,
        sortType: "noteFld",
        sortBackwards: false,
        addToCur: true,
      };
      const defaultDconf = {
        "1": {
          id: 1,
          name: "Default",
          new: {
            delays: [1, 10],
            ints: [1, 4, 0],
            initialFactor: 2500,
            order: 1,
            perDay: 20,
          },
          rev: {
            perDay: 200,
            ease4: 1.3,
            ivlFct: 1,
            maxIvl: 36500,
            fuzz: 0.05,
          },
          lapse: {
            delays: [10],
            mult: 0,
            minInt: 1,
            leechFails: 8,
            leechAction: 0,
          },
          dyn: false,
          maxTaken: 60,
          timer: 0,
          autoplay: true,
          replayq: true,
          mod: 0,
          usn: 0,
        },
      };

      db.run("INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        1,
        Math.floor(now / 1000),
        now,
        now,
        11,
        0,
        -1,
        0,
        JSON.stringify(defaultConf),
        JSON.stringify(defaultModel),
        JSON.stringify(defaultDeck),
        JSON.stringify(defaultDconf),
        "{}",
      ]);

      return Buffer.from(db.export());
    }

    // Helper function to create a ZIP file with specific contents
    async function createTestZip(
      zipPath: string,
      files: { name: string; content: string | Buffer }[],
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip");

        output.on("close", () => {
          resolve();
        });
        archive.on("error", (err) => {
          reject(err);
        });

        archive.pipe(output);
        for (const file of files) {
          archive.append(file.content, { name: file.name });
        }
        void archive.finalize();
      });
    }

    it("should detect and report malformed JSON syntax in media file", async () => {
      const zipPath = join(tempDir, "malformed-json-media.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create media file with invalid JSON syntax
      const malformedJson = '{ "0": "image.png", "1": }'; // Missing value

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: malformedJson },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(
        /invalid JSON.*cannot be parsed/i,
      );
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect and report wrong JSON structure (array instead of object)", async () => {
      const zipPath = join(tempDir, "array-media.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create media file with array instead of object
      const arrayJson = '["image.png", "audio.mp3"]';

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: arrayJson },
        { name: "collection.anki21", content: validDb },
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
      const zipPath = join(tempDir, "empty-media-file.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create empty media file (0 bytes)
      const emptyContent = "";

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: emptyContent },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      // Should succeed - empty media file is valid
      expect(result.status).toBe("success");
      expect(result.data).toBeDefined();
      if (result.data === undefined) throw new Error("Expected data");
      const mediaFiles = result.data.listMediaFiles();
      expect(mediaFiles).toHaveLength(0);
    });

    it("should handle valid empty JSON object {} (no media)", async () => {
      const zipPath = join(tempDir, "empty-json-object-media.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create media file with empty JSON object
      const emptyObjectJson = "{}";

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: emptyObjectJson },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      // Should succeed - empty object is valid
      expect(result.status).toBe("success");
      expect(result.data).toBeDefined();
      if (result.data === undefined) throw new Error("Expected data");
      const mediaFiles = result.data.listMediaFiles();
      expect(mediaFiles).toHaveLength(0);
    });

    it("should detect invalid value type in media mapping (number instead of string)", async () => {
      const zipPath = join(tempDir, "invalid-value-type-media.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create media file with number value instead of string
      const invalidValueJson = '{ "0": 12345 }';

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: invalidValueJson },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(
        /invalid entry.*number.*instead of.*string/i,
      );
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should detect null value in media mapping", async () => {
      const zipPath = join(tempDir, "null-value-media.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create media file with null value
      const nullValueJson = '{ "0": null }';

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: nullValueJson },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[0]?.message).toMatch(
        /invalid entry.*null.*instead of.*string/i,
      );
      expect(result.issues[0]?.message).toMatch(/re-export/i);
    });

    it("should provide actionable guidance for invalid media JSON", async () => {
      const zipPath = join(tempDir, "guidance-test-media.apkg");
      const validDb = await createValidAnkiDatabase();
      // Create media file with invalid JSON
      const brokenJson = "not valid json at all {{{";

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: brokenJson },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath);

      expect(result.status).toBe("failure");
      const message = result.issues[0]?.message ?? "";
      // Should be a meaningful, actionable message mentioning Anki and re-export
      expect(message.length).toBeGreaterThan(50);
      expect(message).toMatch(/re-export.*Anki/is);
    });
  });

  describe("Partial Data Recovery (Story 1.0.5.5)", () => {
    // Helper function to create a valid SQLite database for testing partial recovery
    async function createAnkiDatabaseWithData(options: {
      models?: Record<string, unknown>;
      decks?: Record<string, unknown>;
      notes?: {
        id: number;
        guid: string;
        mid: number;
        flds: string;
      }[];
      cards?: {
        id: number;
        nid: number;
        did: number;
      }[];
      reviews?: {
        id: number;
        cid: number;
      }[];
    }): Promise<Buffer> {
      const InitSqlJs = (await import("sql.js")).default;
      const SQL = await InitSqlJs();
      const db = new SQL.Database();

      // Create required Anki tables
      db.run(`
        CREATE TABLE col (
          id INTEGER PRIMARY KEY,
          crt INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          scm INTEGER NOT NULL,
          ver INTEGER NOT NULL,
          dty INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          ls INTEGER NOT NULL,
          conf TEXT NOT NULL,
          models TEXT NOT NULL,
          decks TEXT NOT NULL,
          dconf TEXT NOT NULL,
          tags TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY,
          guid TEXT NOT NULL,
          mid INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          tags TEXT NOT NULL,
          flds TEXT NOT NULL,
          sfld TEXT NOT NULL,
          csum INTEGER NOT NULL,
          flags INTEGER NOT NULL,
          data TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE cards (
          id INTEGER PRIMARY KEY,
          nid INTEGER NOT NULL,
          did INTEGER NOT NULL,
          ord INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          type INTEGER NOT NULL,
          queue INTEGER NOT NULL,
          due INTEGER NOT NULL,
          ivl INTEGER NOT NULL,
          factor INTEGER NOT NULL,
          reps INTEGER NOT NULL,
          lapses INTEGER NOT NULL,
          left INTEGER NOT NULL,
          odue INTEGER NOT NULL,
          odid INTEGER NOT NULL,
          flags INTEGER NOT NULL,
          data TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE revlog (
          id INTEGER PRIMARY KEY,
          cid INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          ease INTEGER NOT NULL,
          ivl INTEGER NOT NULL,
          lastIvl INTEGER NOT NULL,
          factor INTEGER NOT NULL,
          time INTEGER NOT NULL,
          type INTEGER NOT NULL
        )
      `);
      db.run(
        "CREATE TABLE graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL)",
      );

      const now = Date.now();

      // Default model (note type) - needed for notes to be valid
      const defaultModels = options.models ?? {
        "1234567890123": {
          id: 1234567890123,
          name: "Basic",
          type: 0,
          mod: Math.floor(now / 1000),
          usn: -1,
          sortf: 0,
          did: null,
          tmpls: [
            {
              name: "Card 1",
              ord: 0,
              qfmt: "{{Front}}",
              afmt: "{{Back}}",
              bqfmt: "",
              bafmt: "",
              did: null,
              bfont: "",
              bsize: 0,
            },
          ],
          flds: [
            {
              name: "Front",
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
              name: "Back",
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
          ],
          css: "",
          latexPre: "",
          latexPost: "",
          latexsvg: false,
          req: [],
          originalStockKind: null,
        },
      };

      const defaultDecks = options.decks ?? {
        "1": {
          id: 1,
          name: "Default",
          mod: Math.floor(now / 1000),
          usn: -1,
          lrnToday: [0, 0],
          revToday: [0, 0],
          newToday: [0, 0],
          timeToday: [0, 0],
          collapsed: false,
          browserCollapsed: false,
          desc: "",
          dyn: 0,
          conf: 1,
          extendNew: 0,
          extendRev: 0,
          reviewLimit: null,
          newLimit: null,
          reviewLimitToday: null,
          newLimitToday: null,
        },
      };

      const defaultConf = {
        schedVer: 2,
        collapseTime: 1200,
        estTimes: true,
        dueCounts: true,
        curDeck: 1,
        newSpread: 0,
        curModel: 1234567890123,
        dayLearnFirst: false,
        timeLim: 0,
        activeDecks: [1],
        sortType: "noteFld",
        nextPos: 1,
        sortBackwards: false,
        addToCur: true,
        creationOffset: 0,
        sched2021: true,
      };

      const defaultDconf = {
        "1": {
          id: 1,
          name: "Default",
          new: {
            delays: [1, 10],
            ints: [1, 4, 0],
            initialFactor: 2500,
            order: 1,
            perDay: 20,
            bury: false,
          },
          rev: {
            perDay: 200,
            ease4: 1.3,
            ivlFct: 1,
            maxIvl: 36500,
            bury: false,
            hardFactor: 1.2,
          },
          lapse: {
            delays: [10],
            mult: 0,
            minInt: 1,
            leechFails: 8,
            leechAction: 0,
          },
          dyn: false,
          maxTaken: 60,
          timer: 0,
          autoplay: true,
          replayq: true,
          mod: 0,
          usn: 0,
          newMix: 0,
          newPerDayMinimum: 0,
          interdayLearningMix: 0,
          reviewOrder: 0,
          newSortOrder: 0,
          newGatherPriority: 0,
          buryInterdayLearning: false,
          fsrsWeights: [],
          desiredRetention: 0.9,
          ignoreRevlogsBeforeDate: "",
          stopTimerOnAnswer: false,
          secondsToShowQuestion: 0.0,
          secondsToShowAnswer: 0.0,
          questionAction: 0,
          answerAction: 0,
          waitForAudio: true,
          sm2Retention: 0.9,
          weightSearch: "",
        },
      };

      db.run("INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        1,
        Math.floor(now / 1000),
        now,
        now,
        11,
        0,
        -1,
        0,
        JSON.stringify(defaultConf),
        JSON.stringify(defaultModels),
        JSON.stringify(defaultDecks),
        JSON.stringify(defaultDconf),
        "{}",
      ]);

      // Insert notes
      if (options.notes) {
        for (const note of options.notes) {
          db.run("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            note.id,
            note.guid,
            note.mid,
            Math.floor(now / 1000),
            -1,
            "",
            note.flds,
            note.flds.split("\u001f")[0] ?? "",
            0,
            0,
            "",
          ]);
        }
      }

      // Insert cards
      if (options.cards) {
        for (const card of options.cards) {
          db.run(
            "INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              card.id,
              card.nid,
              card.did,
              0,
              Math.floor(now / 1000),
              -1,
              0,
              0,
              0,
              0,
              2500,
              0,
              0,
              0,
              0,
              0,
              0,
              "",
            ],
          );
        }
      }

      // Insert reviews
      if (options.reviews) {
        for (const review of options.reviews) {
          db.run("INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            review.id,
            review.cid,
            -1,
            3,
            1,
            0,
            2500,
            5000,
            0,
          ]);
        }
      }

      return Buffer.from(db.export());
    }

    // Helper function to create a ZIP file with specific contents
    async function createTestZip(
      zipPath: string,
      files: { name: string; content: string | Buffer }[],
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip");

        output.on("close", () => {
          resolve();
        });
        archive.on("error", (err) => {
          reject(err);
        });

        archive.pipe(output);
        for (const file of files) {
          archive.append(file.content, { name: file.name });
        }
        void archive.finalize();
      });
    }

    it("should return partial status with valid and invalid notes (best-effort mode)", async () => {
      const zipPath = join(tempDir, "partial-notes.apkg");

      // Create database with 2 valid notes and 1 note referencing non-existent note type
      const validDb = await createAnkiDatabaseWithData({
        notes: [
          {
            id: 1000,
            guid: "valid1",
            mid: 1234567890123, // Valid note type
            flds: "Front 1\u001fBack 1",
          },
          {
            id: 2000,
            guid: "valid2",
            mid: 1234567890123, // Valid note type
            flds: "Front 2\u001fBack 2",
          },
          {
            id: 3000,
            guid: "invalid",
            mid: 9999999999999, // Non-existent note type
            flds: "Invalid\u001fNote",
          },
        ],
        cards: [
          { id: 100, nid: 1000, did: 1 }, // Valid card for valid note
          { id: 200, nid: 2000, did: 1 }, // Valid card for valid note
          { id: 300, nid: 3000, did: 1 }, // Card for invalid note (should be skipped)
        ],
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();
      expect(result.issues.length).toBeGreaterThan(0);

      // Verify invalid note is reported
      const noteIssue = result.issues.find(
        (i) => i.context?.itemType === "note",
      );
      expect(noteIssue).toBeDefined();
      expect(noteIssue?.severity).toBe("error");
      expect(noteIssue?.message).toMatch(/Note.*invalid/i);

      // Verify card for invalid note is also skipped
      const cardIssue = result.issues.find(
        (i) => i.context?.itemType === "card",
      );
      expect(cardIssue).toBeDefined();
      expect(cardIssue?.severity).toBe("error");

      // Verify we still have the valid data
      if (result.data) {
        expect(result.data.getNotes().length).toBe(2); // Only valid notes
        expect(result.data.getCards().length).toBe(2); // Only valid cards
      }
    });

    it("should return failure status in strict mode with recoverable errors", async () => {
      const zipPath = join(tempDir, "strict-mode.apkg");

      // Create database with a note referencing non-existent note type
      const validDb = await createAnkiDatabaseWithData({
        notes: [
          {
            id: 1000,
            guid: "valid",
            mid: 1234567890123,
            flds: "Front\u001fBack",
          },
          {
            id: 2000,
            guid: "invalid",
            mid: 9999999999999, // Non-existent note type
            flds: "Invalid\u001fNote",
          },
        ],
        cards: [{ id: 100, nid: 1000, did: 1 }],
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "strict",
      });

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues.length).toBeGreaterThan(0);

      // Verify error is reported
      const noteIssue = result.issues.find(
        (i) => i.context?.itemType === "note",
      );
      expect(noteIssue).toBeDefined();
      expect(noteIssue?.severity).toBe("error");
    });

    it("should skip cards referencing non-existent decks", async () => {
      const zipPath = join(tempDir, "missing-deck-ref.apkg");

      // Create database with card referencing non-existent deck
      const validDb = await createAnkiDatabaseWithData({
        notes: [
          {
            id: 1000,
            guid: "note1",
            mid: 1234567890123,
            flds: "Front\u001fBack",
          },
        ],
        cards: [
          { id: 100, nid: 1000, did: 1 }, // Valid deck
          { id: 200, nid: 1000, did: 99999 }, // Non-existent deck
        ],
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Verify card error is reported
      const cardIssue = result.issues.find(
        (i) =>
          i.context?.itemType === "card" && i.message.includes("non-existent"),
      );
      expect(cardIssue).toBeDefined();
      expect(cardIssue?.message).toMatch(/deck/i);

      // Verify only valid card remains
      if (result.data) {
        expect(result.data.getCards().length).toBe(1);
      }
    });

    it("should skip reviews referencing non-existent cards", async () => {
      const zipPath = join(tempDir, "missing-card-ref.apkg");

      // Create database with review referencing non-existent card
      const validDb = await createAnkiDatabaseWithData({
        notes: [
          {
            id: 1000,
            guid: "note1",
            mid: 1234567890123,
            flds: "Front\u001fBack",
          },
        ],
        cards: [{ id: 100, nid: 1000, did: 1 }],
        reviews: [
          { id: 1001, cid: 100 }, // Valid card reference
          { id: 1002, cid: 99999 }, // Non-existent card
        ],
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Verify review error is reported
      const reviewIssue = result.issues.find(
        (i) => i.context?.itemType === "review",
      );
      expect(reviewIssue).toBeDefined();
      expect(reviewIssue?.message).toMatch(/non-existent card/i);

      // Verify only valid review remains
      if (result.data) {
        expect(result.data.getReviews().length).toBe(1);
      }
    });

    it("should report all issues in the result", async () => {
      const zipPath = join(tempDir, "multiple-issues.apkg");

      // Create database with multiple types of issues
      const validDb = await createAnkiDatabaseWithData({
        notes: [
          {
            id: 1000,
            guid: "valid",
            mid: 1234567890123,
            flds: "Front\u001fBack",
          },
          {
            id: 2000,
            guid: "invalid-model",
            mid: 8888888888888,
            flds: "Bad\u001fNote",
          },
        ],
        cards: [
          { id: 100, nid: 1000, did: 1 },
          { id: 200, nid: 2000, did: 1 }, // Will be orphaned when note is skipped
          { id: 300, nid: 1000, did: 77777 }, // Non-existent deck
        ],
        reviews: [
          { id: 1001, cid: 100 },
          { id: 1002, cid: 300 }, // Will be orphaned when card is skipped
          { id: 1003, cid: 66666 }, // Non-existent card
        ],
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: validDb },
      ]);

      const result = await AnkiPackage.fromAnkiExport(zipPath, {
        errorHandling: "best-effort",
      });

      expect(result.status).toBe("partial");
      expect(result.data).toBeDefined();

      // Should have multiple issues reported
      expect(result.issues.length).toBeGreaterThanOrEqual(3);

      // Verify different item types are in issues
      const itemTypes = result.issues
        .map((i) => i.context?.itemType)
        .filter(Boolean);
      expect(itemTypes).toContain("note");
      expect(itemTypes).toContain("card");
      expect(itemTypes).toContain("review");
    });

    it("should warn about missing media files", async () => {
      const zipPath = join(tempDir, "missing-media-files.apkg");

      // Create a valid database
      const validDb = await createAnkiDatabaseWithData({});

      // Create media mapping that references files that don't exist in the zip
      const mediaMapping = JSON.stringify({
        "0": "image.png",
        "1": "audio.mp3",
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: mediaMapping },
        { name: "collection.anki21", content: validDb },
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
      const zipPath = join(tempDir, "clean-package.apkg");

      // Create a completely valid database
      const validDb = await createAnkiDatabaseWithData({
        notes: [
          {
            id: 1000,
            guid: "note1",
            mid: 1234567890123,
            flds: "Front 1\u001fBack 1",
          },
        ],
        cards: [{ id: 100, nid: 1000, did: 1 }],
        reviews: [{ id: 1001, cid: 100 }],
      });

      await createTestZip(zipPath, [
        { name: "meta", content: validMetaV2 },
        { name: "media", content: "{}" },
        { name: "collection.anki21", content: validDb },
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

      it("should preserve plugin data in notes and cards during round-trip", async () => {
        // Create an Anki package with plugin data
        const ankiPackage = await AnkiPackage.fromDefault();
        expect(ankiPackage.status).toBe("success");
        const pkg = ankiPackage.data;
        if (!pkg) throw new Error("Package creation failed");

        try {
          // Add a basic deck
          pkg.addDeck({
            id: 1,
            mod: 0,
            name: "Test Deck",
            usn: 0,
            lrnToday: [0, 0],
            revToday: [0, 0],
            newToday: [0, 0],
            timeToday: [0, 0],
            collapsed: false,
            browserCollapsed: false,
            desc: "",
            dyn: 0,
            conf: 1,
            extendNew: 0,
            extendRev: 0,
            reviewLimit: null,
            newLimit: null,
            reviewLimitToday: null,
            newLimitToday: null,
          });

          // Add note type
          pkg.addNoteType({
            id: 1,
            name: "Basic",
            type: 0,
            mod: 0,
            usn: 0,
            sortf: 0,
            did: 1,
            tmpls: [
              {
                id: BigInt(0),
                name: "Card 1",
                ord: 0,
                qfmt: "{{Front}}",
                afmt: "{{Back}}",
                bqfmt: "",
                bafmt: "",
                did: null,
                bfont: "",
                bsize: 0,
              },
            ],
            flds: [
              {
                id: BigInt(0),
                name: "Front",
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
                id: BigInt(1),
                name: "Back",
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
            ],
            css: ".card { font-family: arial; }",
            latexPre: "",
            latexPost: "",
            latexsvg: false,
            req: [[0, "any", [0]]],
            originalStockKind: 1,
          });

          // Add note with plugin data
          const pluginDataForNote = JSON.stringify({
            pluginName: "test-addon",
            customField: "custom value",
          });
          pkg.addNote({
            id: 1,
            guid: "abcdefghij",
            mid: 1,
            mod: 0,
            usn: 0,
            tags: "",
            flds: "Front text\x1fBack text",
            sfld: "Front text",
            csum: 0,
            flags: 0,
            data: pluginDataForNote,
          });

          // Add card with plugin data
          const pluginDataForCard = JSON.stringify({
            pluginName: "card-addon",
            customSetting: "card value",
          });
          pkg.addCard({
            id: 1,
            nid: 1,
            did: 1,
            ord: 0,
            mod: 0,
            usn: 0,
            type: 0,
            queue: 0,
            due: 0,
            ivl: 0,
            factor: 0,
            reps: 0,
            lapses: 0,
            left: 0,
            odue: 0,
            odid: 0,
            flags: 0,
            data: pluginDataForCard,
          });

          // Convert Anki -> SRS
          const srsResult = pkg.toSrsPackage();
          expect(srsResult.status).toBe("success");
          const srsPackage = srsResult.data;
          if (!srsPackage) throw new Error("SRS conversion failed");

          // Convert SRS -> Anki
          const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
          expect(ankiResult.status).toBe("success");
          const convertedAnki = ankiResult.data;
          if (!convertedAnki) throw new Error("Anki conversion failed");

          try {
            // Get the converted notes and cards using public methods
            const convertedNotes = convertedAnki.getNotes();
            const convertedCards = convertedAnki.getCards();

            expect(convertedNotes).toHaveLength(1);
            expect(convertedCards).toHaveLength(1);

            // Verify note plugin data is preserved
            const convertedNote = convertedNotes[0];
            if (!convertedNote) throw new Error("Note not found");
            expect(convertedNote.data).toBe(pluginDataForNote);

            // Verify card plugin data is preserved
            const convertedCard = convertedCards[0];
            if (!convertedCard) throw new Error("Card not found");
            expect(convertedCard.data).toBe(pluginDataForCard);
          } finally {
            await convertedAnki.cleanup();
          }
        } finally {
          await pkg.cleanup();
        }
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

  describe("Mixed Note Type Support", () => {
    it("should detect multiple note types including cloze types", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/mixed-legacy-2.apkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        const noteTypes = ankiPackage.getNoteTypes();
        expect(noteTypes).toHaveLength(6); // Mixed package has 6 note types

        // Find cloze note types
        // - "Cloze"
        // - "Image Occlusion"
        const clozeNoteTypes = noteTypes.filter(
          (nt) => nt.type === NoteTypeKind.CLOZE,
        );
        expect(clozeNoteTypes).toHaveLength(2);
        const clozeTypeNames = clozeNoteTypes.map((nt) => nt.name).sort();
        expect(clozeTypeNames).toEqual(["Cloze", "Image Occlusion"]);

        // Find standard note types:
        // - "Basic"
        // - "Basic (and reversed card)"
        // - "Basic (optional reversed card)"
        // - "Basic (type in the answer)"
        const standardNoteTypes = noteTypes.filter(
          (nt) => nt.type === NoteTypeKind.STANDARD,
        );
        expect(standardNoteTypes).toHaveLength(4); // 4 Basic variants
        const standardNoteNames = standardNoteTypes.map((nt) => nt.name).sort();
        expect(standardNoteNames).toEqual([
          "Basic",
          "Basic (and reversed card)",
          "Basic (optional reversed card)",
          "Basic (type in the answer)",
        ]);
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should preserve cloze content in field values during SRS conversion", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/mixed-legacy-2.apkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        const srsResult = ankiPackage.toSrsPackage();
        const srsPackage = expectSuccess(srsResult);
        const srsNotes = srsPackage.getNotes();

        // Find test cloze notes
        const multiClozeNote = srsNotes.find((note) =>
          note.fieldValues.some(
            ([, value]) =>
              value.includes("{{c1::fields}}") &&
              value.includes("{{c2::hidden}}"),
          ),
        );
        const hintNote = srsNotes.find((note) =>
          note.fieldValues.some(([, value]) =>
            value.includes("{{c1::hints::(something that helps)}}"),
          ),
        );
        const duplicateClozeNote = srsNotes.find((note) =>
          note.fieldValues.some(([, value]) => value.includes("{{c1::cloze}}")),
        );

        expect(multiClozeNote).toBeDefined();
        expect(hintNote).toBeDefined();
        expect(duplicateClozeNote).toBeDefined();
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should round-trip cloze cards successfully", async () => {
      // Load original cloze package
      const loadResult = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/mixed-legacy-2.apkg",
      );
      const originalAnki = expectSuccess(loadResult);

      try {
        // Convert to SRS
        const srsResult = originalAnki.toSrsPackage();
        const srsPackage = expectSuccess(srsResult);

        // Convert back to Anki
        const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
        const convertedAnki = expectSuccess(ankiResult);

        try {
          // Check that we preserved the structure for mixed content
          const noteTypes = convertedAnki.getNoteTypes();
          expect(noteTypes).toHaveLength(6); // Should maintain all 6 note types

          // Check that both cloze and regular note types are preserved
          const clozeTypes = noteTypes.filter(
            (nt) => nt.type === NoteTypeKind.CLOZE,
          );
          const standardTypes = noteTypes.filter(
            (nt) => nt.type === NoteTypeKind.STANDARD,
          );
          expect(clozeTypes).toHaveLength(2); // "Cloze" and "Image Occlusion"
          expect(standardTypes).toHaveLength(4); // 4 Basic variants

          // Check that all 8 notes are preserved
          const notes = convertedAnki.getNotes();
          expect(notes).toHaveLength(8);

          // Check that all 13 cards are still there
          const cards = convertedAnki.getCards();
          expect(cards.length).toBe(13);
        } finally {
          await convertedAnki.cleanup();
        }
      } finally {
        await originalAnki.cleanup();
      }
    });

    it("should generate correct number of cloze cards", async () => {
      const result = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/mixed-legacy-2.apkg",
      );
      const ankiPackage = expectSuccess(result);

      try {
        const notes = ankiPackage.getNotes();
        const cards = ankiPackage.getCards();
        expect(cards).toHaveLength(13); // Mixed package: 7 cloze cards + 6 regular cards

        // Test cloze card generation specifically
        // Find the note with multiple cloze deletions (c1 and c2)
        const multiClozeNote = notes.find(
          (note) =>
            note.flds.includes("{{c1::fields}}") &&
            note.flds.includes("{{c2::hidden}}"),
        );

        expect(multiClozeNote).toBeDefined();

        if (multiClozeNote) {
          const noteCards = cards.filter(
            (card) => card.nid === multiClozeNote.id,
          );
          expect(noteCards).toHaveLength(2); // Should generate 2 cards for 2 cloze deletions

          const ordinals = noteCards.map((card) => card.ord).sort();
          expect(ordinals).toEqual([0, 1]); // Should have ordinals 0 and 1 (for c1 and c2)
        }

        // Test that regular cards are also generated correctly
        const noteTypes = ankiPackage.getNoteTypes();
        const regularNoteTypes = noteTypes.filter(
          (nt) => nt.type === NoteTypeKind.STANDARD,
        );
        expect(regularNoteTypes).toHaveLength(4);
      } finally {
        await ankiPackage.cleanup();
      }
    });
  });

  describe("ID Preservation Tests", () => {
    /**
     * Helper interface to store all IDs extracted from an Anki package
     */
    interface ExtractedIds {
      deckIds: Set<number>;
      noteTypeIds: Set<number>;
      noteIds: Set<number>;
      cardIds: Set<number>;
      reviewIds: Set<number>;
    }

    /**
     * Helper function to extract all IDs from an Anki package
     * This reads the database using public methods to get the raw IDs
     * @param ankiPackage - The Anki package to extract IDs from
     * @returns All extracted IDs organized by entity type
     */
    function extractAllIds(ankiPackage: AnkiPackage): ExtractedIds {
      // Extract deck IDs from decks
      const decks = ankiPackage.getDecks();
      const deckIds = new Set<number>(decks.map((deck) => deck.id));

      // Extract note type IDs from note types
      const noteTypes = ankiPackage.getNoteTypes();
      const noteTypeIds = new Set<number>(noteTypes.map((nt) => nt.id));

      // Extract note IDs
      const notes = ankiPackage.getNotes();
      const noteIds = new Set<number>(notes.map((note) => note.id));

      // Extract card IDs
      const cards = ankiPackage.getCards();
      const cardIds = new Set<number>(
        cards.map((card) => card.id).filter((id): id is number => id !== null),
      );

      // Extract review IDs
      const reviews = ankiPackage.getReviews();
      const reviewIds = new Set<number>(
        reviews
          .map((review) => review.id)
          .filter((id): id is number => id !== null),
      );

      return { deckIds, noteTypeIds, noteIds, cardIds, reviewIds };
    }

    /**
     * Helper function to compare two sets of IDs
     * @param original - The original set of IDs to compare against
     * @param converted - The converted set of IDs to compare
     * @param entityType - The type of entity being compared (for error messages)
     */
    function compareIdSets(
      original: Set<number>,
      converted: Set<number>,
      entityType: string,
    ): void {
      const originalArray = Array.from(original).sort((a, b) => a - b);
      const convertedArray = Array.from(converted).sort((a, b) => a - b);

      expect(
        convertedArray,
        `${entityType} IDs should be preserved exactly after round-trip conversion`,
      ).toEqual(originalArray);
    }

    it("should preserve all entity IDs in multi-cycle round-trip: Anki -> SRS -> Anki -> SRS -> Anki", async () => {
      // Load an Anki package
      const loadResult = await AnkiPackage.fromAnkiExport(
        "./tests/fixtures/anki/mixed-legacy-2.apkg",
      );
      const originalAnki = expectSuccess(loadResult);

      try {
        // Extract IDs from original package
        const originalIds = extractAllIds(originalAnki);

        // First cycle: Anki -> SRS -> Anki
        const srsResult1 = originalAnki.toSrsPackage();
        const srsPackage1 = expectSuccess(srsResult1);

        const ankiResult1 = await AnkiPackage.fromSrsPackage(srsPackage1);
        const convertedAnki1 = expectSuccess(ankiResult1);

        try {
          // Extract IDs after first cycle
          const idsAfterCycle1 = extractAllIds(convertedAnki1);

          // Second cycle: Anki -> SRS -> Anki
          const srsResult2 = convertedAnki1.toSrsPackage();
          const srsPackage2 = expectSuccess(srsResult2);

          const ankiResult2 = await AnkiPackage.fromSrsPackage(srsPackage2);
          const convertedAnki2 = expectSuccess(ankiResult2);

          try {
            // Extract IDs after second cycle
            const idsAfterCycle2 = extractAllIds(convertedAnki2);

            // Filter out default deck (ID=1) from all sets
            const cycle1NonDefault = new Set(
              Array.from(idsAfterCycle1.deckIds).filter((id) => id !== 1),
            );
            const cycle2NonDefault = new Set(
              Array.from(idsAfterCycle2.deckIds).filter((id) => id !== 1),
            );

            // Focus on Note Type, Note, Card, and Review IDs which should be stable
            compareIdSets(
              originalIds.noteTypeIds,
              idsAfterCycle1.noteTypeIds,
              "Note Type (cycle 1)",
            );
            compareIdSets(
              originalIds.noteIds,
              idsAfterCycle1.noteIds,
              "Note (cycle 1)",
            );
            compareIdSets(
              originalIds.cardIds,
              idsAfterCycle1.cardIds,
              "Card (cycle 1)",
            );

            compareIdSets(
              originalIds.noteTypeIds,
              idsAfterCycle2.noteTypeIds,
              "Note Type (cycle 2)",
            );
            compareIdSets(
              originalIds.noteIds,
              idsAfterCycle2.noteIds,
              "Note (cycle 2)",
            );
            compareIdSets(
              originalIds.cardIds,
              idsAfterCycle2.cardIds,
              "Card (cycle 2)",
            );

            // Verify stability between cycles for all entity types
            compareIdSets(
              cycle1NonDefault,
              cycle2NonDefault,
              "Deck (cycle 1 vs 2)",
            );
            compareIdSets(
              idsAfterCycle1.noteTypeIds,
              idsAfterCycle2.noteTypeIds,
              "Note Type (cycle 1 vs 2)",
            );
            compareIdSets(
              idsAfterCycle1.noteIds,
              idsAfterCycle2.noteIds,
              "Note (cycle 1 vs 2)",
            );
            compareIdSets(
              idsAfterCycle1.cardIds,
              idsAfterCycle2.cardIds,
              "Card (cycle 1 vs 2)",
            );
          } finally {
            await convertedAnki2.cleanup();
          }
        } finally {
          await convertedAnki1.cleanup();
        }
      } finally {
        await originalAnki.cleanup();
      }
    });
  });
});
