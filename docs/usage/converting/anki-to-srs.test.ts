/**
 * Tests for Anki to SRS conversion documentation examples
 * Covers all code samples from anki-to-srs.md
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* biome-ignore-all lint/correctness/noUnusedFunctionParameters: Keep example simple. */

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
async function createTestAnkiPackage(
  namePrefix = "Test",
): Promise<AnkiPackage> {
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
    id: Date.now(),
    guid: `${namePrefix}Note_${Date.now().toFixed()}`,
    mid: basicModel.id,
    mod: Math.floor(Date.now() / 1000),
    usn: -1,
    tags: "",
    flds: `${namePrefix} Question\x1f${namePrefix} Answer`,
    sfld: `${namePrefix} Question`,
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

  return ankiPackage;
}

describe("Anki to SRS Conversion Documentation Examples", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "srs-converter-anki-to-srs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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

  it.todo(
    "should handle partial conversion with data corruption or missing fields",
  );

  it.todo(
    "should handle failure conversion when package is invalid or corrupted",
  );

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

  it.todo(
    "should handle failure conversion in strict mode when minor issues occur",
  );
});
