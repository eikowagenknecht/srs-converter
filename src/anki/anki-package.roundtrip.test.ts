/**
 * Full-fidelity round-trip tests (WP2).
 *
 * Anki → SRS → Anki must be semantically lossless for the columns in the
 * audit's Appendix A. These invert the audit repros (which asserted the buggy
 * values) to assert preservation.
 *
 * Out of scope for WP2 (asserted elsewhere / deferred):
 * - Media files are still dropped (F3 / WP4); not asserted here.
 * - Cloze card regeneration is still buggy (F9 / WP3): note B's MathJax cloze
 *   card (ord 0) is dropped, so note B's cards are not asserted in detail.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SrsPackage, createCard, createDeck, createNote, createNoteType } from "@/srs-package";

import { AnkiPackage } from "./anki-package";
import { expectSuccess, getTempDir, setupTempDir } from "./anki-package.fixtures";
import {
  NOTE_A_FLDS,
  NOTE_B_FLDS,
  SRC,
  buildSourceApkg,
  readApkgRaw,
} from "./anki-package.roundtrip.fixtures";
import { fieldChecksum, splitAnkiFields, stripHtml } from "./util";

setupTempDir();

async function roundTrip(srcPath: string): Promise<ReturnType<typeof readApkgRaw>> {
  const readResult = await AnkiPackage.fromAnkiExport(srcPath);
  const src = expectSuccess(readResult);
  try {
    const srsResult = src.toSrsPackage();
    const srs = expectSuccess(srsResult);

    const backResult = await AnkiPackage.fromSrsPackage(srs);
    const back = expectSuccess(backResult);
    try {
      const outPath = join(getTempDir(), "roundtrip.apkg");
      await back.toAnkiExport(outPath);
      return readApkgRaw(outPath);
    } finally {
      await back.cleanup();
    }
  } finally {
    await src.cleanup();
  }
}

describe("Anki → SRS → Anki full-fidelity round-trip", () => {
  it("preserves note identity, tags, timestamps and recomputes sfld/csum", async () => {
    const after = await roundTrip(await buildSourceApkg());

    const noteA = after.notes.find((n) => n["id"] === SRC.noteAId);
    expect(noteA, "note A survives via originalAnkiId").toBeDefined();
    if (!noteA) {
      throw new Error("unreachable");
    }

    // guid / tags / mod / usn / flags restored from the captured note row
    expect(noteA["guid"]).toBe(SRC.noteAGuid);
    expect(noteA["tags"]).toBe(" vocab important ");
    expect(noteA["mod"]).toBe(1_650_000_011);
    expect(noteA["usn"]).toBe(4);
    expect(noteA["flags"]).toBe(3);
    // field content + plugin data preserved
    expect(noteA["flds"]).toBe(NOTE_A_FLDS);
    expect(noteA["data"]).toBe('{"addon":"noteData"}');
    // sfld recomputed from the model's sortf (=1 → the "Back" field), HTML-stripped
    expect(noteA["sfld"]).toBe(stripHtml("back value"));
    // csum recomputed from the HTML-stripped first field (never 0)
    expect(noteA["csum"]).toBe(fieldChecksum("front<br>HTML"));
    expect(noteA["csum"]).not.toBe(0);

    const noteB = after.notes.find((n) => n["id"] === SRC.noteBId);
    expect(noteB?.["guid"]).toBe(SRC.noteBGuid);
    expect(noteB?.["tags"]).toBe("math");
    expect(noteB?.["flds"]).toBe(NOTE_B_FLDS);
  });

  it("preserves the full card scheduling state", async () => {
    const after = await roundTrip(await buildSourceApkg());

    // Review card A1: every scheduling column round-trips.
    const cardA1 = after.cards.find((c) => c["id"] === SRC.cardA1Id);
    expect(cardA1).toBeDefined();
    expect(cardA1?.["type"]).toBe(2);
    expect(cardA1?.["queue"]).toBe(2);
    expect(cardA1?.["due"]).toBe(150);
    expect(cardA1?.["ivl"]).toBe(30);
    expect(cardA1?.["factor"]).toBe(2600);
    expect(cardA1?.["reps"]).toBe(10);
    expect(cardA1?.["lapses"]).toBe(2);
    expect(cardA1?.["flags"]).toBe(1);
    expect(cardA1?.["mod"]).toBe(1_650_000_021);
    expect(cardA1?.["usn"]).toBe(4);
    expect(cardA1?.["data"]).toBe('{"addonCard":1}');
    expect(cardA1?.["nid"]).toBe(SRC.noteAId);
    expect(cardA1?.["did"]).toBe(SRC.deckId);

    // Intraday learning card A2: negative ivl (seconds), epoch due, left, ord.
    const cardA2 = after.cards.find((c) => c["id"] === SRC.cardA2Id);
    expect(cardA2?.["type"]).toBe(1);
    expect(cardA2?.["queue"]).toBe(1);
    expect(cardA2?.["due"]).toBe(1_650_000_500);
    expect(cardA2?.["ivl"]).toBe(-600);
    expect(cardA2?.["left"]).toBe(1002);
    expect(cardA2?.["ord"]).toBe(1);

    // Suspended cloze card B2 stays suspended (queue -1) after regeneration.
    const cardB2 = after.cards.find((c) => c["id"] === SRC.cardB2Id);
    expect(cardB2?.["queue"]).toBe(-1);
  });

  it("preserves the full review history", async () => {
    const after = await roundTrip(await buildSourceApkg());

    const rev1 = after.revlog.find((r) => r["id"] === 1_650_000_030_000);
    expect(rev1?.["ease"]).toBe(3);
    expect(rev1?.["ivl"]).toBe(30);
    expect(rev1?.["lastIvl"]).toBe(15);
    expect(rev1?.["factor"]).toBe(2600);
    expect(rev1?.["time"]).toBe(4500);
    expect(rev1?.["type"]).toBe(1);
    expect(rev1?.["usn"]).toBe(4);
    expect(rev1?.["cid"]).toBe(SRC.cardA1Id);

    const rev3 = after.revlog.find((r) => r["id"] === 1_650_000_031_000);
    expect(rev3?.["ivl"]).toBe(100);
    expect(rev3?.["type"]).toBe(3);
    expect(rev3?.["cid"]).toBe(SRC.cardA2Id);
  });

  it("preserves note type internals, plugin keys and 64-bit ids", async () => {
    const after = await roundTrip(await buildSourceApkg());

    const vocab = Object.values(after.col.models).find((m) => m["name"] === "Vocab");
    expect(vocab, "Vocab model present").toBeDefined();
    if (!vocab) {
      throw new Error("unreachable");
    }
    expect(vocab["css"]).toContain("color: red");
    expect(vocab["latexPre"]).toBe("CUSTOM_LATEX_PRE");
    expect(vocab["latexsvg"]).toBe(true);
    expect(vocab["sortf"]).toBe(1);
    expect(vocab["type"]).toBe(0);
    expect(vocab["originalStockKind"]).toBe(null);
    expect(vocab["req"]).toEqual([
      [0, "any", [0]],
      [1, "any", [1]],
    ]);
    // Unknown plugin key on the model survives.
    expect(vocab["addonKey"]).toBe("addonValue");

    const tmpls = vocab["tmpls"] as Record<string, unknown>[];
    expect(tmpls[0]?.["bqfmt"]).toBe("BQ-OVERRIDE");
    expect(tmpls[0]?.["bfont"]).toBe("Times");
    expect(tmpls[0]?.["did"]).toBe(SRC.deckId);
    expect(tmpls[0]?.["bsize"]).toBe(12);

    const flds = vocab["flds"] as Record<string, unknown>[];
    expect(flds[0]?.["font"]).toBe("Courier");
    expect(flds[0]?.["rtl"]).toBe(true);
    expect(flds[0]?.["sticky"]).toBe(true);
    expect(flds[0]?.["description"]).toBe("front description");
    // Digit-only field name stays a string (F7).
    expect(flds[2]?.["name"]).toBe("2024");

    const cloze = Object.values(after.col.models).find((m) => m["name"] === "MyCloze");
    expect(cloze?.["type"]).toBe(1);
    expect(cloze?.["css"]).toContain("color: blue");
    expect(cloze?.["originalStockKind"]).toBe(5);

    // 64-bit template/field ids survive byte-for-byte (compare the raw column).
    for (const id of [SRC.tmpl1Id, SRC.tmpl2Id, SRC.fld1Id, SRC.fld2Id]) {
      expect(after.col.modelsRaw).toContain(`"id":${id}`);
    }
  });

  it("preserves deck options, collection metadata and graves", async () => {
    const after = await roundTrip(await buildSourceApkg());

    const deck = Object.values(after.col.decks).find((d) => d["name"] === "Source Deck");
    expect(deck).toBeDefined();
    expect(deck?.["conf"]).toBe(SRC.dconfId);
    expect(deck?.["extendNew"]).toBe(5);
    expect(deck?.["newLimit"]).toBe(40);
    expect(deck?.["desc"]).toBe("Deck description <b>html</b>");
    expect(deck?.["deckPluginKey"]).toBe("deck-plugin-value");

    // col scalars + conf (incl. plugin key) restored.
    expect(after.col.crt).toBe(SRC.crt);
    expect(after.col.scm).toBe(SRC.scm);
    expect(after.col.ls).toBe(SRC.ls);
    expect(after.col.usn).toBe(SRC.colUsn);
    expect(after.col.ver).toBe(11);
    expect(after.col.id).toBe(1);
    expect(after.col.conf["creationOffset"]).toBe(300);
    expect(after.col.conf["confPluginKey"]).toEqual({ nested: true, answer: 42 });

    // Custom deck preset "Hard Preset" (dconf 7) restored with its plugin key.
    expect(after.col.dconf["7"]?.["name"]).toBe("Hard Preset");
    expect(after.col.dconf["7"]?.["dconfPluginKey"]).toBe("dconf-plugin-value");

    // col.tags and graves restored.
    expect(after.col.tags).toEqual({ leech: -1 });
    expect(after.graves).toEqual([{ usn: 4, oid: 1_649_999_999_000, type: 1 }]);
  });

  it("reports success with no error/critical issues (warnings allowed)", async () => {
    const srcPath = await buildSourceApkg();
    const readResult = await AnkiPackage.fromAnkiExport(srcPath);
    const src = expectSuccess(readResult);
    try {
      const srs = expectSuccess(src.toSrsPackage());
      const backResult = await AnkiPackage.fromSrsPackage(srs);
      const back = expectSuccess(backResult);
      // No error or critical issues on a clean round-trip.
      expect(backResult.issues.filter((i) => i.severity !== "warning")).toEqual([]);
      await back.cleanup();
    } finally {
      await src.cleanup();
    }
  });
});

describe("Round-trip with SRS-side edits (overlay precedence)", () => {
  it("applies renamed deck and edited field while keeping scheduling/guid/tags", async () => {
    const srcPath = await buildSourceApkg();
    const readResult = await AnkiPackage.fromAnkiExport(srcPath);
    const src = expectSuccess(readResult);

    try {
      const srs = expectSuccess(src.toSrsPackage());

      // Edit in the universal format: rename the deck and change a field value.
      const deck = srs.getDecks().find((d) => d.name === "Source Deck");
      if (!deck) {
        throw new Error("source deck missing");
      }
      deck.name = "Renamed Deck";

      const noteA = srs
        .getNotes()
        .find((n) => n.applicationSpecificData?.["originalAnkiId"] === SRC.noteAId.toFixed(0));
      if (!noteA) {
        throw new Error("note A missing");
      }
      const frontEntry = noteA.fieldValues.find(([name]) => name === "Front");
      if (!frontEntry) {
        throw new Error("Front field missing");
      }
      frontEntry[1] = "EDITED FRONT";

      const backResult = await AnkiPackage.fromSrsPackage(srs);
      const back = expectSuccess(backResult);
      try {
        const outPath = join(getTempDir(), "overlay.apkg");
        await back.toAnkiExport(outPath);
        const after = await readApkgRaw(outPath);

        // Edits win.
        expect(Object.values(after.col.decks).some((d) => d["name"] === "Renamed Deck")).toBe(true);
        const editedNote = after.notes.find((n) => n["id"] === SRC.noteAId);
        expect(editedNote).toBeDefined();
        const editedFields = splitAnkiFields(
          typeof editedNote?.["flds"] === "string" ? editedNote["flds"] : "",
        );
        expect(editedFields[0]).toBe("EDITED FRONT");
        expect(editedFields[1]).toBe("back value");

        // Everything else still restored from the blob.
        expect(editedNote?.["guid"]).toBe(SRC.noteAGuid);
        expect(editedNote?.["tags"]).toBe(" vocab important ");
        const cardA1 = after.cards.find((c) => c["id"] === SRC.cardA1Id);
        expect(cardA1?.["ivl"]).toBe(30);
        expect(cardA1?.["factor"]).toBe(2600);
      } finally {
        await back.cleanup();
      }
    } finally {
      await src.cleanup();
    }
  });
});

describe("Round-trip with a corrupt blob", () => {
  it("warns and falls back to a default card when ankiCard is unparseable", async () => {
    const srcPath = await buildSourceApkg();
    const readResult = await AnkiPackage.fromAnkiExport(srcPath);
    const src = expectSuccess(readResult);

    try {
      const srs = expectSuccess(src.toSrsPackage());
      const card = srs
        .getCards()
        .find((c) => c.applicationSpecificData?.["originalAnkiId"] === SRC.cardA1Id.toFixed(0));
      if (!card?.applicationSpecificData) {
        throw new Error("card A1 missing");
      }
      card.applicationSpecificData["ankiCard"] = "{ not valid json";

      const backResult = await AnkiPackage.fromSrsPackage(srs);
      // Warnings do not demote status.
      expect(backResult.status).toBe("success");
      const back = backResult.data;
      if (!back) {
        throw new Error("no data");
      }
      try {
        expect(
          backResult.issues.some(
            (i) => i.severity === "warning" && i.message.includes(SRC.cardA1Id.toFixed(0)),
          ),
        ).toBe(true);

        // The card exists with default scheduling (blob could not be restored).
        const restored = back.getCards().find((c) => c.id === SRC.cardA1Id);
        expect(restored).toBeDefined();
        expect(restored?.type).toBe(0);
        expect(restored?.queue).toBe(0);
        expect(restored?.ivl).toBe(0);
      } finally {
        await back.cleanup();
      }
    } finally {
      await src.cleanup();
    }
  });
});

describe("SRS-authored package (no captured Anki blobs)", () => {
  it("computes a real csum/sfld and correct req/originalStockKind", async () => {
    const srs = new SrsPackage();
    const deck = createDeck({ name: "Authored" });
    srs.addDeck(deck);

    // Two templates so `req` should have two entries.
    const noteType = createNoteType({
      fields: [
        { id: 0, name: "Front" },
        { id: 1, name: "Back" },
      ],
      name: "Basic Authored",
      templates: [
        { answerTemplate: "{{Back}}", id: 0, name: "Forward", questionTemplate: "{{Front}}" },
        { answerTemplate: "{{Front}}", id: 1, name: "Reverse", questionTemplate: "{{Back}}" },
      ],
    });
    srs.addNoteType(noteType);

    const note1 = createNote(
      {
        deckId: deck.id,
        fieldValues: [
          ["Front", "<b>Hello</b> world"],
          ["Back", "answer one"],
        ],
        noteTypeId: noteType.id,
      },
      noteType,
    );
    const note2 = createNote(
      {
        deckId: deck.id,
        fieldValues: [
          ["Front", "different front"],
          ["Back", "answer two"],
        ],
        noteTypeId: noteType.id,
      },
      noteType,
    );
    srs.addNote(note1);
    srs.addNote(note2);
    srs.addCard(createCard({ noteId: note1.id, templateId: 0 }));
    srs.addCard(createCard({ noteId: note2.id, templateId: 0 }));

    const result = await AnkiPackage.fromSrsPackage(srs);
    const anki = expectSuccess(result);
    try {
      const notes = anki.getNotes();
      const n1 = notes.find((n) => n.flds.startsWith("<b>Hello</b> world"));
      const n2 = notes.find((n) => n.flds.startsWith("different front"));
      expect(n1).toBeDefined();
      expect(n2).toBeDefined();

      // csum is a real checksum (never 0), stable, and content-dependent.
      expect(n1?.csum).toBe(fieldChecksum("<b>Hello</b> world"));
      expect(n1?.csum).not.toBe(0);
      expect(n1?.csum).not.toBe(n2?.csum);

      // sfld is the HTML-stripped first field (sortf defaults to 0).
      expect(n1?.sfld).toBe(stripHtml("<b>Hello</b> world"));
      expect(n1?.sfld).toBe("Hello world");

      const noteTypeOut = anki.getNoteTypes()[0];
      expect(noteTypeOut?.req).toEqual([
        [0, "any", [0]],
        [1, "any", [0]],
      ]);
      expect(noteTypeOut?.originalStockKind).toBe(null);
    } finally {
      await anki.cleanup();
    }
  });
});
