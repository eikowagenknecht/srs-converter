import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import InitSqlJs from "sql.js";
import { Open } from "unzipper";
import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import { createZip } from "./anki-package.roundtrip.fixtures";
import { mediaEntriesCodec } from "./anki-proto";
import { AnkiDatabase } from "./database";
import type { ColTable, DatabaseDump } from "./types";
import { zstdCompress, zstdDecompress } from "./zstd";

const SOURCE = "tests/fixtures/anki/corpus/corpus-v3-single-deck.apkg";

/** Reads all entries of the source package so tests can re-zip variants. */
async function sourceEntries(): Promise<Map<string, Buffer>> {
  const zip = await Open.file(SOURCE);
  const entries = new Map<string, Buffer>();
  for (const file of zip.files) {
    entries.set(file.path, await file.buffer());
  }
  return entries;
}

async function writeVariant(
  name: string,
  mutate: (entries: Map<string, Buffer>) => Promise<void> | void,
): Promise<string> {
  const entries = await sourceEntries();
  await mutate(entries);
  const dir = await mkdtemp(join(tmpdir(), "modern-errors-"));
  const path = join(dir, name);
  await createZip(
    path,
    [...entries.entries()].map(([entryName, content]) => ({ name: entryName, content })),
  );
  return path;
}

describe("modern reader error paths (Story 1.3.4/1.3.5 hardening)", () => {
  it("fails with a clear message when the media manifest is corrupt", async () => {
    const path = await writeVariant("corrupt-manifest.apkg", (entries) => {
      entries.set("media", Buffer.from("definitely not zstd"));
    });
    const result = await AnkiPackage.fromAnkiExport(path);
    expect(result.status).toBe("failure");
    expect(result.issues[0]?.message).toMatch(/media manifest.*could not be read/iu);
  });

  it("skips media files whose checksum does not match, with a warning", async () => {
    const path = await writeVariant("tampered-media.apkg", async (entries) => {
      // Replace media file 0 with validly-compressed WRONG content.
      entries.set("0", Buffer.from(await zstdCompress(Buffer.from("tampered content"))));
    });
    const result = await AnkiPackage.fromAnkiExport(path);
    expect(result.data).toBeDefined();
    const warnings = result.issues.filter((issue) => issue.severity === "warning");
    expect(
      warnings.some((issue) => /does not match its manifest checksum/iu.test(issue.message)),
    ).toBe(true);
    // The tampered file is excluded; other media survives.
    expect(result.data?.listMediaFiles().length).toBe(0);
    await result.data?.cleanup();
  });

  it("warns when a manifest entry has no backing file", async () => {
    const path = await writeVariant("missing-media-file.apkg", (entries) => {
      entries.delete("0");
    });
    const result = await AnkiPackage.fromAnkiExport(path);
    expect(result.data).toBeDefined();
    const warnings = result.issues.filter((issue) => issue.severity === "warning");
    expect(warnings.some((issue) => /could not be read/iu.test(issue.message))).toBe(true);
    await result.data?.cleanup();
  });

  it("tolerates a missing media manifest entirely (old AnkiDroid packages)", async () => {
    const path = await writeVariant("no-manifest.apkg", (entries) => {
      entries.delete("media");
      entries.delete("0");
    });
    const result = await AnkiPackage.fromAnkiExport(path);
    expect(result.data).toBeDefined();
    expect(result.issues.filter((issue) => issue.severity === "critical")).toHaveLength(0);
    expect(result.data?.listMediaFiles()).toEqual([]);
    await result.data?.cleanup();
  });
});

describe("modern writer edge cases (Story 1.3.8 hardening)", () => {
  it("writes graves and empty entity tables into the schema-18 database", async () => {
    const collection = {
      id: 1,
      crt: 1_700_000_000,
      mod: 1_700_000_001,
      scm: 1_700_000_002,
      ver: 11,
      dty: 0,
      usn: 0,
      ls: 0,
      conf: { fsrs: true },
      models: {},
      decks: {},
      dconf: {},
      tags: { vocab: -1 },
    } as unknown as ColTable;
    const dump: DatabaseDump = {
      collection,
      notes: [],
      cards: [],
      reviews: [],
      deletedItems: [
        { usn: 0, oid: 42, type: 1 },
        { usn: 0, oid: 43, type: 0 },
      ],
    };

    const db = await AnkiDatabase.fromModernDump(dump);
    const buffer = db.toBuffer();
    await db.close();

    const SQL = await InitSqlJs();
    const readable = new SQL.Database(buffer);
    const graves = readable.exec("SELECT oid, type, usn FROM graves ORDER BY oid");
    expect(graves[0]?.values).toEqual([
      [42, 1, 0],
      [43, 0, 0],
    ]);
    const col = readable.exec("SELECT ver, models, tags FROM col");
    expect(col[0]?.values[0]).toEqual([18, "", ""]);
    const config = readable.exec("SELECT KEY, val FROM config");
    const [configKey, configValue] = config[0]?.values[0] ?? [];
    expect(configKey).toBe("fsrs");
    expect(new TextDecoder().decode(configValue as Uint8Array)).toBe("true");
    const tags = readable.exec("SELECT tag, usn, collapsed FROM tags");
    expect(tags[0]?.values).toEqual([["vocab", -1, 0]]);
    readable.close();
  });

  it("NFC-normalizes media filenames in the manifest on export", async () => {
    const result = await AnkiPackage.fromAnkiExport(SOURCE);
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const dir = await mkdtemp(join(tmpdir(), "modern-nfc-"));
      const outPath = join(dir, "out.apkg");
      await anki.toAnkiExport(outPath);

      const zip = await Open.file(outPath);
      const mediaEntry = zip.files.find((file) => file.path === "media");
      expect(mediaEntry).toBeDefined();
      if (!mediaEntry) {
        return;
      }
      const manifest = mediaEntriesCodec.decode(
        await zstdDecompress(new Uint8Array(await mediaEntry.buffer())),
      );
      for (const entry of manifest.entries) {
        expect(entry.name).toBe(entry.name.normalize("NFC"));
        expect(entry.sha1).toHaveLength(20);
      }
    } finally {
      await anki.cleanup();
    }
  });
});
