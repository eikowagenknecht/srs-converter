import InitSqlJs from "sql.js";
import { describe, expect, it } from "vitest";

import { platform } from "#platform";
import type { SrsPackage } from "@/srs-package";

import { AnkiPackage } from "./anki-package";
import { loadFixture } from "./anki-package.fixtures";
import { decodePackageMeta } from "./protobuf-wire";
import { readZipEntries } from "./zip";

const CORPUS = "anki/corpus";

async function toSrs(data: Uint8Array): Promise<{ anki: AnkiPackage; srs: SrsPackage }> {
  const ankiResult = await AnkiPackage.fromAnkiExport(data);
  expect(
    ankiResult.issues.filter((issue) => issue.severity === "critical"),
    "critical issues reading package",
  ).toHaveLength(0);
  if (!ankiResult.data) {
    throw new Error("could not read package");
  }
  const srsResult = await ankiResult.data.toSrsPackage();
  if (!srsResult.data) {
    throw new Error("could not convert package");
  }
  return { anki: ankiResult.data, srs: srsResult.data };
}

async function entityBlobs(apkg: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dbEntry = readZipEntries(apkg).get("collection.anki21b");
  if (!dbEntry) {
    throw new Error("collection.anki21b missing from package");
  }
  const SQL = await InitSqlJs();
  const db = new SQL.Database(await platform.zstdDecompress(dbEntry));
  // Strip unicase so the query planner works in sql.js (source files only;
  // our own output has no unicase clauses).
  db.exec("PRAGMA writable_schema=ON");
  db.exec(
    "UPDATE sqlite_schema SET sql = REPLACE(sql, ' COLLATE unicase', '') WHERE sql LIKE '%unicase%'",
  );
  const patched = db.export();
  db.close();
  const readable = new SQL.Database(patched);

  const blobs = new Map<string, Uint8Array>();
  const collect = (sql: string, keyOf: (row: unknown[]) => string, blobAt: number): void => {
    const result = readable.exec(sql);
    for (const row of result[0]?.values ?? []) {
      blobs.set(keyOf(row), row[blobAt] as unknown as Uint8Array);
    }
  };
  collect("SELECT id, config FROM notetypes", (row) => `notetype-${String(row[0])}`, 1);
  collect(
    "SELECT ntid, ord, config FROM fields",
    (row) => `field-${String(row[0])}-${String(row[1])}`,
    2,
  );
  collect(
    "SELECT ntid, ord, config FROM templates",
    (row) => `template-${String(row[0])}-${String(row[1])}`,
    2,
  );
  collect("SELECT id, common FROM decks", (row) => `deck-common-${String(row[0])}`, 1);
  collect("SELECT id, kind FROM decks", (row) => `deck-kind-${String(row[0])}`, 1);
  collect("SELECT id, config FROM deck_config", (row) => `deck-config-${String(row[0])}`, 1);
  readable.close();
  return blobs;
}

describe("modern (schema 18) package writing", () => {
  it("writes a modern package with the pinned container layout", async () => {
    const result = await AnkiPackage.fromAnkiExport(await loadFixture(`${CORPUS}/corpus-v3.apkg`));
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const outBytes = await anki.toAnkiExport({ legacy: false });

      const entries = readZipEntries(outBytes);
      const names = [...entries.keys()].sort();
      expect(names).toContain("meta");
      expect(names).toContain("collection.anki21b");
      expect(names).toContain("collection.anki2"); // dummy for old clients
      expect(names).toContain("media");
      expect(names).toContain("0");
      expect(names).toContain("1");

      const metaBuffer = entries.get("meta") ?? new Uint8Array(0);
      expect(decodePackageMeta(metaBuffer)).toEqual({ version: 3 });
    } finally {
      await anki.cleanup();
    }
  });

  it("passes modern-sourced entity blobs through byte-identically", async () => {
    const sourceFixture = await loadFixture(`${CORPUS}/corpus-v3.apkg`);
    const result = await AnkiPackage.fromAnkiExport(sourceFixture);
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const outBytes = await anki.toAnkiExport({ legacy: false });

      const sourceBlobs = await entityBlobs(sourceFixture);
      const outputBlobs = await entityBlobs(outBytes);
      expect(outputBlobs.size).toBeGreaterThan(0);
      for (const [key, blob] of outputBlobs) {
        expect(sourceBlobs.get(key), `source blob for ${key}`).toBeDefined();
        expect(blob, `blob ${key}`).toEqual(sourceBlobs.get(key));
      }
    } finally {
      await anki.cleanup();
    }
  });

  it("round-trips modern → SRS → modern with equivalent content", async () => {
    const source = await toSrs(await loadFixture(`${CORPUS}/corpus-v3-single-deck.apkg`));
    let written: AnkiPackage | undefined;
    let reread: { anki: AnkiPackage; srs: SrsPackage } | undefined;
    try {
      const writeResult = await AnkiPackage.fromSrsPackage(source.srs);
      written = writeResult.data;
      expect(written).toBeDefined();
      if (!written) {
        return;
      }
      const outBytes = await written.toAnkiExport({ legacy: false });

      reread = await toSrs(outBytes);
      const summarize = (srs: SrsPackage) => ({
        notes: srs
          .getNotes()
          .map((note) => note.fieldValues.map(([, value]) => value).join(""))
          .sort(),
        decks: srs
          .getDecks()
          .map((deck) => deck.name)
          .sort(),
        cardCount: srs.getCards().length,
        media: [...srs.listMediaFiles()].sort(),
      });
      expect(summarize(reread.srs)).toEqual(summarize(source.srs));
    } finally {
      await source.anki.cleanup();
      await written?.cleanup();
      await reread?.anki.cleanup();
    }
  });

  it("writes the modern format by default and legacy on request", async () => {
    const result = await AnkiPackage.fromAnkiExport(
      await loadFixture(`${CORPUS}/corpus-v3-single-deck.apkg`),
    );
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      // Default: modern (matches what current Anki itself produces).
      const modernBytes = await anki.toAnkiExport();
      const modernEntries = readZipEntries(modernBytes);
      expect([...modernEntries.keys()]).toContain("collection.anki21b");
      const modernMetaBuffer = modernEntries.get("meta") ?? new Uint8Array(0);
      expect(decodePackageMeta(modernMetaBuffer)).toEqual({ version: 3 });

      // legacy: true mirrors Anki's "Support older Anki versions" checkbox.
      const legacyBytes = await anki.toAnkiExport({ legacy: true });
      const legacyEntries = readZipEntries(legacyBytes);
      const legacyNames = [...legacyEntries.keys()];
      expect(legacyNames).toContain("collection.anki21");
      expect(legacyNames).not.toContain("collection.anki21b");
      const legacyMetaBuffer = legacyEntries.get("meta") ?? new Uint8Array(0);
      expect(decodePackageMeta(legacyMetaBuffer)).toEqual({ version: 2 });
    } finally {
      await anki.cleanup();
    }
  });
});
