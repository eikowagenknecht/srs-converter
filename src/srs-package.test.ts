import { describe, expect, it } from "vitest";

import {
  BasicAndReverseNote,
  SrsPackage,
  createCard,
  createDeck,
  createNote,
  createNoteType,
} from "@/srs-package";

describe("SrsPackage constants and factories", () => {
  describe("createNote()", () => {
    it("stores field values in note-type field order regardless of input order (F8)", () => {
      const noteType = createNoteType({
        fields: [
          { id: 0, name: "Front" },
          { id: 1, name: "Back" },
        ],
        name: "Basic",
        templates: [
          { answerTemplate: "{{Back}}", id: 0, name: "Card 1", questionTemplate: "{{Front}}" },
        ],
      });

      const note = createNote(
        {
          deckId: "deck",
          fieldValues: [
            ["Back", "back-value"],
            ["Front", "front-value"],
          ],
          noteTypeId: noteType.id,
        },
        noteType,
      );

      expect(note.fieldValues).toEqual([
        ["Front", "front-value"],
        ["Back", "back-value"],
      ]);
    });

    it("keeps already-ordered field values unchanged", () => {
      const noteType = createNoteType({
        fields: [
          { id: 0, name: "Front" },
          { id: 1, name: "Back" },
        ],
        name: "Basic",
        templates: [
          { answerTemplate: "{{Back}}", id: 0, name: "Card 1", questionTemplate: "{{Front}}" },
        ],
      });

      const note = createNote(
        {
          deckId: "deck",
          fieldValues: [
            ["Front", "front-value"],
            ["Back", "back-value"],
          ],
          noteTypeId: noteType.id,
        },
        noteType,
      );

      expect(note.fieldValues).toEqual([
        ["Front", "front-value"],
        ["Back", "back-value"],
      ]);
    });
  });

  describe("BasicAndReverseNote", () => {
    it("ships two mutually reversed templates (F10)", () => {
      const [first, second] = BasicAndReverseNote.templates;
      expect(first).toBeDefined();
      expect(second).toBeDefined();

      // The reverse template must actually differ from the forward one.
      expect(second?.questionTemplate).not.toBe(first?.questionTemplate);
      expect(second?.answerTemplate).not.toBe(first?.answerTemplate);

      // Forward shows Front → Back, reverse shows Back → Front.
      expect(first?.questionTemplate).toBe("{{Front}}");
      expect(first?.answerTemplate).toBe("{{Back}}");
      expect(second?.questionTemplate).toBe("{{Back}}");
      expect(second?.answerTemplate).toBe("{{Front}}");

      // The two templates are exact mirrors of each other.
      expect(second?.questionTemplate).toBe(first?.answerTemplate);
      expect(second?.answerTemplate).toBe(first?.questionTemplate);
    });
  });

  describe("removeUnused()", () => {
    it("returns the removed decks, note types, and card-less notes (F15)", () => {
      const pkg = new SrsPackage();

      const usedDeck = createDeck({ name: "Used Deck" });
      const emptyDeck = createDeck({ name: "Empty Deck" });
      pkg.addDeck(usedDeck);
      pkg.addDeck(emptyDeck);

      const usedNoteType = createNoteType({
        fields: [{ id: 0, name: "Front" }],
        name: "Used Type",
        templates: [
          { answerTemplate: "{{Front}}", id: 0, name: "Card 1", questionTemplate: "{{Front}}" },
        ],
      });
      const unusedNoteType = createNoteType({
        fields: [{ id: 0, name: "Front" }],
        name: "Unused Type",
        templates: [
          { answerTemplate: "{{Front}}", id: 0, name: "Card 1", questionTemplate: "{{Front}}" },
        ],
      });
      pkg.addNoteType(usedNoteType);
      pkg.addNoteType(unusedNoteType);

      // Both notes reference the used note type, so it survives; the unused
      // note type has no notes at all and is pruned.
      const noteWithCard = createNote(
        {
          deckId: usedDeck.id,
          fieldValues: [["Front", "has-card"]],
          noteTypeId: usedNoteType.id,
        },
        usedNoteType,
      );
      const cardlessNote = createNote(
        {
          deckId: usedDeck.id,
          fieldValues: [["Front", "no-card"]],
          noteTypeId: usedNoteType.id,
        },
        usedNoteType,
      );
      pkg.addNote(noteWithCard);
      pkg.addNote(cardlessNote);

      pkg.addCard(createCard({ noteId: noteWithCard.id, templateId: 0 }));

      const report = pkg.removeUnused();

      expect(report.removedDecks).toEqual([emptyDeck]);
      expect(report.removedNoteTypes).toEqual([unusedNoteType]);
      expect(report.removedNotes).toEqual([cardlessNote]);

      // The package now only holds the still-referenced entities.
      expect(pkg.getDecks()).toEqual([usedDeck]);
      expect(pkg.getNoteTypes()).toEqual([usedNoteType]);
      expect(pkg.getNotes()).toEqual([noteWithCard]);
    });

    it("returns empty arrays when nothing is unused", () => {
      const pkg = new SrsPackage();

      const deck = createDeck({ name: "Deck" });
      pkg.addDeck(deck);

      const noteType = createNoteType({
        fields: [{ id: 0, name: "Front" }],
        name: "Type",
        templates: [
          { answerTemplate: "{{Front}}", id: 0, name: "Card 1", questionTemplate: "{{Front}}" },
        ],
      });
      pkg.addNoteType(noteType);

      const note = createNote(
        { deckId: deck.id, fieldValues: [["Front", "value"]], noteTypeId: noteType.id },
        noteType,
      );
      pkg.addNote(note);
      pkg.addCard(createCard({ noteId: note.id, templateId: 0 }));

      const report = pkg.removeUnused();

      expect(report.removedDecks).toEqual([]);
      expect(report.removedNoteTypes).toEqual([]);
      expect(report.removedNotes).toEqual([]);
    });
  });
});
