/**
 * Adversarial round-trip fixture builder (WP2).
 *
 * Ported from the 2026-07-10 round-trip audit repro harness. Hand-builds a single-deck
 * legacy-v2 `.apkg` with full control over every column so a full
 * Anki → SRS → Anki round-trip can be checked for silent data loss, and reads
 * the raw DB/zip contents back out without going through the library (ground
 * truth for diffing).
 *
 * The note field strings are assembled with {@link joinAnkiFields} so the
 * invisible U+001F field separator is produced from an escape rather than a
 * literal byte.
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

import { joinAnkiFields } from "./util";

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

// Models JSON is written as a raw string so we control the exact number literals.
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

// Note A: first field carries HTML; original sfld ("front HTML") is deliberately
// inconsistent with the model's sortf (1) so recomputation is observable.
export const NOTE_A_FLDS = joinAnkiFields(["front<br>HTML", "back value", "third field"]);
// Note B: cloze with MathJax braces in c1 (the `}` inside `x^{2}` is what the old
// regex could not match).
export const NOTE_B_FLDS = joinAnkiFields([
  String.raw`The formula is {{c1::\(x^{2}\)}} and {{c2::simple}}`,
  "extra info",
]);

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
  // Card B1: cloze ord 0 (the MathJax cloze), review card in a filtered deck state (odid/odue set)
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

  // Reviews (all on card A1/A2 so the buggy cloze-card drop stays isolated)
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

// Builds the adversarial source .apkg and returns its path.
export async function buildSourceApkg(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "roundtrip-src-"));
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
  /** Media file bytes keyed by their manifest filename. */
  mediaByName: Record<string, Buffer>;
}

// Ground-truth reader: opens an .apkg with unzipper + sql.js directly.
export async function readApkgRaw(apkgPath: string): Promise<RawDump> {
  const zip = await Open.file(apkgPath);
  const zipEntries = zip.files.map((f) => f.path).sort();
  const dbEntry = zip.files.find((f) => f.path === "collection.anki21");
  if (!dbEntry) {
    throw new Error("collection.anki21 missing");
  }
  const mediaEntry = zip.files.find((f) => f.path === "media");
  const mediaBuffer = mediaEntry ? await mediaEntry.buffer() : undefined;
  const mediaManifest = mediaBuffer
    ? (JSON.parse(mediaBuffer.toString() || "{}") as Record<string, string>)
    : {};

  // Read each numbered media entry back out and key it by its manifest filename
  // so tests can assert byte-for-byte content.
  const mediaByName: Record<string, Buffer> = {};
  for (const [mediaId, filename] of Object.entries(mediaManifest)) {
    const entry = zip.files.find((f) => f.path === mediaId);
    if (entry) {
      mediaByName[filename] = await entry.buffer();
    }
  }

  const SQL = await InitSqlJs();
  const db = new SQL.Database(await dbEntry.buffer());

  const rows = (sql: string): Record<string, unknown>[] => {
    const res = db.exec(sql);
    if (res.length === 0 || !res[0]) {
      return [];
    }
    const { columns, values } = res[0];
    return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i] ?? "", v])));
  };

  const colRow = rows("SELECT * FROM col")[0];
  if (!colRow) {
    throw new Error("col row missing");
  }
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
    mediaByName,
  };
  db.close();
  return dump;
}
