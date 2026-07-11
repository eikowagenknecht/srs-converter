import { describe, expect, it } from "vitest";

import type { SrsPackage } from "@/srs-package";

import { AnkiPackage } from "./anki-package";
import { expectSuccess } from "./anki-package.fixtures";
import { ANKI_SCHEMA_KEY, ANKI_SCHEMA_MODERN } from "./native-blobs";
import { parseJsonWithBigInts } from "./util";

const CORPUS = "tests/fixtures/anki/corpus";

async function readToSrs(path: string): Promise<{ anki: AnkiPackage; srs: SrsPackage }> {
  const ankiResult = await AnkiPackage.fromAnkiExport(path);
  expect(
    ankiResult.issues.filter((issue) => issue.severity === "critical"),
    `critical issues reading ${path}`,
  ).toHaveLength(0);
  const anki = expectSuccess(ankiResult);
  const srsResult = await anki.toSrsPackage();
  expect(srsResult.data, `SRS conversion of ${path}`).toBeDefined();
  if (!srsResult.data) {
    throw new Error("no SRS package");
  }
  return { anki, srs: srsResult.data };
}

describe("modern (schema 18) package reading", () => {
  it("reads a modern .apkg produced by real Anki", async () => {
    const { anki, srs } = await readToSrs(`${CORPUS}/corpus-v3.apkg`);
    try {
      expect(srs.getNotes().length).toBeGreaterThanOrEqual(5);
      // The content decks; empty/filtered decks may be pruned by validation.
      expect(srs.getDecks().length).toBeGreaterThanOrEqual(4);
      expect(srs.getNoteTypes().length).toBeGreaterThanOrEqual(5);
      // 9 revlog rows exist; the two ease-0 reschedule rows (types 4/5) are
      // currently dropped by review validation — see docs/working/issues.md.
      expect(srs.getReviews().length).toBeGreaterThanOrEqual(7);
    } finally {
      await anki.cleanup();
    }
  });

  it("produces an equivalent SrsPackage to the legacy export of the same collection", async () => {
    const legacy = await readToSrs(`${CORPUS}/corpus-legacy2.apkg`);
    const modern = await readToSrs(`${CORPUS}/corpus-v3.apkg`);
    try {
      const summarize = (srs: SrsPackage) => ({
        decks: srs
          .getDecks()
          .map((deck) => deck.name)
          .sort(),
        noteTypes: srs
          .getNoteTypes()
          .map((noteType) => noteType.name)
          .sort(),
        notes: srs
          .getNotes()
          .map((note) => note.fieldValues.map(([, value]) => value).join(""))
          .sort(),
        cardCount: srs.getCards().length,
        reviewCount: srs.getReviews().length,
      });
      expect(summarize(modern.srs)).toEqual(summarize(legacy.srs));
    } finally {
      await legacy.anki.cleanup();
      await modern.anki.cleanup();
    }
  });

  it("stores native-form blobs with the schema marker (ADR-0016)", async () => {
    const { anki, srs } = await readToSrs(`${CORPUS}/corpus-v3.apkg`);
    try {
      // Package level: native col data + deck presets, marked as modern.
      const packageData = srs.getApplicationSpecificData();
      expect(packageData[ANKI_SCHEMA_KEY]).toBe(ANKI_SCHEMA_MODERN);
      const col = parseJsonWithBigInts(packageData["ankiCol"] ?? "") as Record<string, unknown>;
      expect(col["ver"]).toBe(18);
      expect(Array.isArray(col["configRows"])).toBe(true);
      expect(Array.isArray(col["tagRows"])).toBe(true);

      const dconf = parseJsonWithBigInts(packageData["ankiDconf"] ?? "") as Record<
        string,
        Record<string, unknown>
      >;
      const presets = Object.values(dconf);
      expect(presets.length).toBeGreaterThanOrEqual(3);
      // Native bundles have row/config with snake_case proto keys.
      expect(presets[0]).toHaveProperty("row");
      expect(presets[0]).toHaveProperty("config");

      // Entity level: every deck/note type carries the marker + native form.
      for (const deck of srs.getDecks()) {
        expect(deck.applicationSpecificData?.[ANKI_SCHEMA_KEY]).toBe(ANKI_SCHEMA_MODERN);
        const blob = parseJsonWithBigInts(
          deck.applicationSpecificData?.["ankiDeck"] ?? "",
        ) as Record<string, unknown>;
        expect(blob).toHaveProperty("common");
        expect(blob).toHaveProperty("kind");
      }
      for (const noteType of srs.getNoteTypes()) {
        expect(noteType.applicationSpecificData?.[ANKI_SCHEMA_KEY]).toBe(ANKI_SCHEMA_MODERN);
        const blob = parseJsonWithBigInts(
          noteType.applicationSpecificData?.["ankiNoteType"] ?? "",
        ) as Record<string, unknown>;
        expect(blob).toHaveProperty("config");
        expect(blob).toHaveProperty("fields");
        expect(blob).toHaveProperty("templates");
      }
    } finally {
      await anki.cleanup();
    }
  });

  it("leaves legacy-sourced blobs unmarked and in schema-11 form", async () => {
    const { anki, srs } = await readToSrs(`${CORPUS}/corpus-legacy2.apkg`);
    try {
      expect(srs.getApplicationSpecificData()[ANKI_SCHEMA_KEY]).toBeUndefined();
      for (const deck of srs.getDecks()) {
        expect(deck.applicationSpecificData?.[ANKI_SCHEMA_KEY]).toBeUndefined();
        const blob = parseJsonWithBigInts(
          deck.applicationSpecificData?.["ankiDeck"] ?? "",
        ) as Record<string, unknown>;
        // Schema-11 dialect: camelCase today-counters, no proto bundles.
        expect(blob).toHaveProperty("lrnToday");
      }
    } finally {
      await anki.cleanup();
    }
  });

  it("restores media through the protobuf manifest with checksums", async () => {
    const legacy = await readToSrs(`${CORPUS}/corpus-legacy2.apkg`);
    const modern = await readToSrs(`${CORPUS}/corpus-v3.apkg`);
    try {
      const mediaNames = (srs: SrsPackage) => [...srs.listMediaFiles()].sort();
      expect(mediaNames(modern.srs)).toEqual(mediaNames(legacy.srs));
      expect(mediaNames(modern.srs)).toContain("pixel.png");
      expect(mediaNames(modern.srs)).toContain("beep.mp3");
    } finally {
      await legacy.anki.cleanup();
      await modern.anki.cleanup();
    }
  });

  it("reads modern packages without scheduling and .colpkg backups", async () => {
    for (const name of ["corpus-v3-no-scheduling.apkg", "corpus-v3.colpkg"]) {
      const { anki, srs } = await readToSrs(`${CORPUS}/${name}`);
      try {
        expect(srs.getNotes().length, name).toBeGreaterThanOrEqual(5);
      } finally {
        await anki.cleanup();
      }
    }
  });
});
