import InitSqlJs from "sql.js";
import { describe, expect, it } from "vitest";

import { platform } from "#platform";

import { AnkiPackage } from "./anki-package";
import { loadFixture } from "./anki-package.fixtures";
import { createZipBytes } from "./anki-package.roundtrip.fixtures";
import { mediaEntriesCodec } from "./anki-proto";
import { AnkiDatabase } from "./database";
import type { ColTable, DatabaseDump } from "./types";
import { readZipEntries } from "./zip";

const SOURCE = "anki/corpus/corpus-v3-single-deck.apkg";

/**
 * Reads all entries of the source package so tests can re-zip variants.
 * @returns The source package's ZIP entries by name
 */
async function sourceEntries(): Promise<Map<string, Uint8Array>> {
  return readZipEntries(await loadFixture(SOURCE));
}

async function buildVariant(
  mutate: (entries: Map<string, Uint8Array>) => Promise<void> | void,
): Promise<Uint8Array> {
  const entries = await sourceEntries();
  await mutate(entries);
  return createZipBytes([...entries.entries()].map(([name, content]) => ({ name, content })));
}

describe("modern reader error paths (Story 1.3.4/1.3.5 hardening)", () => {
  it("fails with a clear message when the media manifest is corrupt", async () => {
    const bytes = await buildVariant((entries) => {
      entries.set("media", new TextEncoder().encode("definitely not zstd"));
    });
    const result = await AnkiPackage.fromAnkiExport(bytes);
    expect(result.status).toBe("failure");
    expect(result.issues[0]?.message).toMatch(/media manifest.*could not be read/iu);
  });

  it("skips media files whose checksum does not match, with a warning", async () => {
    const bytes = await buildVariant(async (entries) => {
      // Replace media file 0 with validly-compressed WRONG content.
      entries.set("0", await platform.zstdCompress(new TextEncoder().encode("tampered content")));
    });
    const result = await AnkiPackage.fromAnkiExport(bytes);
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
    const bytes = await buildVariant((entries) => {
      entries.delete("0");
    });
    const result = await AnkiPackage.fromAnkiExport(bytes);
    expect(result.data).toBeDefined();
    const warnings = result.issues.filter((issue) => issue.severity === "warning");
    expect(warnings.some((issue) => /could not be read/iu.test(issue.message))).toBe(true);
    await result.data?.cleanup();
  });

  it("tolerates a missing media manifest entirely (old AnkiDroid packages)", async () => {
    const bytes = await buildVariant((entries) => {
      entries.delete("media");
      entries.delete("0");
    });
    const result = await AnkiPackage.fromAnkiExport(bytes);
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
    const result = await AnkiPackage.fromAnkiExport(await loadFixture(SOURCE));
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const outBytes = await anki.toAnkiExport();

      const outEntries = readZipEntries(outBytes);
      const mediaEntry = outEntries.get("media");
      expect(mediaEntry).toBeDefined();
      if (!mediaEntry) {
        return;
      }
      const manifest = mediaEntriesCodec.decode(await platform.zstdDecompress(mediaEntry));
      for (const entry of manifest.entries) {
        expect(entry.name).toBe(entry.name.normalize("NFC"));
        expect(entry.sha1).toHaveLength(20);
      }
    } finally {
      await anki.cleanup();
    }
  });
});
