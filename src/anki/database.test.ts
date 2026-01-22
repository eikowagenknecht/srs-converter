import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnkiDatabase } from "./database";

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
    expect(defaultCollection.crt).toStrictEqual(1_681_178_400);
    expect(defaultCollection.mod).toStrictEqual(1_731_670_964_300);
    expect(defaultCollection.scm).toStrictEqual(1_731_670_964_297);
    expect(defaultCollection.ver).toStrictEqual(11);
    expect(defaultCollection.dty).toStrictEqual(0);
    expect(defaultCollection.usn).toStrictEqual(0);
    expect(defaultCollection.ls).toStrictEqual(0);
    expect(defaultCollection.conf).toEqual({
      activeDecks: [1],
      addToCur: true,
      collapseTime: 1200,
      creationOffset: -120,
      curDeck: 1,
      curModel: 1_731_670_964_298,
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
    });
    expect(defaultCollection.models).toEqual({});
    expect(defaultCollection.decks).toEqual({
      "1": {
        browserCollapsed: true,
        collapsed: true,
        conf: 1,
        desc: "",
        dyn: 0,
        extendNew: 0,
        extendRev: 0,
        id: 1,
        lrnToday: [0, 0],
        mod: 0,
        name: "Default",
        newLimit: null,
        newLimitToday: null,
        newToday: [0, 0],
        revToday: [0, 0],
        reviewLimit: null,
        reviewLimitToday: null,
        timeToday: [0, 0],
        usn: 0,
      },
    });
    expect(defaultCollection.dconf).toEqual({
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
          leechAction: 1,
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
      flds: "Front Field\u001FBack Field",
      sfld: "Front Field",
      csum: 123_456,
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
    const issues = await db.executeQueries("INVALID SQL STATEMENT THAT WILL FAIL");

    // Verify that issues were returned instead of throwing or logging
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe("critical"); // Database query failures are treated as critical
    expect(issues[0]?.message).toMatch(/Failed to execute query/);
  });

  it("should create database from dump and return instance", async () => {
    // Test the fromDump method return path
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
    // Test the error path in toBuffer()
    const testDb = await AnkiDatabase.fromDefault();
    await testDb.close();

    expect(() => testDb.toBuffer()).toThrow("Database instance not available");
  });

  it("should add deck via addDeck()", async () => {
    const deckData = {
      browserCollapsed: false,
      collapsed: false,
      conf: 1,
      desc: "Test deck description",
      dyn: 0,
      extendNew: 0,
      extendRev: 0,
      id: 12_345,
      lrnToday: [0, 0] as [number, number],
      mod: Math.floor(Date.now() / 1000),
      name: "Test Deck",
      newLimit: null,
      newLimitToday: null,
      newToday: [0, 0] as [number, number],
      revToday: [0, 0] as [number, number],
      reviewLimit: null,
      reviewLimitToday: null,
      timeToday: [0, 0] as [number, number],
      usn: 0,
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
    // First, create a database with some data
    const testDb = await AnkiDatabase.fromDefault();

    // Add a note and card first
    const noteData = {
      csum: 123_456,
      data: "",
      flags: 0,
      flds: "Test Front\u001FTest Back",
      guid: "test-guid-fromDump",
      id: Date.now(),
      mid: 1,
      mod: Math.floor(Date.now() / 1000),
      sfld: "Test Front",
      tags: "",
      usn: 0,
    };
    await testDb.addNote(noteData);

    const cardData = {
      data: "",
      did: 1,
      due: 1,
      factor: 2500,
      flags: 0,
      id: Date.now() + 1,
      ivl: 0,
      lapses: 0,
      left: 0,
      mod: Math.floor(Date.now() / 1000),
      nid: noteData.id,
      odid: 0,
      odue: 0,
      ord: 0,
      queue: 0,
      reps: 0,
      type: 0,
      usn: 0,
    };
    await testDb.addCard(cardData);

    // Add a review (revlog entry)
    const reviewData = {
      cid: cardData.id,
      ease: 3,
      factor: 2500,
      id: Date.now() + 2,
      ivl: 1,
      lastIvl: 0,
      time: 5000,
      type: 0,
      usn: 0,
    };
    await testDb.addRevlog(reviewData);

    // Get the dump which should now include reviews
    const dumpData = await testDb.toObject();

    // Verify the dump contains reviews
    expect(dumpData.reviews.length).toBeGreaterThan(0);

    // Create new database from dump
    const newDb = await AnkiDatabase.fromDump(dumpData);

    // Verify the new database has the review data
    const newReviews = await newDb.getRevlog();
    expect(newReviews.length).toBeGreaterThan(0);
    expect(newReviews.find((r) => r.id === reviewData.id)).toBeDefined();

    await testDb.close();
    await newDb.close();
  });

  it("should handle fromDump with deleted items (graves)", async () => {
    // Create a dump with deleted items manually
    const baseDump = await db.toObject();

    // Add some deleted items to the dump
    const dumpWithGraves = {
      ...baseDump,
      deletedItems: [
        {
          usn: 1,
          type: 0, // Note type
          oid: 12_345, // Original ID of deleted item
        },
        {
          usn: 2,
          type: 1, // Card type
          oid: 67_890,
        },
      ],
    };

    // Create new database from dump
    const newDb = await AnkiDatabase.fromDump(dumpWithGraves);

    // Verify the deleted items were inserted
    const graves = await newDb.getGraves();
    expect(graves.length).toBeGreaterThanOrEqual(2);
    expect(graves.find((g) => g.oid === 12_345)).toBeDefined();
    expect(graves.find((g) => g.oid === 67_890)).toBeDefined();

    await newDb.close();
  });
});
