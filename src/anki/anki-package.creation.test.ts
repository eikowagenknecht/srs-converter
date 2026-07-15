import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import { expectSuccess } from "./anki-package.fixtures";
import { defaultConfig, defaultDeck } from "./constants";

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

    it("should expose the media mapping and database contents via toString()", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      try {
        const packageString = ankiPackage.toString();
        expect(packageString).toMatch(/^AnkiPackage\n/u);
        expect(packageString).toContain("Media file mapping: {}");
        expect(packageString).toContain("Database contents:");
      } finally {
        await ankiPackage.cleanup();
      }
    });

    it("should release media storage on cleanup()", async () => {
      const result = await AnkiPackage.fromDefault();
      const ankiPackage = expectSuccess(result);

      await ankiPackage.addMediaFile("note.txt", new TextEncoder().encode("content"));
      expect(await ankiPackage.getMediaFile("note.txt")).toBeDefined();

      const cleanupIssues = await ankiPackage.cleanup();
      expect(cleanupIssues).toEqual([]);

      // The backing storage is disposed: the media content is gone.
      expect(ankiPackage.listMediaFiles()).toEqual([]);
      await expect(ankiPackage.getMediaFile("note.txt")).rejects.toThrow();
    });
  });
});
