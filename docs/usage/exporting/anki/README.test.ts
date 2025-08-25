/**
 * Tests for Anki exporting documentation examples
 * Covers all code samples from README.md
 */

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnkiPackage } from "@/anki/anki-package";
import { basicModel, defaultDeck } from "@/anki/constants";

describe("Anki Export Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "srs-converter-export-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Code Sample: Basic Anki Export
  it("should export an Anki package to file", async () => {
    // Create a test Anki package first
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    if (!result.data) {
      throw new Error("Failed to create Anki package");
    }
    const ankiPackage = result.data;

    // Add some test content to make the export meaningful
    ankiPackage.addNoteType(basicModel);

    const testDeck = {
      ...defaultDeck,
      id: Date.now(),
      name: "Export Test Deck",
      desc: "A deck created for testing export functionality",
      mod: Math.floor(Date.now() / 1000),
    };
    ankiPackage.addDeck(testDeck);

    // Add a test note and card
    const testNote = {
      id: Date.now(),
      guid: `ExportNote_${Date.now().toFixed()}`,
      mid: basicModel.id,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      tags: "export test",
      flds: "What does this test verify?\x1fThat Anki export functionality works correctly",
      sfld: "What does this test verify?",
      csum: 0,
      flags: 0,
      data: "",
    };
    ankiPackage.addNote(testNote);

    const testCard = {
      id: Date.now() + 1,
      nid: testNote.id,
      did: testDeck.id,
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
    };
    ankiPackage.addCard(testCard);

    // Test the documentation example: Basic Anki Export
    // Assume ankiPackage is already loaded (see Reading Guide)
    const exportPath = join(tempDir, "my-custom-deck.apkg");
    await ankiPackage.toAnkiExport(exportPath);
    // console.log(`✅ Created Anki package: ${exportPath}`);

    // Verify the export generated a file
    expect(existsSync(exportPath)).toBe(true);
  });
});
