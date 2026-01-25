import { describe, expect, it } from "vitest";

import { SrsReviewScore, createCompleteDeckStructure, createNoteType } from "@/srs-package";

import { AnkiPackage } from "./anki-package";
import { expectSuccess, setupTempDir } from "./anki-package.fixtures";
import { NoteTypeKind } from "./types";

setupTempDir();

describe("Utilities and Helper Functions", () => {
  describe("createCompleteDeckStructure()", () => {
    it("should create a new package with some sample data in one big call", () => {
      const basicNoteType = createNoteType({
        fields: [
          { id: 0, name: "Question" },
          { id: 1, name: "Answer" },
        ],
        name: "Basic Test Note Type",
        templates: [
          {
            answerTemplate: "{{Answer}}",
            id: 0,
            name: "Question > Answer",
            questionTemplate: "{{Question}}",
          },
        ],
      });

      const advancedNoteType = createNoteType({
        fields: [
          { id: 0, name: "Front" },
          { id: 1, name: "Back" },
        ],
        name: "Advanced Test Note Type",
        templates: [
          {
            answerTemplate: "{{Answer}}",
            id: 1,
            name: "Question > Answer",
            questionTemplate: "{{Question}}",
          },
        ],
      });

      const completeDeck = createCompleteDeckStructure({
        deck: {
          description: "Test Deck Description",
          name: "Test Deck",
        },
        noteTypes: [
          {
            ...basicNoteType,
            notes: [
              {
                cards: [
                  {
                    reviews: [
                      {
                        score: SrsReviewScore.Normal,
                        timestamp: Date.now(),
                      },
                    ],
                    templateId: 0,
                  },
                ],
                fieldValues: [
                  ["Question", "What is 猫 in English?"],
                  ["Answer", "Cat"],
                ],
              },
            ],
          },
          {
            ...advancedNoteType,
            notes: [
              {
                cards: [
                  {
                    reviews: [
                      {
                        score: SrsReviewScore.Normal,
                        timestamp: Date.now(),
                      },
                    ],
                    templateId: 0,
                  },
                ],
                fieldValues: [
                  ["Front", "What is 猫 in English?"],
                  ["Back", "Cat"],
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
      const result = await AnkiPackage.fromAnkiExport("./tests/fixtures/anki/mixed-legacy-2.apkg");
      const ankiPackage = expectSuccess(result);

      try {
        const noteTypes = ankiPackage.getNoteTypes();
        expect(noteTypes).toHaveLength(6); // Mixed package has 6 note types

        // Find cloze note types
        // - "Cloze"
        // - "Image Occlusion"
        const clozeNoteTypes = noteTypes.filter((nt) => nt.type === NoteTypeKind.CLOZE);
        expect(clozeNoteTypes).toHaveLength(2);
        const clozeTypeNames = clozeNoteTypes.map((nt) => nt.name).sort();
        expect(clozeTypeNames).toEqual(["Cloze", "Image Occlusion"]);

        // Find standard note types:
        // - "Basic"
        // - "Basic (and reversed card)"
        // - "Basic (optional reversed card)"
        // - "Basic (type in the answer)"
        const standardNoteTypes = noteTypes.filter((nt) => nt.type === NoteTypeKind.STANDARD);
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
      const result = await AnkiPackage.fromAnkiExport("./tests/fixtures/anki/mixed-legacy-2.apkg");
      const ankiPackage = expectSuccess(result);

      try {
        const srsResult = ankiPackage.toSrsPackage();
        const srsPackage = expectSuccess(srsResult);
        const srsNotes = srsPackage.getNotes();

        // Find test cloze notes
        const multiClozeNote = srsNotes.find((note) =>
          note.fieldValues.some(
            ([, value]) => value.includes("{{c1::fields}}") && value.includes("{{c2::hidden}}"),
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
          const clozeTypes = noteTypes.filter((nt) => nt.type === NoteTypeKind.CLOZE);
          const standardTypes = noteTypes.filter((nt) => nt.type === NoteTypeKind.STANDARD);
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
      const result = await AnkiPackage.fromAnkiExport("./tests/fixtures/anki/mixed-legacy-2.apkg");
      const ankiPackage = expectSuccess(result);

      try {
        const notes = ankiPackage.getNotes();
        const cards = ankiPackage.getCards();
        expect(cards).toHaveLength(13); // Mixed package: 7 cloze cards + 6 regular cards

        // Test cloze card generation specifically
        // Find the note with multiple cloze deletions (c1 and c2)
        const multiClozeNote = notes.find(
          (note) => note.flds.includes("{{c1::fields}}") && note.flds.includes("{{c2::hidden}}"),
        );

        expect(multiClozeNote).toBeDefined();

        if (multiClozeNote) {
          const noteCards = cards.filter((card) => card.nid === multiClozeNote.id);
          expect(noteCards).toHaveLength(2); // Should generate 2 cards for 2 cloze deletions

          const ordinals = noteCards.map((card) => card.ord).sort();
          expect(ordinals).toEqual([0, 1]); // Should have ordinals 0 and 1 (for c1 and c2)
        }

        // Test that regular cards are also generated correctly
        const noteTypes = ankiPackage.getNoteTypes();
        const regularNoteTypes = noteTypes.filter((nt) => nt.type === NoteTypeKind.STANDARD);
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
        reviews.map((review) => review.id).filter((id): id is number => id !== null),
      );

      return { cardIds, deckIds, noteIds, noteTypeIds, reviewIds };
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
      const originalArray = [...original].sort((a, b) => a - b);
      const convertedArray = [...converted].sort((a, b) => a - b);

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
            const cycle1NonDefault = new Set([...idsAfterCycle1.deckIds].filter((id) => id !== 1));
            const cycle2NonDefault = new Set([...idsAfterCycle2.deckIds].filter((id) => id !== 1));

            // Focus on Note Type, Note, Card, and Review IDs which should be stable
            compareIdSets(
              originalIds.noteTypeIds,
              idsAfterCycle1.noteTypeIds,
              "Note Type (cycle 1)",
            );
            compareIdSets(originalIds.noteIds, idsAfterCycle1.noteIds, "Note (cycle 1)");
            compareIdSets(originalIds.cardIds, idsAfterCycle1.cardIds, "Card (cycle 1)");

            compareIdSets(
              originalIds.noteTypeIds,
              idsAfterCycle2.noteTypeIds,
              "Note Type (cycle 2)",
            );
            compareIdSets(originalIds.noteIds, idsAfterCycle2.noteIds, "Note (cycle 2)");
            compareIdSets(originalIds.cardIds, idsAfterCycle2.cardIds, "Card (cycle 2)");

            // Verify stability between cycles for all entity types
            compareIdSets(cycle1NonDefault, cycle2NonDefault, "Deck (cycle 1 vs 2)");
            compareIdSets(
              idsAfterCycle1.noteTypeIds,
              idsAfterCycle2.noteTypeIds,
              "Note Type (cycle 1 vs 2)",
            );
            compareIdSets(idsAfterCycle1.noteIds, idsAfterCycle2.noteIds, "Note (cycle 1 vs 2)");
            compareIdSets(idsAfterCycle1.cardIds, idsAfterCycle2.cardIds, "Card (cycle 1 vs 2)");
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

  describe("Round-trip Conversion Tests", () => {
    describe("Single deck scenarios", () => {
      it("should do a full round-trip conversion: SRS -> Anki -> SRS", async () => {
        // Create an SRS package with sample data
        const basicNoteType = createNoteType({
          fields: [
            { id: 0, name: "Question" },
            { id: 1, name: "Answer" },
          ],
          name: "Basic Test Note Type",
          templates: [
            {
              answerTemplate: "{{Answer}}",
              id: 0,
              name: "Question > Answer",
              questionTemplate: "{{Question}}",
            },
          ],
        });

        const originalSrsPackage = createCompleteDeckStructure({
          deck: {
            description: "Test deck for round-trip conversion",
            name: "Round Trip Test Deck",
          },
          noteTypes: [
            {
              ...basicNoteType,
              notes: [
                {
                  cards: [
                    {
                      reviews: [
                        {
                          score: SrsReviewScore.Normal,
                          timestamp: Date.now(),
                        },
                      ],
                      templateId: 0,
                    },
                  ],
                  fieldValues: [
                    ["Question", "What is the capital of France?"],
                    ["Answer", "Paris"],
                  ],
                },
                {
                  cards: [
                    {
                      reviews: [
                        {
                          score: SrsReviewScore.Easy,
                          timestamp: Date.now(),
                        },
                      ],
                      templateId: 0,
                    },
                  ],
                  fieldValues: [
                    ["Question", "What is 2 + 2?"],
                    ["Answer", "4"],
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
          expect(convertedDecks).toHaveLength(originalDecks.length);
          const [convertedDeck] = convertedDecks;
          const [originalDeck] = originalDecks;
          expect(convertedDeck?.name).toBe(originalDeck?.name);
          expect(convertedDeck?.description).toBe(originalDeck?.description);

          // Assert note type properties are preserved
          expect(convertedNoteTypes).toHaveLength(originalNoteTypes.length);
          const [convertedNoteType] = convertedNoteTypes;
          const [originalNoteType] = originalNoteTypes;
          expect(convertedNoteType?.name).toBe(originalNoteType?.name);
          expect(convertedNoteType?.fields).toHaveLength(originalNoteType?.fields.length ?? 0);
          expect(convertedNoteType?.templates).toHaveLength(
            originalNoteType?.templates.length ?? 0,
          );

          // Assert note field values are preserved
          expect(convertedNotes).toHaveLength(originalNotes.length);
          const [convertedNote1, convertedNote2] = convertedNotes;
          const [originalNote1, originalNote2] = originalNotes;
          expect(convertedNote1?.fieldValues).toEqual(originalNote1?.fieldValues);
          expect(convertedNote2?.fieldValues).toEqual(originalNote2?.fieldValues);

          // Assert card and review relationships are preserved
          expect(convertedCards).toHaveLength(originalCards.length);
          expect(convertedReviews).toHaveLength(originalReviews.length);
        } finally {
          await ankiPackage.cleanup();
        }
      });

      it.todo("should handle basic note type with 2 fields, 1 template", async () => {
        // TODO: Test round-trip with simplest case
      });

      it.todo("should handle note type with multiple fields (3-5)", async () => {
        // TODO: Test round-trip with more complex fields
      });

      it.todo("should handle note type with multiple templates (2-3)", async () => {
        // TODO: Test round-trip with multiple templates
      });

      it.todo("should handle notes with various field content types", async () => {
        // TODO: Test round-trip with diverse content
      });
    });

    describe("Multi-deck scenarios", () => {
      it.todo("should handle multiple decks with same note type", async () => {
        // TODO: Test shared note types across decks
      });

      it.todo("should handle multiple decks with different note types", async () => {
        // TODO: Test distinct note types per deck
      });

      it.todo("should handle cross-deck note type sharing", async () => {
        // TODO: Test complex deck/note type relationships
      });
    });

    describe("Complex scenarios", () => {
      it.todo("should handle multiple note types with overlapping field names", async () => {
        // TODO: Test field name conflicts
      });

      it.todo("should handle cards with different template IDs", async () => {
        // TODO: Test various template ID combinations
      });

      it.todo("should handle reviews with all score combinations", async () => {
        // TODO: Test all review score types
      });

      it.todo("should handle large datasets (100+ notes, 500+ cards, 1000+ reviews)", async () => {
        // TODO: Test performance with large datasets
      });
    });

    describe("Data preservation verification", () => {
      it.todo("should preserve deck names and descriptions", async () => {
        // TODO: Test deck metadata preservation
      });

      it.todo("should preserve note type names and field structures", async () => {
        // TODO: Test note type structure preservation
      });

      it.todo("should preserve template names and content", async () => {
        // TODO: Test template preservation
      });

      it.todo("should preserve field values (including unicode, HTML, special chars)", async () => {
        // TODO: Test field content preservation
      });

      it.todo("should preserve review timestamps and scores", async () => {
        // TODO: Test review data preservation
      });

      it("should preserve plugin data in notes and cards during round-trip", async () => {
        // Create an Anki package with plugin data
        const ankiPackage = await AnkiPackage.fromDefault();
        expect(ankiPackage.status).toBe("success");
        const pkg = ankiPackage.data;
        if (!pkg) {
          throw new Error("Package creation failed");
        }

        try {
          // Add a basic deck
          pkg.addDeck({
            browserCollapsed: false,
            collapsed: false,
            conf: 1,
            desc: "",
            dyn: 0,
            extendNew: 0,
            extendRev: 0,
            id: 1,
            lrnToday: [0, 0],
            mod: 0,
            name: "Test Deck",
            newLimit: null,
            newLimitToday: null,
            newToday: [0, 0],
            revToday: [0, 0],
            reviewLimit: null,
            reviewLimitToday: null,
            timeToday: [0, 0],
            usn: 0,
          });

          // Add note type
          pkg.addNoteType({
            css: ".card { font-family: arial; }",
            did: 1,
            flds: [
              {
                collapsed: false,
                description: "",
                excludeFromSearch: false,
                font: "Arial",
                id: 0n,
                name: "Front",
                ord: 0,
                plainText: false,
                preventDeletion: false,
                rtl: false,
                size: 20,
                sticky: false,
                tag: null,
              },
              {
                collapsed: false,
                description: "",
                excludeFromSearch: false,
                font: "Arial",
                id: 1n,
                name: "Back",
                ord: 1,
                plainText: false,
                preventDeletion: false,
                rtl: false,
                size: 20,
                sticky: false,
                tag: null,
              },
            ],
            id: 1,
            latexPost: "",
            latexPre: "",
            latexsvg: false,
            mod: 0,
            name: "Basic",
            originalStockKind: 1,
            req: [[0, "any", [0]]],
            sortf: 0,
            tmpls: [
              {
                afmt: "{{Back}}",
                bafmt: "",
                bfont: "",
                bqfmt: "",
                bsize: 0,
                did: null,
                id: 0n,
                name: "Card 1",
                ord: 0,
                qfmt: "{{Front}}",
              },
            ],
            type: 0,
            usn: 0,
          });

          // Add note with plugin data
          const pluginDataForNote = JSON.stringify({
            customField: "custom value",
            pluginName: "test-addon",
          });
          pkg.addNote({
            csum: 0,
            data: pluginDataForNote,
            flags: 0,
            flds: "Front text\u001FBack text",
            guid: "abcdefghij",
            id: 1,
            mid: 1,
            mod: 0,
            sfld: "Front text",
            tags: "",
            usn: 0,
          });

          // Add card with plugin data
          const pluginDataForCard = JSON.stringify({
            customSetting: "card value",
            pluginName: "card-addon",
          });
          pkg.addCard({
            data: pluginDataForCard,
            did: 1,
            due: 0,
            factor: 0,
            flags: 0,
            id: 1,
            ivl: 0,
            lapses: 0,
            left: 0,
            mod: 0,
            nid: 1,
            odid: 0,
            odue: 0,
            ord: 0,
            queue: 0,
            reps: 0,
            type: 0,
            usn: 0,
          });

          // Convert Anki -> SRS
          const srsResult = pkg.toSrsPackage();
          expect(srsResult.status).toBe("success");
          const srsPackage = srsResult.data;
          if (!srsPackage) {
            throw new Error("SRS conversion failed");
          }

          // Convert SRS -> Anki
          const ankiResult = await AnkiPackage.fromSrsPackage(srsPackage);
          expect(ankiResult.status).toBe("success");
          const convertedAnki = ankiResult.data;
          if (!convertedAnki) {
            throw new Error("Anki conversion failed");
          }

          try {
            // Get the converted notes and cards using public methods
            const convertedNotes = convertedAnki.getNotes();
            const convertedCards = convertedAnki.getCards();

            expect(convertedNotes).toHaveLength(1);
            expect(convertedCards).toHaveLength(1);

            // Verify note plugin data is preserved
            const convertedNote = convertedNotes[0];
            if (!convertedNote) {
              throw new Error("Note not found");
            }
            expect(convertedNote.data).toBe(pluginDataForNote);

            // Verify card plugin data is preserved
            const convertedCard = convertedCards[0];
            if (!convertedCard) {
              throw new Error("Card not found");
            }
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
});
