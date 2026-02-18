import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import { expectSuccess, setupTempDir } from "./anki-package.fixtures";
import { defaultConfig, defaultDeck } from "./constants";

setupTempDir();

describe("Creation", () => {
  describe("fromDefault()", () => {
    it("should create a valid AnkiPackage from default database", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
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
        if (!decks[0]) {
          throw new Error("Default deck not found");
        }
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
