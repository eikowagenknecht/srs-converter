import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnkiDatabase } from "./database.js";

describe("anki db test", () => {
  let db: AnkiDatabase;

  async function saveDatabase(db: AnkiDatabase, filepath: string) {
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, db.toBuffer());
  }

  beforeEach(async () => {
    db = await AnkiDatabase.fromDefault();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create and save a default db to the filesystem", async () => {
    await saveDatabase(db, "./out/default.anki.db");
  });

  it("should contain the default collection in the default db", async () => {
    const defaultCollection = await db.getCollection();

    expect(defaultCollection.id).toStrictEqual(1);
    expect(defaultCollection.crt).toStrictEqual(1681178400);
    expect(defaultCollection.mod).toStrictEqual(1731670964300);
    expect(defaultCollection.scm).toStrictEqual(1731670964297);
    expect(defaultCollection.ver).toStrictEqual(11);
    expect(defaultCollection.dty).toStrictEqual(0);
    expect(defaultCollection.usn).toStrictEqual(0);
    expect(defaultCollection.ls).toStrictEqual(0);
    expect(defaultCollection.conf).toEqual({
      sortBackwards: false,
      dayLearnFirst: false,
      curDeck: 1,
      schedVer: 2,
      estTimes: true,
      nextPos: 1,
      collapseTime: 1200,
      sched2021: true,
      activeDecks: [1],
      dueCounts: true,
      sortType: "noteFld",
      curModel: 1731670964298,
      addToCur: true,
      timeLim: 0,
      newSpread: 0,
      creationOffset: -120,
    });
    expect(defaultCollection.models).toEqual({});
    expect(defaultCollection.decks).toEqual({
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
    });
    expect(defaultCollection.dconf).toEqual({
      "1": {
        id: 1,
        mod: 0,
        name: "Default",
        usn: 0,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: {
          bury: false,
          delays: [1.0, 10.0],
          initialFactor: 2500,
          ints: [1, 4, 0],
          order: 1,
          perDay: 20,
        },
        rev: {
          bury: false,
          ease4: 1.3,
          ivlFct: 1.0,
          maxIvl: 36500,
          perDay: 200,
          hardFactor: 1.2,
        },
        lapse: {
          delays: [10.0],
          leechAction: 1,
          leechFails: 8,
          minInt: 1,
          mult: 0.0,
        },
        dyn: false,
        newMix: 0,
        newPerDayMinimum: 0,
        interdayLearningMix: 0,
        reviewOrder: 0,
        newSortOrder: 0,
        newGatherPriority: 0,
        buryInterdayLearning: false,
        fsrsWeights: [],
        desiredRetention: 0.9,
        ignoreRevlogsBeforeDate: "",
        stopTimerOnAnswer: false,
        secondsToShowQuestion: 0.0,
        secondsToShowAnswer: 0.0,
        questionAction: 0,
        answerAction: 0,
        waitForAudio: true,
        sm2Retention: 0.9,
        weightSearch: "",
      },
    });
    expect(defaultCollection.tags).toEqual({});
  });

  it("should export database to buffer via toBuffer()", () => {
    const buffer = db.toBuffer();
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("should add note via addNote()", async () => {
    const noteData = {
      id: Date.now(), // Unix timestamp in milliseconds as per Anki spec
      guid: "test-guid-123",
      mid: 1,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      tags: "",
      flds: "Front Field\u001fBack Field",
      sfld: "Front Field",
      csum: 123456,
      flags: 0,
      data: "",
    };

    const addedNote = await db.addNote(noteData);
    expect(addedNote).toBeDefined();
    expect(addedNote.id).toBeDefined();
    expect(addedNote.guid).toBe(noteData.guid);
    expect(addedNote.flds).toBe(noteData.flds);
    expect(addedNote.mid).toBe(noteData.mid);
  });

  it("should add card via addCard()", async () => {
    const cardData = {
      id: Date.now(), // Unix timestamp in milliseconds as per Anki spec
      nid: 1,
      did: 1,
      ord: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      type: 0,
      queue: 0,
      due: 1,
      ivl: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
      left: 0,
      odue: 0,
      odid: 0,
      flags: 0,
      data: "",
    };

    const addedCard = await db.addCard(cardData);
    expect(addedCard).toBeDefined();
    expect(addedCard.id).toBeDefined();
    expect(addedCard.nid).toBe(cardData.nid);
    expect(addedCard.ord).toBe(cardData.ord);
    expect(addedCard.did).toBe(cardData.did);
  });

  it("should add revlog via addRevlog()", async () => {
    const revlogData = {
      id: Date.now(), // Unix timestamp in milliseconds as per Anki spec
      cid: 1,
      usn: 0,
      ease: 2,
      ivl: 1,
      lastIvl: 0,
      factor: 2500,
      time: 3000,
      type: 0,
    };

    const addedRevlog = await db.addRevlog(revlogData);
    expect(addedRevlog).toBeDefined();
    expect(addedRevlog.id).toBeDefined();
    expect(addedRevlog.cid).toBe(revlogData.cid);
    expect(addedRevlog.ease).toBe(revlogData.ease);
    expect(addedRevlog.time).toBe(revlogData.time);
  });

  it("should handle query execution failures gracefully", async () => {
    // Execute an invalid SQL query that should fail but return issues instead of throwing
    const issues = await db.executeQueries(
      "INVALID SQL STATEMENT THAT WILL FAIL",
    );

    // Verify that issues were returned instead of throwing or logging
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe("critical"); // Database query failures are treated as critical
    expect(issues[0]?.message).toMatch(/Failed to execute query/);
  });

  it("should create database from dump and return instance", async () => {
    // Test the fromDump method return path (lines 103-104)
    const dumpData = await db.toObject();
    const newDb = await AnkiDatabase.fromDump(dumpData);

    expect(newDb).toBeInstanceOf(AnkiDatabase);
    expect(newDb).toBeDefined();

    // Verify the new database has the same collection data
    const originalCollection = await db.getCollection();
    const newCollection = await newDb.getCollection();
    expect(newCollection.id).toBe(originalCollection.id);

    await newDb.close();
  });

  it("should throw error when toBuffer() called on closed database", async () => {
    // Test the error path in toBuffer() (lines 108-109)
    const testDb = await AnkiDatabase.fromDefault();
    await testDb.close();

    expect(() => testDb.toBuffer()).toThrow("Database instance not available");
  });

  it("should add deck via addDeck()", async () => {
    // Test the addDeck method (lines 195-203)
    const deckData = {
      id: 12345,
      mod: Math.floor(Date.now() / 1000),
      name: "Test Deck",
      usn: 0,
      lrnToday: [0, 0] as [number, number],
      revToday: [0, 0] as [number, number],
      newToday: [0, 0] as [number, number],
      timeToday: [0, 0] as [number, number],
      collapsed: false,
      browserCollapsed: false,
      desc: "Test deck description",
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
      reviewLimit: null,
      newLimit: null,
      reviewLimitToday: null,
      newLimitToday: null,
    };

    await db.addDeck(deckData);

    // Verify the deck was added to the collection
    const collection = await db.getCollection();
    const addedDeck = collection.decks[deckData.id.toString()];
    expect(addedDeck).toBeDefined();
    expect(addedDeck?.name).toBe(deckData.name);
    expect(addedDeck?.desc).toBe(deckData.desc);
  });

  it("should handle fromDump with reviews and deleted items", async () => {
    // Test the fromDump method with reviews and deleted items (lines 98-99, 101-102)

    // First, create a database with some data
    const testDb = await AnkiDatabase.fromDefault();

    // Add a note and card first
    const noteData = {
      id: Date.now(),
      guid: "test-guid-fromDump",
      mid: 1,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      tags: "",
      flds: "Test Front\u001fTest Back",
      sfld: "Test Front",
      csum: 123456,
      flags: 0,
      data: "",
    };
    await testDb.addNote(noteData);

    const cardData = {
      id: Date.now() + 1,
      nid: noteData.id,
      did: 1,
      ord: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      type: 0,
      queue: 0,
      due: 1,
      ivl: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
      left: 0,
      odue: 0,
      odid: 0,
      flags: 0,
      data: "",
    };
    await testDb.addCard(cardData);

    // Add a review (revlog entry)
    const reviewData = {
      id: Date.now() + 2,
      cid: cardData.id,
      usn: 0,
      ease: 3,
      ivl: 1,
      lastIvl: 0,
      factor: 2500,
      time: 5000,
      type: 0,
    };
    await testDb.addRevlog(reviewData);

    // Get the dump which should now include reviews
    const dumpData = await testDb.toObject();

    // Verify the dump contains reviews
    expect(dumpData.reviews.length).toBeGreaterThan(0);

    // Create new database from dump - this should cover lines 98-99
    const newDb = await AnkiDatabase.fromDump(dumpData);

    // Verify the new database has the review data
    const newReviews = await newDb.getRevlog();
    expect(newReviews.length).toBeGreaterThan(0);
    expect(newReviews.find((r) => r.id === reviewData.id)).toBeDefined();

    await testDb.close();
    await newDb.close();
  });

  it("should handle fromDump with deleted items (graves)", async () => {
    // Test the fromDump method with deleted items (lines 101-102)

    // Create a dump with deleted items manually
    const baseDump = await db.toObject();

    // Add some deleted items to the dump
    const dumpWithGraves = {
      ...baseDump,
      deletedItems: [
        {
          usn: 1,
          type: 0, // Note type
          oid: 12345, // Original ID of deleted item
        },
        {
          usn: 2,
          type: 1, // Card type
          oid: 67890,
        },
      ],
    };

    // Create new database from dump - this should cover lines 101-102
    const newDb = await AnkiDatabase.fromDump(dumpWithGraves);

    // Verify the deleted items were inserted
    const graves = await newDb.getGraves();
    expect(graves.length).toBeGreaterThanOrEqual(2);
    expect(graves.find((g) => g.oid === 12345)).toBeDefined();
    expect(graves.find((g) => g.oid === 67890)).toBeDefined();

    await newDb.close();
  });
});
