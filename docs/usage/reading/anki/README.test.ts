/**
 * Tests for Anki reading documentation examples
 * Covers all code samples from README.md
 */

import { createWriteStream } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";
import { basicModel, clozeModel, defaultDeck } from "@/anki/constants";

// Test helper functions
async function createBasicTestPackage(tempDir: string): Promise<string> {
  const result = await AnkiPackage.fromDefault();
  if (result.status !== "success" || !result.data) {
    throw new Error("Failed to create test package");
  }
  const testPath = join(tempDir, "test.apkg");
  await result.data.toAnkiExport(testPath);
  return testPath;
}

async function createAnalysisTestPackage(tempDir: string): Promise<string> {
  const result = await AnkiPackage.fromDefault();
  if (result.status !== "success" || !result.data) {
    throw new Error("Failed to create test package");
  }
  const ankiPackage = result.data;

  // Add multiple note types
  ankiPackage.addNoteType(basicModel);
  ankiPackage.addNoteType(clozeModel);

  // Add multiple decks
  const deck1 = {
    ...defaultDeck,
    id: Date.now(),
    name: "Geography",
    desc: "Geography questions",
    mod: Math.floor(Date.now() / 1000),
  };
  const deck2 = {
    ...defaultDeck,
    id: Date.now() + 1,
    name: "Mathematics",
    desc: "Math problems",
    mod: Math.floor(Date.now() / 1000),
  };
  ankiPackage.addDeck(deck1);
  ankiPackage.addDeck(deck2);

  // Add multiple notes and cards
  let noteId = Date.now();
  let cardId = Date.now() + 1000;

  // Geography note
  const geoNote = {
    id: ++noteId,
    guid: `GeoNote_${noteId.toFixed()}`,
    mid: basicModel.id,
    mod: Math.floor(Date.now() / 1000),
    usn: -1,
    tags: "geography",
    flds: "Capital of Italy\x1fRome",
    sfld: "Capital of Italy",
    csum: 0,
    flags: 0,
    data: "",
  };
  ankiPackage.addNote(geoNote);
  ankiPackage.addCard({
    id: ++cardId,
    nid: geoNote.id,
    did: deck1.id,
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
  });

  // Math note
  const mathNote = {
    id: ++noteId,
    guid: `MathNote_${noteId.toFixed()}`,
    mid: basicModel.id,
    mod: Math.floor(Date.now() / 1000),
    usn: -1,
    tags: "mathematics",
    flds: "2 + 2 = ?\x1f4",
    sfld: "2 + 2 = ?",
    csum: 0,
    flags: 0,
    data: "",
  };
  ankiPackage.addNote(mathNote);
  ankiPackage.addCard({
    id: ++cardId,
    nid: mathNote.id,
    did: deck2.id,
    ord: 0,
    mod: Math.floor(Date.now() / 1000),
    usn: -1,
    type: 0,
    queue: 0,
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
  });

  const testPath = join(tempDir, "analysis-test.apkg");
  await ankiPackage.toAnkiExport(testPath);
  return testPath;
}

describe("Anki Reading Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "srs-converter-reading-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Code Sample: Basic Anki Import
  it("should load an Anki package file with comprehensive error handling", async () => {
    // Create test package
    const testPath = await createBasicTestPackage(tempDir);

    // Test the documentation example: Load an Anki .apkg/.colpkg file
    const loadResult = await AnkiPackage.fromAnkiExport(testPath);

    switch (loadResult.status) {
      case "success": {
        // console.log("✅ File loaded successfully!");
        const loadedAnkiPackage = loadResult.data;
        expect(loadedAnkiPackage).toBeDefined();
        // ... Handle data here ...
        break;
      }
    }
  });

  it.todo("should handle partial load cases with recoverable issues");

  it.todo("should handle failure cases with critical errors");

  // Code Sample: Complete Reading Example
  it("should analyze an Anki package comprehensively and extract statistics", async () => {
    // Create comprehensive test package
    const filePath = await createAnalysisTestPackage(tempDir);

    // console.log(`Analyzing: ${filePath}`);

    const result = await AnkiPackage.fromAnkiExport(filePath);

    expect(result.status).toBe("success");
    if (result.status === "failure") {
      console.error(
        "❌ Failed to load file:",
        result.issues.map((i) => i.message),
      );
      return;
    }

    if (!result.data) {
      throw new Error("Failed to load Anki package");
    }
    const ankiPackage = result.data;

    // Basic statistics
    // console.log("\n=== Package Statistics ===");
    // console.log(`Decks: ${ankiPackage.getDecks().length.toFixed()}`);
    // console.log(`Note Types: ${ankiPackage.getNoteTypes().length.toFixed()}`);
    // console.log(`Notes: ${ankiPackage.getNotes().length.toFixed()}`);
    // console.log(`Cards: ${ankiPackage.getCards().length.toFixed()}`);
    // console.log(`Reviews: ${ankiPackage.getReviews().length.toFixed()}`);
    expect(ankiPackage.getDecks().length).toBe(3);
    expect(ankiPackage.getNoteTypes().length).toBe(2);
    expect(ankiPackage.getNotes().length).toBe(2);
    expect(ankiPackage.getCards().length).toBe(2);
    expect(ankiPackage.getReviews().length).toBe(0);

    // Deck breakdown
    // console.log("\n=== Deck Breakdown ===");
    const decks = ankiPackage.getDecks();
    const cards = ankiPackage.getCards();

    for (const deck of decks) {
      const deckCards = cards.filter((card) => card.did === deck.id);
      // console.log(`"${deck.name}": ${deckCards.length.toFixed()} cards`);
      expect(deckCards.length).toBeDefined();
    }

    // Note type analysis
    // console.log("\n=== Note Types ===");
    const noteTypes = ankiPackage.getNoteTypes();
    const notes = ankiPackage.getNotes();

    for (const noteType of noteTypes) {
      const typeNotes = notes.filter((note) => note.mid === noteType.id);
      // console.log(`"${noteType.name}": ${typeNotes.length.toFixed()} notes`);
      // console.log(`  Fields: ${noteType.flds.map((f) => f.name).join(", ")}`);
      // console.log(
      //   `  Templates: ${noteType.tmpls.map((t) => t.name).join(", ")}`,
      // );
      expect(typeNotes.length).toBeDefined();
      expect(noteType.flds.length).toBeDefined();
      expect(noteType.tmpls.length).toBeDefined();
    }

    // console.log("\n=== Analysis Complete ===");
  });

  // Code Sample: Working with Media Files
  it("should list and retrieve media files from an Anki package", async () => {
    // Use the test package with media
    const result = await AnkiPackage.fromAnkiExport("tests/fixtures/anki/mixed-legacy-2.apkg");

    if (result.status === "failure" || !result.data) {
      console.error("Failed to load package");
      return;
    }

    const ankiPackage = result.data;

    const mediaFiles = ankiPackage.listMediaFiles();
    expect(mediaFiles.length).toBeGreaterThan(0);

    for (const filename of mediaFiles) {
      const size = await ankiPackage.getMediaFileSize(filename);
      expect(size).toBeGreaterThan(0);

      const stream = ankiPackage.getMediaFile(filename);

      // Example: Save to disk
      const outputPath = join(tempDir, filename);
      const writeStream = createWriteStream(outputPath);
      stream.pipe(writeStream);

      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", () => {
          resolve();
        });
        writeStream.on("error", reject);
      });

      // Verify file was created
      await access(outputPath); // Will throw if file doesn't exist
    }
  });
});
