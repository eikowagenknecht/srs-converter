/**
 * Tests for Anki to SRS conversion documentation examples
 * Covers all code samples from anki-to-srs.md
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";
import { basicModel, defaultDeck } from "@/anki/constants";

/**
 * Helper function to create a test Anki package with sample data
 * This sets up the necessary preparation state for documentation examples
 * @param namePrefix - Prefix for naming test entities (default: "Test")
 * @returns Promise<AnkiPackage> - A configured AnkiPackage with test data
 */
async function createTestAnkiPackage(namePrefix = "Test"): Promise<AnkiPackage> {
  const result = await AnkiPackage.fromDefault();
  expect(result.status).toBe("success");
  if (result.status !== "success") {
    throw new Error("Failed to create test AnkiPackage");
  }
  const ankiPackage = result.data;
  if (!ankiPackage) {
    throw new Error("AnkiPackage data should be defined on success");
  }

  ankiPackage.addNoteType(basicModel);

  const testDeck = {
    ...defaultDeck,
    id: Date.now(),
    name: `${namePrefix} Deck`,
    desc: `${namePrefix} deck for conversion`,
    mod: Math.floor(Date.now() / 1000),
  };
  ankiPackage.addDeck(testDeck);

  const testNote = {
    csum: 0,
    data: "",
    flags: 0,
    flds: `${namePrefix} Question\u001F${namePrefix} Answer`,
    guid: `${namePrefix}Note_${Date.now().toFixed(0)}`,
    id: Date.now(),
    mid: basicModel.id,
    mod: Math.floor(Date.now() / 1000),
    sfld: `${namePrefix} Question`,
    tags: "",
    usn: -1,
  };
  ankiPackage.addNote(testNote);

  const testCard = {
    data: "",
    did: testDeck.id,
    due: 1,
    factor: 0,
    flags: 0,
    id: Date.now() + 1,
    ivl: 0,
    lapses: 0,
    left: 0,
    mod: Math.floor(Date.now() / 1000),
    nid: testNote.id,
    odid: 0,
    odue: 0,
    ord: 0,
    queue: 0,
    reps: 0,
    type: 0,
    usn: -1,
  };
  ankiPackage.addCard(testCard);

  return ankiPackage;
}

describe("Anki to SRS Conversion Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "srs-converter-anki-to-srs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  // Code Sample 1.1: Basic Conversion
  it("should convert Anki package to SRS format with comprehensive error handling", async () => {
    // Setup (not in the docs)
    const ankiPackage = await createTestAnkiPackage();

    // Test the documentation example: Basic Conversion
    const srsResult = ankiPackage.toSrsPackage();

    switch (srsResult.status) {
      case "success": {
        // console.log("✅ Conversion completed successfully!");
        const srsPackage = srsResult.data;
        expect(srsPackage).toBeDefined();
        if (!srsPackage) {
          throw new Error("srsPackage should be defined on success");
        }
        expect(srsPackage.getDecks().length).toBeGreaterThan(0);
        break;
      }

      case "partial": {
        // console.log("⚠️ Conversion completed with issues:");
        srsResult.issues.forEach((issue) => {
          console.log(`${issue.severity}: ${issue.message}`);
        });
        // Still usable, but might miss some data
        const partialData = srsResult.data;
        expect(partialData).toBeDefined();
        break;
      }

      case "failure": {
        // console.log("❌ Conversion failed:");
        srsResult.issues.forEach((_issue) => {
          // console.log(`CRITICAL: ${_issue.message}`);
        });
        throw new Error("Conversion should not fail for valid package");
      }
    }

    // Verify we got a successful conversion
    expect(srsResult.status).toBe("success");
    expect(srsResult.data).toBeDefined();
  });

  it.todo("should handle partial conversion with data corruption or missing fields");

  it.todo("should handle failure conversion when package is invalid or corrupted");

  // Code Sample 1.2: Strict Mode
  it("should convert Anki package to SRS with strict mode error handling", async () => {
    // Setup (not in the docs)
    const ankiPackage = await createTestAnkiPackage("Strict");

    // Test the documentation example: Strict Mode
    const srsResult = ankiPackage.toSrsPackage({ errorHandling: "strict" });

    switch (srsResult.status) {
      case "success": {
        // console.log("✅ Conversion completed successfully!");
        const srsPackage = srsResult.data;
        expect(srsPackage).toBeDefined();
        expect(srsPackage?.getDecks().length).toBeGreaterThan(0);
        break;
      }

      case "failure": {
        // console.log("❌ Conversion failed:");
        srsResult.issues.forEach((_issue) => {
          // console.log(`CRITICAL: ${issue.message}`);
        });
        expect(srsResult.data).toBeUndefined();
        break;
      }
    }

    expect(srsResult.status).toBe("success");
    expect(srsResult.data).toBeDefined();
  });

  it.todo("should handle failure conversion in strict mode when minor issues occur");

  // Code Sample: Plugin Data Preservation
  it("should preserve plugin data in round-trip conversion", async () => {
    // Create an Anki package with plugin data
    const result = await AnkiPackage.fromDefault();
    expect(result.status).toBe("success");
    const ankiPackage = result.data;
    if (!ankiPackage) {
      throw new Error("Package creation failed");
    }

    try {
      // Set up basic structure
      ankiPackage.addNoteType(basicModel);
      const testDeck = {
        ...defaultDeck,
        id: Date.now(),
        name: "Test Deck",
      };
      ankiPackage.addDeck(testDeck);

      // Add note with plugin data
      const pluginData = JSON.stringify({
        customField: "custom value",
        pluginName: "test-addon",
      });
      const testNote = {
        csum: 0,
        data: pluginData,
        flags: 0,
        flds: "Front text\u001FBack text",
        guid: `TestNote_${Date.now().toFixed(0)}`,
        id: Date.now(),
        mid: basicModel.id,
        mod: Math.floor(Date.now() / 1000),
        sfld: "Front text",
        tags: "",
        usn: -1,
      };
      ankiPackage.addNote(testNote);

      // Add card with plugin data
      const cardPluginData = JSON.stringify({
        customSetting: "card value",
        pluginName: "card-addon",
      });
      const testCard = {
        data: cardPluginData,
        did: testDeck.id,
        due: 1,
        factor: 0,
        flags: 0,
        id: Date.now() + 1,
        ivl: 0,
        lapses: 0,
        left: 0,
        mod: Math.floor(Date.now() / 1000),
        nid: testNote.id,
        odid: 0,
        odue: 0,
        ord: 0,
        queue: 0,
        reps: 0,
        type: 0,
        usn: -1,
      };
      ankiPackage.addCard(testCard);

      // Convert Anki -> SRS
      const srsResult = ankiPackage.toSrsPackage();
      expect(srsResult.status).toBe("success");
      const srsPackage = srsResult.data;
      if (!srsPackage) {
        throw new Error("SRS conversion failed");
      }

      // Plugin data is now stored in applicationSpecificData.ankiData
      const notes = srsPackage.getNotes();
      expect(notes.length).toBeGreaterThan(0);
      const noteWithPlugin = notes.find(
        (n) => n.applicationSpecificData?.["ankiData"] === pluginData,
      );
      expect(noteWithPlugin).toBeDefined();
      expect(noteWithPlugin?.applicationSpecificData?.["ankiData"]).toBe(pluginData);

      const cards = srsPackage.getCards();
      expect(cards.length).toBeGreaterThan(0);
      const cardWithPlugin = cards.find(
        (c) => c.applicationSpecificData?.["ankiData"] === cardPluginData,
      );
      expect(cardWithPlugin).toBeDefined();
      expect(cardWithPlugin?.applicationSpecificData?.["ankiData"]).toBe(cardPluginData);

      // Convert SRS -> Anki
      const reconvertedResult = await AnkiPackage.fromSrsPackage(srsPackage);
      expect(reconvertedResult.status).toBe("success");
      const reconvertedAnki = reconvertedResult.data;
      if (!reconvertedAnki) {
        throw new Error("Anki conversion failed");
      }

      try {
        // Original plugin data is restored to the data field
        const reconvertedNotes = reconvertedAnki.getNotes();
        expect(reconvertedNotes.length).toBeGreaterThan(0);
        const restoredNote = reconvertedNotes.find((n) => n.data === pluginData);
        expect(restoredNote).toBeDefined();
        expect(restoredNote?.data).toBe(pluginData);

        const reconvertedCards = reconvertedAnki.getCards();
        expect(reconvertedCards.length).toBeGreaterThan(0);
        const restoredCard = reconvertedCards.find((c) => c.data === cardPluginData);
        expect(restoredCard).toBeDefined();
        expect(restoredCard?.data).toBe(cardPluginData);
      } finally {
        await reconvertedAnki.cleanup();
      }
    } finally {
      await ankiPackage.cleanup();
    }
  });
});
