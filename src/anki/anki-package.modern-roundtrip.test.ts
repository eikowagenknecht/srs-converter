import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { SrsPackage } from "@/srs-package";

import { AnkiPackage } from "./anki-package";
import { readApkgRaw } from "./anki-package.roundtrip.fixtures";

async function toSrs(path: string): Promise<{ anki: AnkiPackage; srs: SrsPackage }> {
  const ankiResult = await AnkiPackage.fromAnkiExport(path);
  expect(
    ankiResult.issues.filter((issue) => issue.severity === "critical"),
    `critical issues reading ${path}`,
  ).toHaveLength(0);
  if (!ankiResult.data) {
    throw new Error(`could not read ${path}`);
  }
  const srsResult = await ankiResult.data.toSrsPackage();
  if (!srsResult.data) {
    throw new Error(`could not convert ${path}`);
  }
  return { anki: ankiResult.data, srs: srsResult.data };
}

describe("modern → legacy round trip (Story 1.3.7)", () => {
  it("writes a modern-sourced package as valid Legacy 2 via proto→11 conversion", async () => {
    const source = await toSrs("tests/fixtures/anki/corpus/corpus-v3-single-deck.apkg");
    let written: AnkiPackage | undefined;
    let reread: { anki: AnkiPackage; srs: SrsPackage } | undefined;
    try {
      // SRS → Anki: the write-time schema crossing (modern blobs → schema 11).
      const writeResult = await AnkiPackage.fromSrsPackage(source.srs);
      expect(
        writeResult.issues.filter((issue) => issue.severity === "critical"),
        "critical issues converting modern-sourced SRS package",
      ).toHaveLength(0);
      written = writeResult.data;
      expect(written).toBeDefined();
      if (!written) {
        return;
      }

      const outDir = await mkdtemp(join(tmpdir(), "modern-roundtrip-"));
      const outPath = join(outDir, "out.apkg");
      await written.toAnkiExport(outPath, { legacy: true });

      // The output must be a plain Legacy 2 package with schema-11 JSON.
      const raw = await readApkgRaw(outPath);
      expect(raw.col.ver).toBe(11);
      const decks = Object.values(raw.col.decks);
      const vocabulary = decks.find((deck) => deck["name"] === "Spanish::Vocabulary");
      expect(vocabulary, "converted deck present in legacy JSON").toBeDefined();
      expect(vocabulary).toHaveProperty("lrnToday"); // schema-11 dialect keys
      expect(vocabulary).toHaveProperty("conf");
      for (const model of Object.values(raw.col.models)) {
        expect(model).toHaveProperty("flds");
        expect(model).toHaveProperty("latexPre");
      }

      // And it must read back with equivalent content.
      reread = await toSrs(outPath);
      const fieldsOf = (srs: SrsPackage) =>
        srs
          .getNotes()
          .map((note) => note.fieldValues.map(([, value]) => value).join(""))
          .sort();
      expect(fieldsOf(reread.srs)).toEqual(fieldsOf(source.srs));
      expect(reread.srs.getNotes()).toHaveLength(source.srs.getNotes().length);
      expect(reread.srs.getCards()).toHaveLength(source.srs.getCards().length);
    } finally {
      await source.anki.cleanup();
      await written?.cleanup();
      await reread?.anki.cleanup();
    }
  });

  it("keeps the existing legacy → legacy path untouched (passthrough)", async () => {
    // The legacy corpus is multi-deck, which fromSrsPackage does not support
    // yet — the passthrough guarantee is covered by the existing round-trip
    // suite (anki-package.roundtrip.test.ts). This test just pins that
    // legacy-sourced blobs are still stored unmarked (schema-11 dialect).
    const { anki, srs } = await toSrs("tests/fixtures/anki/corpus/corpus-legacy2.apkg");
    try {
      expect(srs.getApplicationSpecificData()["ankiSchema"]).toBeUndefined();
    } finally {
      await anki.cleanup();
    }
  });
});
