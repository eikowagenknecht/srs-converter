# Audit Repro Harness (2026-07-10)

> [!note]
> **Status: all findings fixed.** Every finding these repros demonstrate
> (F1–F18, S1–S5) has been resolved by work packages WP1–WP7
> (`docs/working/fixplan-2026-07-10.md`); regression tests asserting the
> _correct_ behavior now live in the real suite (e.g.
> `src/anki/anki-package.roundtrip.test.ts`). This file is retained for
> reference only — the scripts below still assert the original _buggy_ values.

Verbatim preservation of the executable repro scripts behind
`docs/working/audit-2026-07-10-roundtrip.md`. They were run from a scratch
directory (outside the repo) so the test suite and quality gates never see
them. Each test asserts the _buggy_ value — a green run confirms the bug.
When porting into the real suite (see `docs/working/fixplan-2026-07-10.md`),
invert the assertions.

> [!warning]
> Several string literals contain a **literal U+001F** character (the Anki
> field separator) that is invisible in most editors. Copy these files,
> don't retype them. Lines containing U+001F are marked in the originals by
> `cat -A` as `^_`.

**How to run** (from the repo root, with the files in a scratch dir that has
a `node_modules` symlink to the repo's):

```bash
SCRATCH=/path/to/scratch
ln -sfn "$(pwd)/node_modules" "$SCRATCH/node_modules"
npx vitest run --config "$SCRATCH/vitest.audit.config.ts" --reporter=verbose --silent=false
```

Adjust the two absolute paths in `vitest.audit.config.ts` (scratch root and
repo `src`) to your locations.

## `vitest.audit.config.ts`

```ts
import { defineConfig } from "vitest/config";

const SCRATCH =
  "/tmp/claude-1000/-home-eiko-repos-srs-converter/66a1a6a9-174f-4005-b1c6-7055aadf9621/scratchpad";

export default defineConfig({
  root: SCRATCH,
  test: {
    environment: "node",
    include: ["**/*.audit.ts"],
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": "/home/eiko/repos/srs-converter/src",
    },
  },
});
```

## `helpers.ts`

```ts
/**
 * Audit helpers: hand-build an adversarial legacy-v2 .apkg with full control
 * over every field, and read raw DB contents back out of any .apkg without
 * going through the library (ground truth for diffs).
 */
import { Buffer } from "node:buffer";
import { createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArchiverError } from "archiver";
import { ZipArchive } from "archiver";
import InitSqlJs from "sql.js";
import { Open } from "unzipper";

// Protobuf meta for Legacy V2: field 1 (varint) = 2
export const validMetaV2 = Buffer.from([0x08, 0x02]);

export const SRC = {
  crt: 1_600_000_000,
  colMod: 1_650_000_000_000,
  scm: 1_650_000_000_001,
  ls: 1_650_000_000_002,
  colUsn: 5,
  deckId: 100,
  dconfId: 7,
  standardModelId: 1_650_000_001_000,
  clozeModelId: 1_650_000_002_000,
  // template/field ids: 64-bit values beyond Number.MAX_SAFE_INTEGER (2^53-1)
  tmpl1Id: "6134417914424963362",
  tmpl2Id: "-923857114982271111",
  fld1Id: "4626726189742088228",
  fld2Id: "-8113853199325282904",
  noteAId: 1_650_000_010_000,
  noteAGuid: "ABCdef1234",
  noteBId: 1_650_000_012_000,
  noteBGuid: "XYZguid99",
  cardA1Id: 1_650_000_020_000,
  cardA2Id: 1_650_000_022_000,
  cardB1Id: 1_650_000_024_000,
  cardB2Id: 1_650_000_026_000,
} as const;

const FS = "";

/** Models JSON is written as a raw string so we control the exact number literals. */
function buildModelsJson(): string {
  const standard = `"${SRC.standardModelId.toString()}":{"id":${SRC.standardModelId.toString()},"name":"Vocab","type":0,"mod":1650000001,"usn":3,"sortf":1,"did":${SRC.deckId.toString()},"tmpls":[{"id":${SRC.tmpl1Id},"name":"Card 1","ord":0,"qfmt":"{{Front}}","afmt":"{{Back}}","bqfmt":"BQ-OVERRIDE","bafmt":"BA-OVERRIDE","did":${SRC.deckId.toString()},"bfont":"Times","bsize":12},{"id":${SRC.tmpl2Id},"name":"Card 2","ord":1,"qfmt":"{{Back}}","afmt":"{{Front}}","bqfmt":"","bafmt":"","did":null,"bfont":"","bsize":0}],"flds":[{"id":${SRC.fld1Id},"name":"Front","ord":0,"sticky":true,"rtl":true,"font":"Courier","size":14,"description":"front description","plainText":true,"collapsed":true,"excludeFromSearch":true,"tag":7,"preventDeletion":true},{"id":${SRC.fld2Id},"name":"Back","ord":1,"sticky":false,"rtl":false,"font":"Arial","size":20,"description":"","plainText":false,"collapsed":false,"excludeFromSearch":false,"tag":null,"preventDeletion":false},{"id":1234,"name":"2024","ord":2,"sticky":false,"rtl":false,"font":"Arial","size":20,"description":"","plainText":false,"collapsed":false,"excludeFromSearch":false,"tag":null,"preventDeletion":false}],"css":".card { color: red; /* custom */ }","latexPre":"CUSTOM_LATEX_PRE","latexPost":"CUSTOM_LATEX_POST","latexsvg":true,"req":[[0,"any",[0]],[1,"any",[1]]],"originalStockKind":null,"addonKey":"addonValue"}`;
  const cloze = `"${SRC.clozeModelId.toString()}":{"id":${SRC.clozeModelId.toString()},"name":"MyCloze","type":1,"mod":1650000002,"usn":3,"sortf":0,"did":${SRC.deckId.toString()},"tmpls":[{"id":111,"name":"Cloze","ord":0,"qfmt":"{{cloze:Text}}","afmt":"{{cloze:Text}}<br>{{Extra}}","bqfmt":"","bafmt":"","did":null,"bfont":"","bsize":0}],"flds":[{"id":222,"name":"Text","ord":0,"sticky":false,"rtl":false,"font":"Arial","size":20,"description":"","plainText":false,"collapsed":false,"excludeFromSearch":false,"tag":null,"preventDeletion":true},{"id":333,"name":"Extra","ord":1,"sticky":false,"rtl":false,"font":"Arial","size":20,"description":"","plainText":false,"collapsed":false,"excludeFromSearch":false,"tag":null,"preventDeletion":false}],"css":".cloze { color: blue; }","latexPre":"CLOZE_PRE","latexPost":"CLOZE_POST","latexsvg":false,"req":[[0,"any",[0]]],"originalStockKind":5}`;
  return `{${standard},${cloze}}`;
}

function buildDecksJson(): string {
  return JSON.stringify({
    [SRC.deckId.toString()]: {
      id: SRC.deckId,
      mod: 1_650_000_003,
      name: "Source Deck",
      usn: 2,
      lrnToday: [12, 3],
      revToday: [12, 4],
      newToday: [12, 5],
      timeToday: [12, 60_000],
      collapsed: false,
      browserCollapsed: false,
      desc: "Deck description <b>html</b>",
      dyn: 0,
      conf: SRC.dconfId,
      extendNew: 5,
      extendRev: 6,
      reviewLimit: 50,
      newLimit: 40,
      reviewLimitToday: 50,
      newLimitToday: 40,
      deckPluginKey: "deck-plugin-value",
    },
  });
}

function buildConfJson(): string {
  return JSON.stringify({
    dueCounts: false,
    creationOffset: 300,
    estTimes: false,
    dayLearnFirst: true,
    newSpread: 1,
    schedVer: 2,
    collapseTime: 600,
    curModel: SRC.standardModelId,
    sched2021: false,
    timeLim: 300,
    activeDecks: [SRC.deckId],
    sortType: "cardDue",
    curDeck: SRC.deckId,
    nextPos: 6,
    sortBackwards: true,
    addToCur: false,
    confPluginKey: { nested: true, answer: 42 },
  });
}

function buildDconfJson(): string {
  return JSON.stringify({
    [SRC.dconfId.toString()]: {
      id: SRC.dconfId,
      mod: 1_650_000_004,
      name: "Hard Preset",
      usn: 1,
      maxTaken: 30,
      autoplay: false,
      timer: 1,
      replayq: false,
      new: {
        bury: true,
        delays: [5, 25],
        initialFactor: 1900,
        ints: [2, 5, 0],
        order: 0,
        perDay: 5,
      },
      rev: { bury: true, ease4: 1.5, ivlFct: 0.8, maxIvl: 999, perDay: 77, hardFactor: 1.1 },
      lapse: { delays: [20], leechAction: 0, leechFails: 4, minInt: 2, mult: 0.5 },
      dyn: false,
      newMix: 1,
      newPerDayMinimum: 2,
      interdayLearningMix: 1,
      reviewOrder: 2,
      newSortOrder: 1,
      newGatherPriority: 1,
      buryInterdayLearning: true,
      fsrsWeights: [0.4, 0.6],
      desiredRetention: 0.85,
      ignoreRevlogsBeforeDate: "2020-01-01",
      stopTimerOnAnswer: true,
      secondsToShowQuestion: 3,
      secondsToShowAnswer: 4,
      questionAction: 1,
      answerAction: 2,
      waitForAudio: false,
      sm2Retention: 0.8,
      weightSearch: "deck:current",
      dconfPluginKey: "dconf-plugin-value",
    },
  });
}

export const NOTE_A_FLDS = `front<br>HTML${FS}back value${FS}third field`;
export const NOTE_B_FLDS = `The formula is {{c1::\\(x^{2}\\)}} and {{c2::simple}}${FS}extra info`;

export async function buildSourceDbBuffer(): Promise<Uint8Array> {
  const SQL = await InitSqlJs();
  const db = new SQL.Database();

  db.run(`
CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL);
`);

  db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    1,
    SRC.crt,
    SRC.colMod,
    SRC.scm,
    11,
    0,
    SRC.colUsn,
    SRC.ls,
    buildConfJson(),
    buildModelsJson(),
    buildDecksJson(),
    buildDconfJson(),
    JSON.stringify({ leech: -1 }),
  ]);

  // Note A: standard model, 3 fields, tags, guid, csum, flags, addon data
  db.run("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
    SRC.noteAId,
    SRC.noteAGuid,
    SRC.standardModelId,
    1_650_000_011,
    4,
    " vocab important ",
    NOTE_A_FLDS,
    "front HTML",
    2_645_262_690,
    3,
    '{"addon":"noteData"}',
  ]);
  // Note B: cloze with MathJax braces in c1
  db.run("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
    SRC.noteBId,
    SRC.noteBGuid,
    SRC.clozeModelId,
    1_650_000_013,
    4,
    "math",
    NOTE_B_FLDS,
    "The formula is x^2 and simple",
    123_456_789,
    0,
    "",
  ]);

  // Card A1: review card (queue 2, type 2), red flag, addon data
  db.run("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    SRC.cardA1Id,
    SRC.noteAId,
    SRC.deckId,
    0,
    1_650_000_021,
    4,
    2,
    2,
    150,
    30,
    2600,
    10,
    2,
    0,
    0,
    0,
    1,
    '{"addonCard":1}',
  ]);
  // Card A2: intraday learning card (queue 1), due = epoch seconds, negative ivl (seconds), left encodes reps
  db.run("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    SRC.cardA2Id,
    SRC.noteAId,
    SRC.deckId,
    1,
    1_650_000_023,
    4,
    1,
    1,
    1_650_000_500,
    -600,
    0,
    1,
    0,
    1002,
    0,
    0,
    0,
    "",
  ]);
  // Card B1: cloze ord 0 (the MathJax cloze), review card that sits in a filtered deck state (odid/odue set)
  db.run("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    SRC.cardB1Id,
    SRC.noteBId,
    SRC.deckId,
    0,
    1_650_000_025,
    4,
    2,
    2,
    200,
    45,
    2350,
    3,
    1,
    0,
    99,
    200,
    0,
    "",
  ]);
  // Card B2: cloze ord 1, suspended (queue -1)
  db.run("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    SRC.cardB2Id,
    SRC.noteBId,
    SRC.deckId,
    1,
    1_650_000_027,
    4,
    0,
    -1,
    5,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    "",
  ]);

  // Reviews (all on card A1/A2 so the silent cloze-card drop stays silent)
  db.run("INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)", [
    1_650_000_030_000,
    SRC.cardA1Id,
    4,
    3,
    30,
    15,
    2600,
    4500,
    1,
  ]);
  db.run("INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)", [
    1_650_000_030_001,
    SRC.cardA1Id,
    4,
    1,
    -60,
    30,
    2450,
    60_000,
    0,
  ]);
  db.run("INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)", [
    1_650_000_031_000,
    SRC.cardA2Id,
    4,
    4,
    100,
    45,
    2800,
    900,
    3,
  ]);

  // A grave entry (deleted note)
  db.run("INSERT INTO graves VALUES (?,?,?)", [4, 1_649_999_999_000, 1]);

  const out = db.export();
  db.close();
  return out;
}

export function createZip(
  zipPath: string,
  files: { name: string; content: string | Buffer }[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive();
    output.on("close", () => {
      resolve();
    });
    archive.on("error", (err: ArchiverError) => {
      reject(err);
    });
    archive.pipe(output);
    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }
    void archive.finalize();
  });
}

export const MEDIA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
export const MEDIA_MP3 = Buffer.from([0x49, 0x44, 0x33, 4, 5, 6]);

/** Builds the adversarial source .apkg and returns its path. */
export async function buildSourceApkg(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "audit-src-"));
  const apkgPath = join(dir, "source.apkg");
  const dbBuffer = await buildSourceDbBuffer();
  await createZip(apkgPath, [
    { name: "collection.anki21", content: Buffer.from(dbBuffer) },
    { name: "meta", content: validMetaV2 },
    { name: "media", content: JSON.stringify({ "0": "image üñï.png", "1": "sound.mp3" }) },
    { name: "0", content: MEDIA_PNG },
    { name: "1", content: MEDIA_MP3 },
  ]);
  return apkgPath;
}

export interface RawDump {
  col: {
    id: number;
    crt: number;
    mod: number;
    scm: number;
    ver: number;
    dty: number;
    usn: number;
    ls: number;
    conf: Record<string, unknown>;
    models: Record<string, Record<string, unknown>>;
    decks: Record<string, Record<string, unknown>>;
    dconf: Record<string, Record<string, unknown>>;
    tags: Record<string, unknown>;
    modelsRaw: string;
  };
  notes: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  revlog: Record<string, unknown>[];
  graves: Record<string, unknown>[];
  zipEntries: string[];
  mediaManifest: Record<string, string>;
}

/** Ground-truth reader: opens an .apkg with unzipper + sql.js directly. */
export async function readApkgRaw(apkgPath: string): Promise<RawDump> {
  const zip = await Open.file(apkgPath);
  const zipEntries = zip.files.map((f) => f.path).sort();
  const dbEntry = zip.files.find((f) => f.path === "collection.anki21");
  if (!dbEntry) throw new Error("collection.anki21 missing");
  const mediaEntry = zip.files.find((f) => f.path === "media");
  const mediaManifest = mediaEntry
    ? (JSON.parse((await mediaEntry.buffer()).toString() || "{}") as Record<string, string>)
    : {};

  const SQL = await InitSqlJs();
  const db = new SQL.Database(await dbEntry.buffer());

  const rows = (sql: string): Record<string, unknown>[] => {
    const res = db.exec(sql);
    if (res.length === 0 || !res[0]) return [];
    const { columns, values } = res[0];
    return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i] ?? "", v])));
  };

  const colRow = rows("SELECT * FROM col")[0];
  if (!colRow) throw new Error("col row missing");
  const col = {
    id: colRow["id"] as number,
    crt: colRow["crt"] as number,
    mod: colRow["mod"] as number,
    scm: colRow["scm"] as number,
    ver: colRow["ver"] as number,
    dty: colRow["dty"] as number,
    usn: colRow["usn"] as number,
    ls: colRow["ls"] as number,
    conf: JSON.parse(colRow["conf"] as string) as Record<string, unknown>,
    models: JSON.parse(colRow["models"] as string) as Record<string, Record<string, unknown>>,
    decks: JSON.parse(colRow["decks"] as string) as Record<string, Record<string, unknown>>,
    dconf: JSON.parse(colRow["dconf"] as string) as Record<string, Record<string, unknown>>,
    tags: JSON.parse(colRow["tags"] as string) as Record<string, unknown>,
    modelsRaw: colRow["models"] as string,
  };

  const dump: RawDump = {
    col,
    notes: rows("SELECT * FROM notes ORDER BY id"),
    cards: rows("SELECT * FROM cards ORDER BY id"),
    revlog: rows("SELECT * FROM revlog ORDER BY id"),
    graves: rows("SELECT * FROM graves"),
    zipEntries,
    mediaManifest,
  };
  db.close();
  return dump;
}
```

## `01-roundtrip.audit.ts`

```ts
/**
 * Full round-trip audit: source.apkg → AnkiPackage → SrsPackage → AnkiPackage → out.apkg
 *
 * Assertions are written so that a PASSING test CONFIRMS the bug
 * (i.e. expect(...) asserts the observed-buggy value).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";

import { NOTE_A_FLDS, SRC, buildSourceApkg, readApkgRaw } from "./helpers";

const FS = "";

describe("Anki → SRS → Anki round-trip (single deck, status must stay silent)", () => {
  it("silently loses/corrupts data listed below", async () => {
    const srcPath = await buildSourceApkg();
    const outDir = await mkdtemp(join(tmpdir(), "audit-out-"));
    const outPath = join(outDir, "roundtrip.apkg");

    // ---- Read source
    const readResult = await AnkiPackage.fromAnkiExport(srcPath);
    expect(readResult.status).toBe("success");
    expect(readResult.issues).toEqual([]);
    const src = readResult.data;
    if (!src) throw new Error("no data");

    // ---- Anki → SRS
    const srsResult = src.toSrsPackage();
    expect(srsResult.status).toBe("success");
    expect(srsResult.issues).toEqual([]);
    const srs = srsResult.data;
    if (!srs) throw new Error("no srs");

    // ---- SRS → Anki
    const backResult = await AnkiPackage.fromSrsPackage(srs);
    expect(backResult.status).toBe("success");
    expect(backResult.issues).toEqual([]);
    const back = backResult.data;
    if (!back) throw new Error("no back");

    // ---- Write output
    await back.toAnkiExport(outPath);

    // ---- Ground truth diff
    const before = await readApkgRaw(srcPath);
    const after = await readApkgRaw(outPath);

    console.log("=== NOTES AFTER ===", JSON.stringify(after.notes, null, 2));
    console.log("=== CARDS AFTER ===", JSON.stringify(after.cards, null, 2));
    console.log("=== REVLOG AFTER ===", JSON.stringify(after.revlog, null, 2));
    console.log("=== DECKS AFTER ===", JSON.stringify(after.col.decks, null, 2));
    console.log("=== MODELS AFTER ===", after.col.modelsRaw);
    console.log("=== CONF AFTER ===", JSON.stringify(after.col.conf));
    console.log("=== DCONF AFTER ===", JSON.stringify(after.col.dconf));
    console.log(
      "=== COL after: crt/mod/scm/usn/ls ===",
      after.col.crt,
      after.col.mod,
      after.col.scm,
      after.col.usn,
      after.col.ls,
    );
    console.log(
      "=== ZIP ENTRIES ===",
      after.zipEntries,
      "MEDIA:",
      JSON.stringify(after.mediaManifest),
    );
    console.log("=== GRAVES AFTER ===", JSON.stringify(after.graves));

    // ============ NOTES ============
    const noteA_after = after.notes.find((n) => n["id"] === SRC.noteAId);
    expect(noteA_after, "note A should survive via originalAnkiId").toBeDefined();
    if (!noteA_after) throw new Error("unreachable");

    // BUG: guid regenerated instead of restored from ankiGuid
    expect(noteA_after["guid"]).not.toBe(SRC.noteAGuid);
    // BUG: tags dropped
    expect(noteA_after["tags"]).toBe("");
    // BUG: csum zeroed
    expect(noteA_after["csum"]).toBe(0);
    // BUG: mod/usn/flags zeroed
    expect(noteA_after["mod"]).toBe(0);
    expect(noteA_after["flags"]).toBe(0);
    // CLEAN?: note data (plugin) preserved
    expect(noteA_after["data"]).toBe('{"addon":"noteData"}');
    // CLEAN?: field content preserved
    expect(noteA_after["flds"]).toBe(NOTE_A_FLDS);
    // BUG: sfld = raw first field (HTML not stripped, sortf=1 ignored; original sfld was "front HTML")
    expect(noteA_after["sfld"]).toBe(`front<br>HTML`);

    // ============ CARDS ============
    const cardA1_after = after.cards.find((c) => c["id"] === SRC.cardA1Id);
    expect(cardA1_after, "card A1 should survive via originalAnkiId").toBeDefined();
    if (!cardA1_after) throw new Error("unreachable");

    // BUG: entire scheduling state reset to "new card"
    const beforeA1 = before.cards.find((c) => c["id"] === SRC.cardA1Id);
    console.log("cardA1 before:", JSON.stringify(beforeA1), "after:", JSON.stringify(cardA1_after));
    expect(cardA1_after["type"]).toBe(0); // was 2 (review)
    expect(cardA1_after["queue"]).toBe(0); // was 2
    expect(cardA1_after["due"]).toBe(0); // was 150
    expect(cardA1_after["ivl"]).toBe(0); // was 30
    expect(cardA1_after["factor"]).toBe(0); // was 2600
    expect(cardA1_after["reps"]).toBe(0); // was 10
    expect(cardA1_after["lapses"]).toBe(0); // was 2
    expect(cardA1_after["flags"]).toBe(0); // was 1 (red flag)
    // CLEAN?: card plugin data preserved
    expect(cardA1_after["data"]).toBe('{"addonCard":1}');

    // BUG: suspended cloze card B2 (queue -1) unsuspended
    const cardB2_after = after.cards.find((c) => c["id"] === SRC.cardB2Id);
    if (cardB2_after) {
      expect(cardB2_after["queue"]).toBe(0);
    }

    // BUG: cloze card for c1 ({{c1::\(x^{2}\)}}) silently dropped (regex cannot match "}" inside cloze)
    const noteB_cards_after = after.cards.filter((c) => c["nid"] === SRC.noteBId);
    console.log("note B cards after:", JSON.stringify(noteB_cards_after));
    expect(noteB_cards_after.length).toBe(1); // was 2 (ord 0 + ord 1)
    expect(noteB_cards_after[0]?.["ord"]).toBe(1);

    // ============ REVLOG ============
    const rev1_after = after.revlog.find((r) => r["id"] === 1_650_000_030_000);
    expect(rev1_after).toBeDefined();
    if (!rev1_after) throw new Error("unreachable");
    // CLEAN?: ease preserved
    expect(rev1_after["ease"]).toBe(3);
    // BUG: ivl/lastIvl/factor/time/type all zeroed
    expect(rev1_after["ivl"]).toBe(0); // was 30
    expect(rev1_after["lastIvl"]).toBe(0); // was 15
    expect(rev1_after["factor"]).toBe(0); // was 2600
    expect(rev1_after["time"]).toBe(0); // was 4500
    expect(rev1_after["type"]).toBe(0); // was 1

    // ============ NOTE TYPES ============
    const modelAfter = Object.values(after.col.models).find((m) => m["name"] === "Vocab");
    expect(modelAfter, "Vocab model present").toBeDefined();
    if (!modelAfter) throw new Error("unreachable");
    // BUG: css / latex / sortf / req / plugin key replaced by hardcoded defaults
    expect(modelAfter["css"]).not.toContain("color: red");
    expect(modelAfter["latexPre"]).not.toBe("CUSTOM_LATEX_PRE");
    expect(modelAfter["latexsvg"]).toBe(false); // was true
    expect(modelAfter["sortf"]).toBe(0); // was 1
    expect(modelAfter["addonKey"]).toBeUndefined(); // plugin key dropped
    const tmpls = modelAfter["tmpls"] as Record<string, unknown>[];
    expect(tmpls[0]?.["bqfmt"]).toBe(""); // was "BQ-OVERRIDE"
    expect(tmpls[0]?.["bfont"]).toBe(""); // was "Times"
    expect(tmpls[0]?.["did"]).toBe(null); // was 100
    const flds = modelAfter["flds"] as Record<string, unknown>[];
    expect(flds[0]?.["font"]).toBe("Arial"); // was "Courier"
    expect(flds[0]?.["rtl"]).toBe(false); // was true
    expect(flds[0]?.["sticky"]).toBe(false); // was true
    // CLEAN?: field description preserved
    console.log("field descriptions after:", JSON.stringify(flds.map((f) => f["description"])));

    // ============ DECKS ============
    const deckAfter = Object.values(after.col.decks).find((d) => d["name"] === "Source Deck");
    expect(deckAfter).toBeDefined();
    if (!deckAfter) throw new Error("unreachable");
    expect(deckAfter["id"]).toBe(SRC.deckId); // CLEAN: id preserved
    expect(deckAfter["desc"]).toBe("Deck description <b>html</b>"); // CLEAN: desc preserved
    // BUG: deck config reference and custom fields reset
    expect(deckAfter["conf"]).toBe(1); // was 7
    expect(deckAfter["extendNew"]).toBe(0); // was 5
    expect(deckAfter["newLimit"]).toBe(null); // was 40
    expect(deckAfter["deckPluginKey"]).toBeUndefined(); // plugin key dropped

    // ============ COLLECTION ============
    // BUG: crt (creation date, anchor for review due days) replaced by library default
    expect(after.col.crt).toBe(1_681_178_400); // was 1_600_000_000
    // BUG: conf replaced with defaults, plugin key gone
    expect(after.col.conf["confPluginKey"]).toBeUndefined();
    expect(after.col.conf["creationOffset"]).toBe(-120); // was 300
    // BUG: custom deck preset "Hard Preset" (dconf 7) gone entirely
    expect(after.col.dconf["7"]).toBeUndefined();
    // BUG: col.tags dropped
    expect(after.col.tags).toEqual({});
    // graves dropped too (deleted-item tombstones, needed for sync)
    expect(after.graves).toEqual([]);

    // ============ MEDIA ============
    // BUG: all media silently dropped (SrsPackage has no media representation)
    expect(after.mediaManifest).toEqual({});
    expect(after.zipEntries).not.toContain("0");
  });
});
```

## `02-direct.audit.ts`

```ts
/**
 * Direct round-trip audit (no SRS conversion): source.apkg → AnkiPackage → out.apkg
 * Tests the "Plugin Data: Full / Preserved in direct operations" claim and
 * JSON-blob fidelity of the read/write path itself.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";

import { SRC, buildSourceApkg, readApkgRaw } from "./helpers";

describe("Direct Anki → Anki round-trip (no SRS)", () => {
  it("preserves most data but corrupts models JSON (bigint ids, digit-only strings)", async () => {
    const srcPath = await buildSourceApkg();
    const outDir = await mkdtemp(join(tmpdir(), "audit-direct-"));
    const outPath = join(outDir, "direct.apkg");

    const readResult = await AnkiPackage.fromAnkiExport(srcPath);
    expect(readResult.status).toBe("success");
    const pkg = readResult.data;
    if (!pkg) throw new Error("no data");
    await pkg.toAnkiExport(outPath);

    const before = await readApkgRaw(srcPath);
    const after = await readApkgRaw(outPath);

    // ---- CLEAN: tables round-trip untouched
    expect(after.notes).toEqual(before.notes);
    expect(after.cards).toEqual(before.cards);
    expect(after.revlog).toEqual(before.revlog);
    expect(after.graves).toEqual(before.graves);
    expect(after.col.crt).toBe(before.col.crt);
    expect(after.col.mod).toBe(before.col.mod);
    expect(after.col.scm).toBe(before.col.scm);
    expect(after.col.usn).toBe(before.col.usn);
    expect(after.col.ls).toBe(before.col.ls);
    expect(after.col.tags).toEqual(before.col.tags);

    // ---- CLEAN: unknown/plugin keys in conf / decks / dconf survive direct ops
    expect(after.col.conf["confPluginKey"]).toEqual({ nested: true, answer: 42 });
    expect(after.col.decks["100"]?.["deckPluginKey"]).toBe("deck-plugin-value");
    expect(after.col.dconf["7"]?.["dconfPluginKey"]).toBe("dconf-plugin-value");
    expect(after.col.dconf["7"]?.["name"]).toBe("Hard Preset");

    // ---- CLEAN: media survives direct ops
    expect(after.mediaManifest).toEqual(before.mediaManifest);
    expect(after.zipEntries).toContain("0");
    expect(after.zipEntries).toContain("1");

    // ---- BUG: 64-bit template/field ids in models JSON silently lose precision
    console.log("models BEFORE ids:", before.col.modelsRaw.match(/"id":-?\d{15,}/gu));
    console.log("models AFTER  ids:", after.col.modelsRaw.match(/"id":-?\d{15,}/gu));
    // exact original literals no longer present in the output JSON:
    expect(before.col.modelsRaw).toContain(`"id":${SRC.tmpl1Id}`);
    expect(after.col.modelsRaw).not.toContain(`"id":${SRC.tmpl1Id}`);
    expect(before.col.modelsRaw).toContain(`"id":${SRC.tmpl2Id}`);
    expect(after.col.modelsRaw).not.toContain(`"id":${SRC.tmpl2Id}`);
    expect(before.col.modelsRaw).toContain(`"id":${SRC.fld1Id}`);
    expect(after.col.modelsRaw).not.toContain(`"id":${SRC.fld1Id}`);

    // ---- BUG: digit-only string values in models JSON coerced to numbers
    // source: "name":"2024" (string) — output: "name":2024 (number)
    expect(before.col.modelsRaw).toContain(`"name":"2024"`);
    expect(after.col.modelsRaw).toContain(`"name":2024`);

    // ---- BUG?: plugin keys inside a *model* — check
    const vocabAfter = Object.values(after.col.models).find((m) => m["name"] === "Vocab");
    console.log("model addonKey after direct round-trip:", vocabAfter?.["addonKey"]);
    expect(vocabAfter?.["addonKey"]).toBe("addonValue"); // survives (string, not digit-only)
  });
});
```

## `03-unit.audit.ts`

```ts
/**
 * Unit-level audits:
 *  - parseWithBigInts path-prefix bug + digit-string coercion
 *  - SRS-authored package bugs (field order, BasicAndReverseNote, cloze regex,
 *    silent note drop, review id collision)
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";
import {
  BasicAndReverseNote,
  ClozeNote,
  SrsPackage,
  SrsReviewScore,
  createCard,
  createDeck,
  createNote,
  createNoteType,
  createReview,
} from "@/srs-package";
import { parseWithBigInts } from "@/anki/util";

describe("parseWithBigInts on realistic col.models JSON", () => {
  const modelsJson = `{"1650000001000":{"id":1650000001000,"name":"Vocab","tmpls":[{"id":6134417914424963362,"name":"Card 1","ord":0}],"flds":[{"id":-8113853199325282904,"name":"Front","ord":0},{"id":77,"name":"2024","ord":1}]}}`;

  it("never produces BigInt for tmpls[].id / flds[].id (paths are prefixed by the model id key)", () => {
    const parsed = parseWithBigInts(modelsJson, ["tmpls[].id", "flds[].id"]) as Record<
      string,
      { tmpls: { id: unknown }[]; flds: { id: unknown; name: unknown }[] }
    >;
    const model = parsed["1650000001000"];
    if (!model) throw new Error("model missing");

    // BUG: should be 6134417914424963362n — is an imprecise Number instead
    expect(typeof model.tmpls[0]?.id).toBe("number");
    expect(model.tmpls[0]?.id).not.toBe(6_134_417_914_424_963_362n);
    expect(model.tmpls[0]?.id).toBe(6_134_417_914_424_963_000); // precision lost
    expect(typeof model.flds[0]?.id).toBe("number");
    expect(model.flds[0]?.id).toBe(-8_113_853_199_325_283_000); // precision lost

    // BUG: digit-only STRING value coerced to number
    expect(model.flds[1]?.name).toBe(2024);
    expect(typeof model.flds[1]?.name).toBe("number");
  });

  it("works as intended only when the target array is at the JSON root (the shape the unit tests use)", () => {
    const rootShaped = `{"tmpls":[{"id":6134417914424963362}]}`;
    const parsed = parseWithBigInts(rootShaped, ["tmpls[].id"]) as {
      tmpls: { id: unknown }[];
    };
    expect(typeof parsed.tmpls[0]?.id).toBe("bigint"); // fine at root — the real data is never root-shaped
  });
});

describe("SRS-authored package pitfalls", () => {
  it("writes field values by POSITION, ignoring the names in fieldValues (silent content swap)", async () => {
    const srs = new SrsPackage();
    const deck = createDeck({ name: "D" });
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
    // createNote validates names as a SET — order [Back, Front] accepted
    const note = createNote(
      {
        deckId: deck.id,
        fieldValues: [
          ["Back", "back-value"],
          ["Front", "front-value"],
        ],
        noteTypeId: noteType.id,
      },
      noteType,
    );
    srs.addDeck(deck);
    srs.addNoteType(noteType);
    srs.addNote(note);
    srs.addCard(createCard({ noteId: note.id, templateId: 0 }));

    const result = await AnkiPackage.fromSrsPackage(srs);
    expect(result.status).toBe("success");
    const flds = result.data?.getNotes()[0]?.flds;
    console.log("flds written:", JSON.stringify(flds));
    // BUG: "Front" field now contains "back-value"
    expect(flds).toBe("back-valuefront-value");
  });

  it("ships BasicAndReverseNote with two IDENTICAL templates (reverse card is not reversed)", () => {
    const [t1, t2] = BasicAndReverseNote.templates;
    expect(t2?.name).toBe("Back > Front");
    // BUG: the "reverse" template asks Front and answers Back, same as template 1
    expect(t2?.questionTemplate).toBe(t1?.questionTemplate);
    expect(t2?.answerTemplate).toBe(t1?.answerTemplate);
  });

  it("silently generates ZERO cards for cloze content containing '}' (e.g. MathJax)", async () => {
    const srs = new SrsPackage();
    const deck = createDeck({ name: "D" });
    srs.addDeck(deck);
    srs.addNoteType(ClozeNote);
    const note = createNote(
      {
        deckId: deck.id,
        fieldValues: [["Text", "The formula is {{c1::\\(x^{2}\\)}}"]],
        noteTypeId: ClozeNote.id,
      },
      ClozeNote,
    );
    srs.addNote(note);
    srs.addCard(createCard({ noteId: note.id, templateId: 0 }));

    const result = await AnkiPackage.fromSrsPackage(srs);
    console.log("status:", result.status, "issues:", JSON.stringify(result.issues));
    expect(result.status).toBe("success"); // no issue reported
    // BUG: Anki's own cloze regex ({{c\d+::(.*?)}}) matches this; the library's does not
    expect(result.data?.getCards().length).toBe(0);
    // the note itself survives as an orphan with zero cards (invisible in Anki)
    expect(result.data?.getNotes().length).toBe(1);
  });

  it("silently drops notes that have no cards (removeUnused) with status success", async () => {
    const srs = new SrsPackage();
    const deck = createDeck({ name: "D" });
    const noteType = createNoteType({
      fields: [{ id: 0, name: "Front" }],
      name: "T",
      templates: [{ answerTemplate: "x", id: 0, name: "Card 1", questionTemplate: "{{Front}}" }],
    });
    srs.addDeck(deck);
    srs.addNoteType(noteType);
    const note1 = createNote(
      { deckId: deck.id, fieldValues: [["Front", "kept"]], noteTypeId: noteType.id },
      noteType,
    );
    const note2 = createNote(
      { deckId: deck.id, fieldValues: [["Front", "LOST"]], noteTypeId: noteType.id },
      noteType,
    );
    srs.addNote(note1);
    srs.addNote(note2);
    srs.addCard(createCard({ noteId: note1.id, templateId: 0 })); // only note1 has a card

    const result = await AnkiPackage.fromSrsPackage(srs);
    expect(result.status).toBe("success");
    expect(result.issues).toEqual([]);
    // BUG: note2 gone without any issue
    expect(result.data?.getNotes().length).toBe(1);
    expect(result.data?.getNotes()[0]?.flds).toBe("kept");
  });

  it("two reviews in the same millisecond → PRIMARY KEY collision at export time", async () => {
    const srs = new SrsPackage();
    const deck = createDeck({ name: "D" });
    const noteType = createNoteType({
      fields: [{ id: 0, name: "Front" }],
      name: "T",
      templates: [{ answerTemplate: "x", id: 0, name: "Card 1", questionTemplate: "{{Front}}" }],
    });
    srs.addDeck(deck);
    srs.addNoteType(noteType);
    const note = createNote(
      { deckId: deck.id, fieldValues: [["Front", "f"]], noteTypeId: noteType.id },
      noteType,
    );
    srs.addNote(note);
    const card1 = createCard({ noteId: note.id, templateId: 0 });
    srs.addCard(card1);
    const ts = 1_650_000_040_000;
    srs.addReview(createReview({ cardId: card1.id, score: SrsReviewScore.Normal, timestamp: ts }));
    srs.addReview(createReview({ cardId: card1.id, score: SrsReviewScore.Easy, timestamp: ts }));

    const result = await AnkiPackage.fromSrsPackage(srs);
    console.log("conversion status:", result.status, "issues:", result.issues.length);
    expect(result.status).toBe("success"); // conversion itself reports success
    const reviews = result.data?.getReviews() ?? [];
    console.log(
      "review ids:",
      reviews.map((r) => r.id),
    );

    const outDir = await mkdtemp(join(tmpdir(), "audit-rev-"));
    const outPath = join(outDir, "dupe-reviews.apkg");
    // export throws (or silently drops) — capture behavior
    let threw: unknown = null;
    try {
      await result.data?.toAnkiExport(outPath);
    } catch (error) {
      threw = error;
    }
    console.log("export threw:", String(threw));
    expect(threw).not.toBeNull();
  });

  it("Anki → SRS silently drops empty decks and card-less notes with status success", async () => {
    // build via public API: default package + extra deck with no notes
    const pkgResult = await AnkiPackage.fromDefault();
    const pkg = pkgResult.data;
    if (!pkg) throw new Error("no pkg");
    pkg.addDeck({
      browserCollapsed: true,
      collapsed: true,
      conf: 1,
      desc: "will vanish",
      dyn: 0,
      extendNew: 0,
      extendRev: 0,
      id: 555,
      lrnToday: [0, 0],
      mod: 0,
      name: "Empty Deck",
      newLimit: null,
      newLimitToday: null,
      newToday: [0, 0],
      revToday: [0, 0],
      reviewLimit: null,
      reviewLimitToday: null,
      timeToday: [0, 0],
      usn: 0,
    });
    const srsResult = pkg.toSrsPackage();
    expect(srsResult.status).toBe("success");
    expect(srsResult.issues).toEqual([]);
    // BUG: both the Default deck and "Empty Deck" are gone — no warning
    expect(srsResult.data?.getDecks().length).toBe(0);
  });
});
```

## `04-fixture.audit.ts`

```ts
/**
 * Direct round-trip of the repo's real Anki export fixture (mixed-legacy-2.apkg),
 * diffing raw table contents. Surfaces anything the synthetic package missed.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "@/anki/anki-package";

import { readApkgRaw } from "./helpers";

const FIXTURE = "/home/eiko/repos/srs-converter/tests/fixtures/anki/mixed-legacy-2.apkg";

function diffObjects(
  label: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const b = JSON.stringify(before[key]);
    const a = JSON.stringify(after[key]);
    if (b !== a) {
      diffs.push(`${label}.${key}: ${b ?? "<missing>"} -> ${a ?? "<missing>"}`);
    }
  }
  return diffs;
}

describe("Real fixture direct round-trip", () => {
  it("diffs mixed-legacy-2.apkg against its direct re-export", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "audit-fixture-"));
    const outPath = join(outDir, "mixed-direct.apkg");

    const readResult = await AnkiPackage.fromAnkiExport(FIXTURE);
    console.log("read status:", readResult.status);
    console.log("read issues:", JSON.stringify(readResult.issues, null, 2));
    const pkg = readResult.data;
    if (!pkg) throw new Error("no data");
    await pkg.toAnkiExport(outPath);

    const before = await readApkgRaw(FIXTURE);
    const after = await readApkgRaw(outPath);

    const allDiffs: string[] = [];

    // tables
    for (const table of ["notes", "cards", "revlog", "graves"] as const) {
      const b = before[table];
      const a = after[table];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        allDiffs.push(`${table}: length ${b.length.toString()} -> ${a.length.toString()}`);
        for (let i = 0; i < Math.max(b.length, a.length); i++) {
          const diffs = diffObjects(
            `${table}[${i.toString()}]`,
            (b[i] ?? {}) as Record<string, unknown>,
            (a[i] ?? {}) as Record<string, unknown>,
          );
          allDiffs.push(...diffs);
        }
      }
    }

    // col scalar fields
    for (const key of ["id", "crt", "mod", "scm", "ver", "dty", "usn", "ls"] as const) {
      if (before.col[key] !== after.col[key]) {
        allDiffs.push(`col.${key}: ${String(before.col[key])} -> ${String(after.col[key])}`);
      }
    }

    // col JSON blobs (semantic diff)
    allDiffs.push(...diffObjects("conf", before.col.conf, after.col.conf));
    allDiffs.push(...diffObjects("tags", before.col.tags, after.col.tags));
    for (const [id, deck] of Object.entries(before.col.decks)) {
      allDiffs.push(...diffObjects(`decks.${id}`, deck, after.col.decks[id] ?? {}));
    }
    for (const [id, dc] of Object.entries(before.col.dconf)) {
      allDiffs.push(...diffObjects(`dconf.${id}`, dc, after.col.dconf[id] ?? {}));
    }
    for (const [id, model] of Object.entries(before.col.models)) {
      allDiffs.push(...diffObjects(`models.${id}`, model, after.col.models[id] ?? {}));
    }
    // models raw string comparison for bigint ids
    const beforeIds = before.col.modelsRaw.match(/"id":\s?-?\d{16,}/gu) ?? [];
    const afterIds = after.col.modelsRaw.match(/"id":\s?-?\d{16,}/gu) ?? [];
    console.log("large ids before:", beforeIds);
    console.log("large ids after:", afterIds);

    // media
    if (JSON.stringify(before.mediaManifest) !== JSON.stringify(after.mediaManifest)) {
      allDiffs.push(
        `media: ${JSON.stringify(before.mediaManifest)} -> ${JSON.stringify(after.mediaManifest)}`,
      );
    }

    console.log("=== DIFFS ===");
    for (const d of allDiffs) console.log(d);
    console.log("=== TOTAL DIFFS:", allDiffs.length, "===");

    // also: what does toSrsPackage say about this real package?
    const srsResult = pkg.toSrsPackage();
    console.log(
      "toSrsPackage status:",
      srsResult.status,
      "decks:",
      srsResult.data?.getDecks().length,
      "notes:",
      srsResult.data?.getNotes().length,
      "cards:",
      srsResult.data?.getCards().length,
      "reviews:",
      srsResult.data?.getReviews().length,
      "issues:",
      JSON.stringify(srsResult.issues),
    );
    console.log(
      "decks in anki pkg:",
      pkg.getDecks().map((d) => d.name),
    );
    console.log(
      "notes in anki pkg:",
      pkg.getNotes().length,
      "cards:",
      pkg.getCards().length,
      "reviews:",
      pkg.getReviews().length,
    );
    expect(true).toBe(true);
  });
});
```

## `05-numeric-name.audit.ts`

```ts
/**
 * A note type legitimately named "007" (valid in Anki) gets its name coerced
 * to the number 7 by parseWithBigInts' digit-string coercion, which then
 * fails validateNoteTypeEntry — dropping the note type AND all of its notes,
 * cards, and reviews.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import InitSqlJs from "sql.js";

import { AnkiPackage } from "@/anki/anki-package";

import { createZip, validMetaV2 } from "./helpers";
import { Buffer } from "node:buffer";

async function buildApkgWithModelName(name: string): Promise<string> {
  const SQL = await InitSqlJs();
  const db = new SQL.Database();
  db.run(`
CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL);
`);
  const mid = 1_650_000_001_000;
  const models = {
    [mid.toString()]: {
      id: mid,
      name, // <- digit-only string
      type: 0,
      mod: 0,
      usn: 0,
      sortf: 0,
      did: 1,
      tmpls: [
        {
          id: 1,
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}",
          afmt: "{{Back}}",
          bqfmt: "",
          bafmt: "",
          did: null,
          bfont: "",
          bsize: 0,
        },
      ],
      flds: [
        {
          id: 2,
          name: "Front",
          ord: 0,
          sticky: false,
          rtl: false,
          font: "Arial",
          size: 20,
          description: "",
          plainText: false,
          collapsed: false,
          excludeFromSearch: false,
          tag: null,
          preventDeletion: false,
        },
        {
          id: 3,
          name: "Back",
          ord: 1,
          sticky: false,
          rtl: false,
          font: "Arial",
          size: 20,
          description: "",
          plainText: false,
          collapsed: false,
          excludeFromSearch: false,
          tag: null,
          preventDeletion: false,
        },
      ],
      css: "",
      latexPre: "",
      latexPost: "",
      latexsvg: false,
      req: [[0, "any", [0]]],
      originalStockKind: null,
    },
  };
  const decks = {
    "1": {
      id: 1,
      mod: 0,
      name: "Default",
      usn: 0,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: true,
      browserCollapsed: true,
      desc: "",
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
      reviewLimit: null,
      newLimit: null,
      reviewLimitToday: null,
      newLimitToday: null,
    },
  };
  db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    1,
    1_600_000_000,
    0,
    0,
    11,
    0,
    0,
    0,
    "{}",
    JSON.stringify(models),
    JSON.stringify(decks),
    "{}",
    "{}",
  ]);
  db.run("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
    1_650_000_010_000,
    "someguid01",
    mid,
    0,
    0,
    "",
    "f1f2",
    "f1",
    0,
    0,
    "",
  ]);
  db.run("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    1_650_000_020_000,
    1_650_000_010_000,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    "",
  ]);

  const dir = await mkdtemp(join(tmpdir(), "audit-name-"));
  const apkgPath = join(dir, "numeric-name.apkg");
  await createZip(apkgPath, [
    { name: "collection.anki21", content: Buffer.from(db.export()) },
    { name: "meta", content: validMetaV2 },
    { name: "media", content: "{}" },
  ]);
  db.close();
  return apkgPath;
}

describe("digit-only note type name", () => {
  it("drops a note type named '007' plus all of its notes and cards", async () => {
    const apkgPath = await buildApkgWithModelName("007");
    const result = await AnkiPackage.fromAnkiExport(apkgPath);
    console.log("status:", result.status);
    console.log(
      "issues:",
      JSON.stringify(
        result.issues.map((i) => i.message),
        null,
        2,
      ),
    );
    // best-effort mode: partial, note type/note/card all discarded
    expect(result.status).toBe("partial");
    expect(result.data?.getNoteTypes().length).toBe(0);
    expect(result.data?.getNotes().length).toBe(0);
    expect(result.data?.getCards().length).toBe(0);
  });

  it("keeps a note type named 'Basic 2' (control: non-digit name is fine)", async () => {
    const apkgPath = await buildApkgWithModelName("Basic 2");
    const result = await AnkiPackage.fromAnkiExport(apkgPath);
    expect(result.status).toBe("success");
    expect(result.data?.getNoteTypes().length).toBe(1);
    expect(result.data?.getNotes().length).toBe(1);
  });
});
```
