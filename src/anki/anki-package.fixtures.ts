import { Buffer } from "node:buffer";
import { createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import archiver from "archiver";
import { Open } from "unzipper";
import { afterEach, beforeEach, expect } from "vitest";

import type { ConversionResult } from "@/error-handling";
import type { SrsNoteTemplate, SrsNoteType } from "@/srs-package";
import { SrsPackage, createCard, createDeck, createNote, createNoteType } from "@/srs-package";

import type { CardsTable, Ease, NotesTable, RevlogTable } from "./types";
import { guid64, joinAnkiFields } from "./util";

// #region Helpers - Constants

// Valid meta file for version 2 (Legacy_V2)
// Protobuf encoding: field 1 (varint) with value 2 = [0x08, 0x02]
export const validMetaV2 = Buffer.from([0x08, 0x02]);

// #endregion Helpers - Constants

//#region Helpers - Test Results

export function expectSuccess<T>(result: ConversionResult<T>): T {
  expect(result.status).toBe("success");
  expect(result.data).toBeDefined();
  if (!result.data) {
    throw new Error("Expected data to be defined");
  }
  return result.data;
}

export function expectPartial<T>(result: ConversionResult<T>): T {
  expect(result.status).toBe("partial");
  expect(result.data).toBeDefined();
  expect(result.issues.length).toBeGreaterThan(0);
  if (!result.data) {
    throw new Error("Expected data to be defined");
  }
  return result.data;
}

export function expectFailure<T>(result: ConversionResult<T>): ConversionResult<T> {
  expect(result.status).toBe("failure");
  expect(result.data).toBeUndefined();
  expect(result.issues.length).toBeGreaterThan(0);
  return result;
}

//#endregion Helpers - Test Results

//#region Helpers - Basic Entities

// Helper function to create an Anki note (NotesTable) for testing
// Returns NotesTable with id guaranteed to be a number (not null)
export function createTestAnkiNote(
  options: {
    id?: number;
    noteTypeId: bigint | number;
    fields: string[];
    tags?: string[];
    guid?: string;
  },
  getTimestamp?: () => number,
): NotesTable & { id: number } {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const id = options.id ?? (getTimestamp ? getTimestamp() : now);
  return {
    csum: 0,
    data: "",
    flags: 0,
    flds: joinAnkiFields(options.fields),
    guid: options.guid ?? guid64(),
    id,
    mid: typeof options.noteTypeId === "bigint" ? Number(options.noteTypeId) : options.noteTypeId,
    mod: nowSeconds,
    sfld: options.fields[0] ?? "",
    tags: (options.tags ?? []).join(" "),
    usn: -1,
  };
}

// Helper function to create an Anki card (CardsTable) for testing
// Returns CardsTable with id guaranteed to be a number (not null)
export function createTestAnkiCard(
  options: {
    id?: number;
    noteId: number;
    deckId: number;
    templateIndex?: number;
    type?: number;
    queue?: number;
    due?: number;
    interval?: number;
    factor?: number;
    reps?: number;
    lapses?: number;
  },
  getTimestamp?: () => number,
): CardsTable & { id: number } {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  return {
    data: "",
    did: options.deckId,
    due: options.due ?? 1,
    factor: options.factor ?? 2500,
    flags: 0,
    id: options.id ?? (getTimestamp ? getTimestamp() : now),
    ivl: options.interval ?? 0,
    lapses: options.lapses ?? 0,
    left: 1001,
    mod: nowSeconds,
    nid: options.noteId,
    odid: 0,
    odue: 0,
    ord: options.templateIndex ?? 0,
    queue: options.queue ?? 0,
    reps: options.reps ?? 0,
    type: options.type ?? 0,
    usn: -1,
  };
}

// Helper function to create an Anki review (RevlogTable) for testing
// Returns RevlogTable with id guaranteed to be a number (not null)
export function createTestAnkiReview(
  options: {
    id?: number;
    cardId: number;
    ease: Ease;
    interval?: number;
    lastInterval?: number;
    factor?: number;
    time?: number;
    type?: number;
  },
  getTimestamp?: () => number,
): RevlogTable & { id: number } {
  const now = Date.now();
  return {
    cid: options.cardId,
    ease: options.ease,
    factor: options.factor ?? 2500,
    id: options.id ?? (getTimestamp ? getTimestamp() : now),
    ivl: options.interval ?? 0,
    lastIvl: options.lastInterval ?? 0,
    time: options.time ?? 5000,
    type: options.type ?? 0,
    usn: -1,
  };
}

export function createBasicTemplate(id = 0, name = "Card 1"): SrsNoteTemplate {
  return {
    answerTemplate: "{{Back}}",
    id,
    name,
    questionTemplate: "{{Front}}",
  };
}

export function createBasicNoteType(name = "Basic"): SrsNoteType {
  return createNoteType({
    fields: [
      { id: 0, name: "Front" },
      { id: 1, name: "Back" },
    ],
    name,
    templates: [createBasicTemplate()],
  });
}

export function createBasicSrsPackage(
  options: {
    deckName?: string;
    deckDescription?: string;
    noteTypeName?: string;
    frontValue?: string;
    backValue?: string;
  } = {},
): {
  srsPackage: SrsPackage;
  deck: ReturnType<typeof createDeck>;
  noteType: SrsNoteType;
  note: ReturnType<typeof createNote>;
  card: ReturnType<typeof createCard>;
} {
  const {
    deckName = "Test Deck",
    deckDescription = "A test deck",
    noteTypeName = "Basic",
    frontValue = "Question",
    backValue = "Answer",
  } = options;

  const srsPackage = new SrsPackage();
  const deck = createDeck({ description: deckDescription, name: deckName });
  const noteType = createBasicNoteType(noteTypeName);
  const note = createNote(
    {
      deckId: deck.id,
      fieldValues: [
        ["Front", frontValue],
        ["Back", backValue],
      ],
      noteTypeId: noteType.id,
    },
    noteType,
  );
  const card = createCard({
    noteId: note.id,
    templateId: 0,
  });

  srsPackage.addDeck(deck);
  srsPackage.addNoteType(noteType);
  srsPackage.addNote(note);
  srsPackage.addCard(card);

  return { card, deck, note, noteType, srsPackage };
}

export function createMultiCardPackage(noteCount = 10): SrsPackage {
  const { srsPackage, deck, noteType } = createBasicSrsPackage();

  for (let i = 1; i < noteCount; i++) {
    const note = createNote(
      {
        deckId: deck.id,
        fieldValues: [
          ["Front", `Question ${(i + 1).toString()}`],
          ["Back", `Answer ${(i + 1).toString()}`],
        ],
        noteTypeId: noteType.id,
      },
      noteType,
    );

    const card = createCard({
      noteId: note.id,
      templateId: 0,
    });

    srsPackage.addNote(note);
    srsPackage.addCard(card);
  }

  return srsPackage;
}

// #endregion Helpers - Basic Entities

// #region Helpers - Utilities

// Helper function to create a ZIP file with specific contents for testing
export function createTestZip(
  zipPath: string,
  files: { name: string; content: string | Buffer }[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip");

    output.on("close", () => {
      resolve();
    });
    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);
    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }
    void archive.finalize();
  });
}

// Helper to get a valid Anki database buffer from the fixture (cached)
let cachedValidDb: Buffer | null = null;
export async function getValidAnkiDatabaseBuffer(): Promise<Buffer> {
  if (cachedValidDb) {
    return cachedValidDb;
  }
  const zip = await Open.file("./tests/fixtures/anki/empty-legacy-2.apkg");
  const dbEntry = zip.files.find((f) => f.path === "collection.anki21");
  if (!dbEntry) {
    throw new Error("Database not found in fixture");
  }
  cachedValidDb = await dbEntry.buffer();
  return cachedValidDb;
}

// Helper for creating unique timestamps in tests (Anki uses timestamps as IDs)
export function createTimestampGenerator() {
  let nextTimestamp = Date.now();
  return (hoursAgo?: number) => {
    nextTimestamp += 1;
    return nextTimestamp - (hoursAgo ? hoursAgo * 3_600_000 : 0);
  };
}

// #endregion Helpers - Utilities

// #region Helpers - Test Setup

export let tempDir: string;

export function setupTempDir() {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "anki-test-"));
  });

  afterEach(async () => {
    // Cleanup will be handled by individual tests for AnkiPackage instances
  });
}

// Helper function to get tempDir for tests
export function getTempDir(): string {
  return tempDir;
}

// #endregion Helpers - Test Setup

// #region Helpers - Database Creation

// Helper function to create a valid SQLite database for testing partial recovery
export async function createAnkiDatabaseWithData(options: {
  models?: Record<string, unknown>;
  decks?: Record<string, unknown>;
  notes?: {
    id: number;
    guid: string;
    mid: number;
    flds: string;
  }[];
  cards?: {
    id: number;
    nid: number;
    did: number;
  }[];
  reviews?: {
    id: number;
    cid: number;
  }[];
}): Promise<Buffer> {
  const sqlJsModule = await import("sql.js");
  const InitSqlJs = sqlJsModule.default;
  const SQL = await InitSqlJs();
  const db = new SQL.Database();

  // Create required Anki tables
  db.run(`
    CREATE TABLE col (
      id INTEGER PRIMARY KEY,
      crt INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      scm INTEGER NOT NULL,
      ver INTEGER NOT NULL,
      dty INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      ls INTEGER NOT NULL,
      conf TEXT NOT NULL,
      models TEXT NOT NULL,
      decks TEXT NOT NULL,
      dconf TEXT NOT NULL,
      tags TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      guid TEXT NOT NULL,
      mid INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      tags TEXT NOT NULL,
      flds TEXT NOT NULL,
      sfld TEXT NOT NULL,
      csum INTEGER NOT NULL,
      flags INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY,
      nid INTEGER NOT NULL,
      did INTEGER NOT NULL,
      ord INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      type INTEGER NOT NULL,
      queue INTEGER NOT NULL,
      due INTEGER NOT NULL,
      ivl INTEGER NOT NULL,
      factor INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      left INTEGER NOT NULL,
      odue INTEGER NOT NULL,
      odid INTEGER NOT NULL,
      flags INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE revlog (
      id INTEGER PRIMARY KEY,
      cid INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      ease INTEGER NOT NULL,
      ivl INTEGER NOT NULL,
      lastIvl INTEGER NOT NULL,
      factor INTEGER NOT NULL,
      time INTEGER NOT NULL,
      type INTEGER NOT NULL
    )
  `);
  db.run("CREATE TABLE graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL)");

  const now = Date.now();

  // Default model (note type) - needed for notes to be valid
  const defaultModels = options.models ?? {
    "1234567890123": {
      css: "",
      did: null,
      flds: [
        {
          collapsed: false,
          description: "",
          excludeFromSearch: false,
          font: "Arial",
          name: "Front",
          ord: 0,
          plainText: false,
          preventDeletion: false,
          rtl: false,
          size: 20,
          sticky: false,
          tag: null,
        },
        {
          collapsed: false,
          description: "",
          excludeFromSearch: false,
          font: "Arial",
          name: "Back",
          ord: 1,
          plainText: false,
          preventDeletion: false,
          rtl: false,
          size: 20,
          sticky: false,
          tag: null,
        },
      ],
      id: 1_234_567_890_123,
      latexPost: "",
      latexPre: "",
      latexsvg: false,
      mod: Math.floor(now / 1000),
      name: "Basic",
      originalStockKind: null,
      req: [],
      sortf: 0,
      tmpls: [
        {
          afmt: "{{Back}}",
          bafmt: "",
          bfont: "",
          bqfmt: "",
          bsize: 0,
          did: null,
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}",
        },
      ],
      type: 0,
      usn: -1,
    },
  };

  const defaultDecks = options.decks ?? {
    "1": {
      browserCollapsed: false,
      collapsed: false,
      conf: 1,
      desc: "",
      dyn: 0,
      extendNew: 0,
      extendRev: 0,
      id: 1,
      lrnToday: [0, 0],
      mod: Math.floor(now / 1000),
      name: "Default",
      newLimit: null,
      newLimitToday: null,
      newToday: [0, 0],
      revToday: [0, 0],
      reviewLimit: null,
      reviewLimitToday: null,
      timeToday: [0, 0],
      usn: -1,
    },
  };

  const defaultConf = {
    activeDecks: [1],
    addToCur: true,
    collapseTime: 1200,
    creationOffset: 0,
    curDeck: 1,
    curModel: 1_234_567_890_123,
    dayLearnFirst: false,
    dueCounts: true,
    estTimes: true,
    newSpread: 0,
    nextPos: 1,
    sched2021: true,
    schedVer: 2,
    sortBackwards: false,
    sortType: "noteFld",
    timeLim: 0,
  };

  const defaultDconf = {
    "1": {
      answerAction: 0,
      autoplay: true,
      buryInterdayLearning: false,
      desiredRetention: 0.9,
      dyn: false,
      fsrsWeights: [],
      id: 1,
      ignoreRevlogsBeforeDate: "",
      interdayLearningMix: 0,
      lapse: {
        delays: [10],
        leechAction: 0,
        leechFails: 8,
        minInt: 1,
        mult: 0,
      },
      maxTaken: 60,
      mod: 0,
      name: "Default",
      new: {
        bury: false,
        delays: [1, 10],
        initialFactor: 2500,
        ints: [1, 4, 0],
        order: 1,
        perDay: 20,
      },
      newGatherPriority: 0,
      newMix: 0,
      newPerDayMinimum: 0,
      newSortOrder: 0,
      questionAction: 0,
      replayq: true,
      rev: {
        bury: false,
        ease4: 1.3,
        hardFactor: 1.2,
        ivlFct: 1,
        maxIvl: 36_500,
        perDay: 200,
      },
      reviewOrder: 0,
      secondsToShowAnswer: 0,
      secondsToShowQuestion: 0,
      sm2Retention: 0.9,
      stopTimerOnAnswer: false,
      timer: 0,
      usn: 0,
      waitForAudio: true,
      weightSearch: "",
    },
  };

  db.run("INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    1,
    Math.floor(now / 1000),
    now,
    now,
    11,
    0,
    -1,
    0,
    JSON.stringify(defaultConf),
    JSON.stringify(defaultModels),
    JSON.stringify(defaultDecks),
    JSON.stringify(defaultDconf),
    "{}",
  ]);

  // Insert notes
  if (options.notes) {
    for (const note of options.notes) {
      db.run("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        note.id,
        note.guid,
        note.mid,
        Math.floor(now / 1000),
        -1,
        "",
        note.flds,
        note.flds.split("\u001F")[0] ?? "",
        0,
        0,
        "",
      ]);
    }
  }

  // Insert cards
  if (options.cards) {
    for (const card of options.cards) {
      db.run("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        card.id,
        card.nid,
        card.did,
        0,
        Math.floor(now / 1000),
        -1,
        0,
        0,
        0,
        0,
        2500,
        0,
        0,
        0,
        0,
        0,
        0,
        "",
      ]);
    }
  }

  // Insert reviews
  if (options.reviews) {
    for (const review of options.reviews) {
      db.run("INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        review.id,
        review.cid,
        -1,
        3,
        1,
        0,
        2500,
        5000,
        0,
      ]);
    }
  }

  return Buffer.from(db.export());
}

// #endregion Helpers - Database Creation
