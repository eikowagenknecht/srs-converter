import { describe, expect, it } from "vitest";

import { BasicAndReverseNote, createNote, createNoteType } from "@/srs-package";

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
});
