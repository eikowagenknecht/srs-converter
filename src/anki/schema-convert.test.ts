import { readFile } from "node:fs/promises";

import type { Database } from "sql.js";
import InitSqlJs from "sql.js";
import { Open } from "unzipper";
import { beforeAll, describe, expect, it } from "vitest";

import {
  deckCommonCodec,
  deckConfigCodec,
  deckKindCodec,
  fieldConfigCodec,
  notetypeConfigCodec,
  templateConfigCodec,
} from "./anki-proto";
import type { DeckProtoBundle } from "./schema-convert";
import {
  confJsonToConfigRows,
  configRowsToConfJson,
  deckConfigProtoToSchema11,
  deckConfigSchema11ToProto,
  deckProtoToSchema11,
  deckSchema11ToProto,
  humanDeckNameToNative,
  nativeDeckNameToHuman,
  notetypeProtoToSchema11,
  notetypeSchema11ToProto,
  shortestF32,
  tagRowsToTagsJson,
  tagsJsonToTagRows,
} from "./schema-convert";
import { parseJsonWithBigInts, serializeWithBigInts } from "./util";

type Json = Record<string, unknown>;

/**
 * Normalizes bigint/number differences the same way blob storage would.
 *
 * @returns The value after a serialize/parse round-trip.
 */
function norm(value: unknown): unknown {
  return JSON.parse(serializeWithBigInts(value));
}

interface ModernDump {
  notetypes: Map<number, ReturnType<typeof notetypeSchema11ToProto>>;
  decks: Map<number, DeckProtoBundle>;
  deckConfigs: Map<number, ReturnType<typeof deckConfigSchema11ToProto>>;
  conf: Json;
  tags: Json;
  rawBlobs: {
    notetypeConfig: Map<number, Uint8Array>;
    fieldConfig: Map<string, Uint8Array>;
    templateConfig: Map<string, Uint8Array>;
    deckCommon: Map<number, Uint8Array>;
    deckKind: Map<number, Uint8Array>;
    deckConfig: Map<number, Uint8Array>;
    deckNames: Map<number, string>;
  };
}

interface LegacyDump {
  models: Record<string, Json>;
  decks: Record<string, Json>;
  dconf: Record<string, Json>;
  conf: Json;
  tags: Json;
}

let modern: ModernDump;
let legacy: LegacyDump;

function allRows(db: Database, sql: string): Record<string, unknown>[] {
  const result = db.exec(sql);
  if (result.length === 0 || !result[0]) {
    return [];
  }
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i] ?? "", v])));
}

beforeAll(async () => {
  const SQL = await InitSqlJs();

  // Modern side: the schema-18 database dumped by the fixture generator.
  // Schema-18 uses the custom `unicase` collation, which sql.js cannot
  // register — querying `tags` (unicase-collated WITHOUT ROWID PK) fails
  // with "no query solution". Full scans never rely on unicase ordering, so
  // stripping the collation from the schema text is safe for reading.
  const rawDb = new SQL.Database(
    new Uint8Array(
      await readFile("tests/fixtures/anki/corpus/artifacts/collection-schema18.sqlite"),
    ),
  );
  rawDb.exec("PRAGMA writable_schema=ON");
  rawDb.exec(
    "UPDATE sqlite_schema SET sql = REPLACE(sql, ' COLLATE unicase', '') WHERE sql LIKE '%unicase%'",
  );
  const patched = rawDb.export();
  rawDb.close();
  const modernDb = new SQL.Database(patched);

  const fieldsByNt = new Map<number, { ord: number; name: string; config: Uint8Array }[]>();
  const fieldBlobs = new Map<string, Uint8Array>();
  for (const row of allRows(
    modernDb,
    "SELECT ntid, ord, name, config FROM fields ORDER BY ntid, ord",
  )) {
    const ntid = row["ntid"] as number;
    const entry = {
      ord: row["ord"] as number,
      name: row["name"] as string,
      config: row["config"] as Uint8Array,
    };
    (fieldsByNt.get(ntid) ?? fieldsByNt.set(ntid, []).get(ntid))?.push(entry);
    fieldBlobs.set(`${String(ntid)}-${String(entry.ord)}`, entry.config);
  }
  const templatesByNt = new Map<number, { ord: number; name: string; config: Uint8Array }[]>();
  const templateBlobs = new Map<string, Uint8Array>();
  for (const row of allRows(
    modernDb,
    "SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord",
  )) {
    const ntid = row["ntid"] as number;
    const entry = {
      ord: row["ord"] as number,
      name: row["name"] as string,
      config: row["config"] as Uint8Array,
    };
    (templatesByNt.get(ntid) ?? templatesByNt.set(ntid, []).get(ntid))?.push(entry);
    templateBlobs.set(`${String(ntid)}-${String(entry.ord)}`, entry.config);
  }

  const notetypes = new Map<number, ReturnType<typeof notetypeSchema11ToProto>>();
  const notetypeConfigBlobs = new Map<number, Uint8Array>();
  for (const row of allRows(modernDb, "SELECT id, name, mtime_secs, usn, config FROM notetypes")) {
    const id = row["id"] as number;
    const blob = row["config"] as Uint8Array;
    notetypeConfigBlobs.set(id, blob);
    notetypes.set(id, {
      row: {
        id,
        name: row["name"] as string,
        mtimeSecs: row["mtime_secs"] as number,
        usn: row["usn"] as number,
      },
      config: notetypeConfigCodec.decode(blob),
      fields: (fieldsByNt.get(id) ?? []).map((field) => ({
        ord: field.ord,
        name: field.name,
        config: fieldConfigCodec.decode(field.config),
      })),
      templates: (templatesByNt.get(id) ?? []).map((template) => ({
        ord: template.ord,
        name: template.name,
        config: templateConfigCodec.decode(template.config),
      })),
    });
  }

  const decks = new Map<number, DeckProtoBundle>();
  const deckCommonBlobs = new Map<number, Uint8Array>();
  const deckKindBlobs = new Map<number, Uint8Array>();
  const deckNames = new Map<number, string>();
  for (const row of allRows(
    modernDb,
    "SELECT id, name, mtime_secs, usn, common, kind FROM decks",
  )) {
    const id = row["id"] as number;
    const common = row["common"] as Uint8Array;
    const kind = row["kind"] as Uint8Array;
    deckCommonBlobs.set(id, common);
    deckKindBlobs.set(id, kind);
    deckNames.set(id, row["name"] as string);
    decks.set(id, {
      row: {
        id,
        name: row["name"] as string,
        mtimeSecs: row["mtime_secs"] as number,
        usn: row["usn"] as number,
      },
      common: deckCommonCodec.decode(common),
      kind: deckKindCodec.decode(kind),
    });
  }

  const deckConfigs = new Map<number, ReturnType<typeof deckConfigSchema11ToProto>>();
  const deckConfigBlobs = new Map<number, Uint8Array>();
  for (const row of allRows(
    modernDb,
    "SELECT id, name, mtime_secs, usn, config FROM deck_config",
  )) {
    const id = row["id"] as number;
    const blob = row["config"] as Uint8Array;
    deckConfigBlobs.set(id, blob);
    deckConfigs.set(id, {
      row: {
        id,
        name: row["name"] as string,
        mtimeSecs: row["mtime_secs"] as number,
        usn: row["usn"] as number,
      },
      config: deckConfigCodec.decode(blob),
    });
  }

  const conf = configRowsToConfJson(
    allRows(modernDb, "SELECT KEY, usn, mtime_secs, val FROM config").map((row) => ({
      key: row["KEY"] as string,
      usn: row["usn"] as number,
      mtimeSecs: row["mtime_secs"] as number,
      val: row["val"] as Uint8Array,
    })),
  );
  const tags = tagRowsToTagsJson(
    allRows(modernDb, "SELECT tag, usn, collapsed, config FROM tags").map((row) => ({
      tag: row["tag"] as string,
      usn: row["usn"] as number,
      collapsed: Boolean(row["collapsed"]),
      config: (row["config"] as Uint8Array | null) ?? null,
    })),
  );
  modernDb.close();

  modern = {
    notetypes,
    decks,
    deckConfigs,
    conf,
    tags,
    rawBlobs: {
      notetypeConfig: notetypeConfigBlobs,
      fieldConfig: fieldBlobs,
      templateConfig: templateBlobs,
      deckCommon: deckCommonBlobs,
      deckKind: deckKindBlobs,
      deckConfig: deckConfigBlobs,
      deckNames,
    },
  };

  // Legacy side: what Anki itself wrote when downgrading the same collection.
  const zip = await Open.file("tests/fixtures/anki/corpus/corpus-legacy2.apkg");
  const dbEntry = zip.files.find((file) => file.path === "collection.anki21");
  if (!dbEntry) {
    throw new Error("collection.anki21 missing from legacy corpus");
  }
  const legacyDb = new SQL.Database(new Uint8Array(await dbEntry.buffer()));
  const colRow = allRows(legacyDb, "SELECT * FROM col")[0];
  if (!colRow) {
    throw new Error("col row missing from legacy corpus");
  }
  legacy = {
    models: parseJsonWithBigInts(colRow["models"] as string) as Record<string, Json>,
    decks: parseJsonWithBigInts(colRow["decks"] as string) as Record<string, Json>,
    dconf: parseJsonWithBigInts(colRow["dconf"] as string) as Record<string, Json>,
    conf: parseJsonWithBigInts(colRow["conf"] as string) as Json,
    tags: parseJsonWithBigInts(colRow["tags"] as string) as Json,
  };
  legacyDb.close();
});

describe("proto→11 matches Anki's own legacy export (differential oracle)", () => {
  it("converts every notetype identically", () => {
    // The .apkg export only gathers notetypes in use — the unused stock
    // notetypes are absent from the legacy side.
    const legacyIds = Object.keys(legacy.models).map(Number);
    expect(legacyIds.length).toBeGreaterThanOrEqual(5);
    for (const id of legacyIds) {
      const bundle = modern.notetypes.get(id);
      expect(bundle, `notetype ${id.toFixed(0)} missing from modern dump`).toBeDefined();
      if (bundle) {
        expect(norm(notetypeProtoToSchema11(bundle)), `notetype ${id.toFixed(0)}`).toEqual(
          norm(legacy.models[String(id)]),
        );
      }
    }
  });

  it("converts every deck identically", () => {
    const legacyIds = Object.keys(legacy.decks).map(Number);
    expect(legacyIds.length).toBeGreaterThanOrEqual(5);
    for (const id of legacyIds) {
      const bundle = modern.decks.get(id);
      expect(bundle, `deck ${id.toFixed(0)} missing from modern dump`).toBeDefined();
      if (bundle) {
        expect(norm(deckProtoToSchema11(bundle)), `deck ${id.toFixed(0)}`).toEqual(
          norm(legacy.decks[String(id)]),
        );
      }
    }
  });

  it("converts every deck preset identically", () => {
    const legacyIds = Object.keys(legacy.dconf).map(Number);
    expect(legacyIds.length).toBeGreaterThanOrEqual(3);
    for (const id of legacyIds) {
      const bundle = modern.deckConfigs.get(id);
      expect(bundle, `preset ${id.toFixed(0)} missing from modern dump`).toBeDefined();
      if (bundle) {
        expect(norm(deckConfigProtoToSchema11(bundle)), `preset ${id.toFixed(0)}`).toEqual(
          norm(legacy.dconf[String(id)]),
        );
      }
    }
  });

  // `col.conf` and `col.tags` in an exported .apkg come from the export's
  // temp collection (fresh conf, empty tag registry), so the legacy apkg is
  // no oracle for them — assert the conversions round-trip instead.
  it("round-trips col.conf through config rows", () => {
    expect(modern.conf["fsrs"]).toBe(true); // set by the fixture generator
    const modernRoundTrip = configRowsToConfJson(confJsonToConfigRows(modern.conf));
    expect(norm(modernRoundTrip)).toEqual(norm(modern.conf));
    const legacyRoundTrip = configRowsToConfJson(confJsonToConfigRows(legacy.conf));
    expect(norm(legacyRoundTrip)).toEqual(norm(legacy.conf));
  });

  it("round-trips col.tags through tag rows", () => {
    expect(Object.keys(modern.tags).sort()).toEqual(["cloze", "level::a1", "vocab"]);
    expect(tagRowsToTagsJson(tagsJsonToTagRows(modern.tags))).toEqual(modern.tags);
  });
});

describe("11→proto encodes byte-identically to Anki's own upgrade", () => {
  it("encodes every notetype, field, and template config", () => {
    for (const [id, model] of Object.entries(legacy.models)) {
      const bundle = notetypeSchema11ToProto(model);
      expect(notetypeConfigCodec.encode(bundle.config as never), `notetype ${id} config`).toEqual(
        modern.rawBlobs.notetypeConfig.get(Number(id)),
      );
      for (const field of bundle.fields) {
        expect(
          fieldConfigCodec.encode(field.config as never),
          `field ${id}/${field.ord.toFixed(0)}`,
        ).toEqual(modern.rawBlobs.fieldConfig.get(`${id}-${String(field.ord)}`));
      }
      for (const template of bundle.templates) {
        expect(
          templateConfigCodec.encode(template.config as never),
          `template ${id}/${template.ord.toFixed(0)}`,
        ).toEqual(modern.rawBlobs.templateConfig.get(`${id}-${String(template.ord)}`));
      }
    }
  });

  it("encodes every deck common/kind blob and converts the name", () => {
    for (const [id, deck] of Object.entries(legacy.decks)) {
      const bundle = deckSchema11ToProto(deck);
      expect(deckCommonCodec.encode(bundle.common as never), `deck ${id} common`).toEqual(
        modern.rawBlobs.deckCommon.get(Number(id)),
      );
      expect(deckKindCodec.encode(bundle.kind as never), `deck ${id} kind`).toEqual(
        modern.rawBlobs.deckKind.get(Number(id)),
      );
      expect(bundle.row.name, `deck ${id} native name`).toBe(
        modern.rawBlobs.deckNames.get(Number(id)),
      );
    }
  });

  it("encodes every deck preset config blob", () => {
    for (const [id, dconf] of Object.entries(legacy.dconf)) {
      const bundle = deckConfigSchema11ToProto(dconf);
      expect(deckConfigCodec.encode(bundle.config as never), `preset ${id}`).toEqual(
        modern.rawBlobs.deckConfig.get(Number(id)),
      );
    }
  });
});

describe("mapping gotchas", () => {
  it("swaps new.order enum values between dialects", () => {
    const base = { new: { order: 0 } };
    expect(deckConfigSchema11ToProto(base).config.new_card_insert_order).toBe(1); // random
    expect(deckConfigSchema11ToProto({ new: { order: 1 } }).config.new_card_insert_order).toBe(0);

    const roundTripped = deckConfigProtoToSchema11(deckConfigSchema11ToProto(base));
    expect((roundTripped["new"] as Json)["order"]).toBe(0);
  });

  it("inverts autoplay and replayq", () => {
    const proto = deckConfigSchema11ToProto({ autoplay: false, replayq: false }).config;
    expect(proto.disable_autoplay).toBe(true);
    expect(proto.skip_question_when_replaying_answer).toBe(true);

    const json = deckConfigProtoToSchema11(
      deckConfigSchema11ToProto({ autoplay: true, replayq: true }),
    );
    expect(json["autoplay"]).toBe(true);
    expect(json["replayq"]).toBe(true);
  });

  it("treats deck-level desiredRetention as integer percent", () => {
    const proto = deckSchema11ToProto({ dyn: 0, desiredRetention: 92 });
    expect(proto.kind.normal?.desired_retention).toBeCloseTo(0.92, 6);

    const base = deckSchema11ToProto({ dyn: 0 });
    if (!base.kind.normal) {
      throw new Error("expected a normal deck");
    }
    const json = deckProtoToSchema11({
      row: { id: 1, name: "D", mtimeSecs: 0, usn: 0 },
      common: base.common,
      kind: {
        normal: {
          ...base.kind.normal,
          desired_retention: Math.fround(0.925),
        },
      },
    });
    expect(json["desiredRetention"]).toBe(92);
  });

  it("zeroes stale today-counters when combining days", () => {
    const proto = deckSchema11ToProto({
      dyn: 0,
      lrnToday: [5, 3],
      revToday: [6, 2],
      newToday: [6, 1],
      timeToday: [4, 9],
    });
    expect(proto.common.last_day_studied).toBe(6);
    expect(proto.common.learning_studied).toBe(0); // day 5 < 6 → reset
    expect(proto.common.review_studied).toBe(2);
    expect(proto.common.new_studied).toBe(1);
    expect(proto.common.milliseconds_studied).toBe(9);
  });

  it("strips reserved keys when splatting add-on data", () => {
    const other = new TextEncoder().encode(JSON.stringify({ conf: 999, custom: 1 }));
    const json = deckProtoToSchema11({
      row: { id: 1, name: "D", mtimeSecs: 0, usn: 0 },
      common: { ...deckSchema11ToProto({ dyn: 0 }).common, other },
      kind: deckSchema11ToProto({ dyn: 0, conf: 7 }).kind,
    });
    expect(json["conf"]).toBe(7); // real value wins over add-on data
    expect(json["custom"]).toBe(1);
  });

  it("converts deck name separators both ways", () => {
    expect(humanDeckNameToNative("Parent::Child::Leaf")).toBe("Parent\u001FChild\u001FLeaf");
    expect(nativeDeckNameToHuman("Parent\u001FChild")).toBe("Parent::Child");
  });

  it("emits filtered-deck compatibility keys", () => {
    const bundle = deckSchema11ToProto({
      dyn: 1,
      resched: true,
      terms: [["deck:X", 50, 2]],
    });
    const json = deckProtoToSchema11({
      row: { id: 9, name: "Cram", mtimeSecs: 0, usn: 0 },
      common: bundle.common,
      kind: bundle.kind,
    });
    expect(json["separate"]).toBe(true); // old clients require the key
    expect(json["terms"]).toEqual([["deck:X", 50, 2]]);
    expect(json["dyn"]).toBe(1);
    expect(json["md"]).toBeUndefined(); // skipped when false
  });

  it("shortens f32 floats like Anki's serializer", () => {
    expect(shortestF32(Math.fround(0.4))).toBe(0.4);
    expect(shortestF32(Math.fround(1.3))).toBe(1.3);
    expect(shortestF32(2.5)).toBe(2.5);
    expect(shortestF32(0)).toBe(0);
  });
});
