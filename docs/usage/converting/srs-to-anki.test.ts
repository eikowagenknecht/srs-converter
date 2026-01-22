/**
 * Tests for SRS to Anki conversion documentation examples
 * Covers all code samples from srs-to-anki.md
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";
import { SrsPackage, createDeck, createNote, createNoteType } from "@/srs-package";

/**
 * Helper function to create a test SRS package with sample data
 * This sets up the necessary preparation state for documentation examples
 * @param namePrefix - Prefix for naming test entities (default: "Test")
 * @returns SrsPackage - A configured SrsPackage with test data
 */
function createTestSrsPackage(namePrefix = "Test"): SrsPackage {
  const srsPackage = new SrsPackage();

  // Create a basic note type
  const noteType = createNoteType({
    fields: [
      { id: 0, name: "Front" },
      { id: 1, name: "Back" },
    ],
    name: `${namePrefix} Note Type`,
    templates: [
      {
        answerTemplate: "{{FrontSide}}<hr id='answer'>{{Back}}",
        id: 0,
        name: "Card 1",
        questionTemplate: "{{Front}}",
      },
    ],
  });
  srsPackage.addNoteType(noteType);

  // Create a test deck
  const deck = createDeck({
    description: `${namePrefix} deck for conversion testing`,
    name: `${namePrefix} Deck`,
  });
  srsPackage.addDeck(deck);

  // Create test notes
  const testNote = createNote(
    {
      deckId: deck.id,
      fieldValues: [
        ["Front", `${namePrefix} Question`],
        ["Back", `${namePrefix} Answer`],
      ],
      noteTypeId: noteType.id,
    },
    noteType,
  );
  srsPackage.addNote(testNote);

  return srsPackage;
}

describe("SRS to Anki Conversion Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "srs-converter-srs-to-anki-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  // Code Sample 1.1: Basic Conversion
  it("should convert SRS package to Anki format with result handling and file export", async () => {
    // Setup (not in the docs)
    const srsPackage = createTestSrsPackage();

    // Test the documentation example: Basic Conversion
    const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
    expect(ankiResult.status).toBe("success");

    switch (ankiResult.status) {
      case "success": {
        // console.log("✅ Conversion successful!");
        const exportPath = join(tempDir, "output.apkg");
        if (ankiResult.data) {
          await ankiResult.data.toAnkiExport(exportPath);
        }
        expect(ankiResult.data).toBeDefined();
        break;
      }

      case "partial": {
        // console.warn("⚠️ Conversion completed with issues:");
        ankiResult.issues.forEach((_issue) => {
          // console.warn(`${_issue.severity}: ${_issue.message}`);
        });
        // Still usable, but might miss some data
        const partialExportPath = join(tempDir, "output-partial.apkg");
        if (ankiResult.data) {
          await ankiResult.data.toAnkiExport(partialExportPath);
        }
        expect(ankiResult.data).toBeDefined();
        break;
      }

      case "failure": {
        // console.error("❌ Conversion failed:");
        ankiResult.issues.forEach((_issue) => {
          // console.error(`ERROR: ${_issue.message}`);
        });
        throw new Error("Conversion should not fail for valid SRS package");
      }
    }
  });

  it.todo("should handle partial conversion with data loss or compatibility issues");

  it.todo("should handle failure conversion when SRS package is invalid or corrupted");

  // Code Sample 1.2: Strict Mode
  it("should convert SRS to Anki in strict mode with no partial results", async () => {
    // Setup (not in the docs)
    const srsPackage = createTestSrsPackage("Strict");

    // Test the documentation example: Strict Mode
    const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage, {
      errorHandling: "strict",
    });
    expect(ankiResult.status).toBe("success");

    switch (ankiResult.status) {
      case "success": {
        // console.log("✅ Conversion successful!");
        const exportPath = join(tempDir, "output.apkg");
        if (ankiResult.data) {
          await ankiResult.data.toAnkiExport(exportPath);
          expect(ankiResult.data.getDecks().length).toBeGreaterThan(0);
        }
        expect(ankiResult.data).toBeDefined();
        break;
      }

      case "failure": {
        // console.error("❌ Conversion failed:");
        ankiResult.issues.forEach((_issue) => {
          // console.error(`ERROR: ${_issue.message}`);
        });
        expect(ankiResult.data).toBeUndefined();
        break;
      }
    }

    expect(ankiResult.data).toBeDefined();
  });

  it.todo("should handle failure conversion in strict mode when minor compatibility issues occur");
});
