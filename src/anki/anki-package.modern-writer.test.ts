import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import InitSqlJs from "sql.js";
import { Open } from "unzipper";
import { describe, expect, it } from "vitest";

import type { SrsPackage } from "@/srs-package";

import { AnkiPackage } from "./anki-package";
import { decodePackageMeta } from "./protobuf-wire";
import { zstdDecompress } from "./zstd";

const CORPUS = "tests/fixtures/anki/corpus";

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

async function entityBlobs(apkgPath: string): Promise<Map<string, Uint8Array>> {
  const zip = await Open.file(apkgPath);
  const dbEntry = zip.files.find((file) => file.path === "collection.anki21b");
  if (!dbEntry) {
    throw new Error(`collection.anki21b missing from ${apkgPath}`);
  }
  const SQL = await InitSqlJs();
  const db = new SQL.Database(await zstdDecompress(new Uint8Array(await dbEntry.buffer())));
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
    const result = await AnkiPackage.fromAnkiExport(`${CORPUS}/corpus-v3.apkg`);
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const outDir = await mkdtemp(join(tmpdir(), "modern-writer-"));
      const outPath = join(outDir, "out.apkg");
      await anki.toAnkiExport(outPath, { legacy: false });

      const zip = await Open.file(outPath);
      const names = zip.files.map((file) => file.path).sort();
      expect(names).toContain("meta");
      expect(names).toContain("collection.anki21b");
      expect(names).toContain("collection.anki2"); // dummy for old clients
      expect(names).toContain("media");
      expect(names).toContain("0");
      expect(names).toContain("1");

      const metaEntry = zip.files.find((file) => file.path === "meta");
      const metaBuffer = metaEntry ? new Uint8Array(await metaEntry.buffer()) : new Uint8Array(0);
      expect(decodePackageMeta(metaBuffer)).toEqual({ version: 3 });
    } finally {
      await anki.cleanup();
    }
  });

  it("passes modern-sourced entity blobs through byte-identically", async () => {
    const result = await AnkiPackage.fromAnkiExport(`${CORPUS}/corpus-v3.apkg`);
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const outDir = await mkdtemp(join(tmpdir(), "modern-writer-passthrough-"));
      const outPath = join(outDir, "out.apkg");
      await anki.toAnkiExport(outPath, { legacy: false });

      const sourceBlobs = await entityBlobs(`${CORPUS}/corpus-v3.apkg`);
      const outputBlobs = await entityBlobs(outPath);
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
    const source = await toSrs(`${CORPUS}/corpus-v3-single-deck.apkg`);
    let written: AnkiPackage | undefined;
    let reread: { anki: AnkiPackage; srs: SrsPackage } | undefined;
    try {
      const writeResult = await AnkiPackage.fromSrsPackage(source.srs);
      written = writeResult.data;
      expect(written).toBeDefined();
      if (!written) {
        return;
      }
      const outDir = await mkdtemp(join(tmpdir(), "modern-writer-roundtrip-"));
      const outPath = join(outDir, "out.apkg");
      await written.toAnkiExport(outPath, { legacy: false });

      reread = await toSrs(outPath);
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
    const result = await AnkiPackage.fromAnkiExport(`${CORPUS}/corpus-v3-single-deck.apkg`);
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const outDir = await mkdtemp(join(tmpdir(), "modern-writer-default-"));
      const outPath = join(outDir, "out.apkg");
      // Default: modern (matches what current Anki itself produces).
      await anki.toAnkiExport(outPath);
      const modernZip = await Open.file(outPath);
      expect(modernZip.files.map((file) => file.path)).toContain("collection.anki21b");
      const modernMeta = modernZip.files.find((file) => file.path === "meta");
      const modernMetaBuffer = modernMeta
        ? new Uint8Array(await modernMeta.buffer())
        : new Uint8Array(0);
      expect(decodePackageMeta(modernMetaBuffer)).toEqual({ version: 3 });

      // legacy: true mirrors Anki's "Support older Anki versions" checkbox.
      const legacyPath = join(outDir, "out-legacy.apkg");
      await anki.toAnkiExport(legacyPath, { legacy: true });
      const legacyZip = await Open.file(legacyPath);
      const legacyNames = legacyZip.files.map((file) => file.path);
      expect(legacyNames).toContain("collection.anki21");
      expect(legacyNames).not.toContain("collection.anki21b");
      const legacyMeta = legacyZip.files.find((file) => file.path === "meta");
      const legacyMetaBuffer = legacyMeta
        ? new Uint8Array(await legacyMeta.buffer())
        : new Uint8Array(0);
      expect(decodePackageMeta(legacyMetaBuffer)).toEqual({ version: 2 });
    } finally {
      await anki.cleanup();
    }
  });
});
