import type { Database } from "sql.js";

import { CompiledQuery, Kysely } from "kysely";
import { SqlJsDialect } from "kysely-wasm";
import InitSqlJs from "sql.js";

import type { ConversionIssue } from "@/error-handling";

import type {
  CardsTable,
  ColTable,
  Config,
  DatabaseDump,
  DBTables,
  Deck,
  DeckConfigs,
  Decks,
  NotesTable,
  NoteTypes,
  RevlogTable,
} from "./types";

import { ankiDbSchema, ankiDefaultCollectionInsert } from "./constants";
import { parseWithBigInts, serializeWithBigInts } from "./util";

/**
 * Error types for AnkiDatabase operations
 */
export type AnkiDatabaseErrorType =
  | "empty"
  | "truncated"
  | "invalid_header"
  | "corrupted"
  | "missing_tables";

/**
 * Custom error class for AnkiDatabase-specific errors
 */
export class AnkiDatabaseError extends Error {
  readonly type: AnkiDatabaseErrorType;
  readonly missingTables: string[] | undefined;

  constructor(type: AnkiDatabaseErrorType, message: string, missingTables?: string[]) {
    super(message);
    this.name = "AnkiDatabaseError";
    this.type = type;
    this.missingTables = missingTables;
  }
}

export class AnkiDatabase {
  private db: Kysely<DBTables>;
  private sqlJsInstance: Database | undefined;

  private constructor(db: Kysely<DBTables>, sqlJsInstance: Database) {
    this.db = db;
    this.sqlJsInstance = sqlJsInstance;
  }

  static async fromDefault(): Promise<AnkiDatabase> {
    const SQL = await InitSqlJs();
    const sqlJsInstance = new SQL.Database();

    const dialect = new SqlJsDialect({
      database() {
        return sqlJsInstance;
      },
    });

    const db = new Kysely<DBTables>({ dialect });

    const newDb = new AnkiDatabase(db, sqlJsInstance);
    // We ignore the issues returned by executeQueries here,
    // as we are setting up the schema which is always expected to succeed.
    await newDb.executeQueries([ankiDbSchema, ankiDefaultCollectionInsert]);
    return newDb;
  }

  /**
   * SQLite magic bytes: "SQLite format 3\0" (16 bytes)
   */
  private static readonly SQLITE_MAGIC = new Uint8Array([
    0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
  ]);

  /**
   * Required tables for a valid Anki database
   */
  static readonly REQUIRED_TABLES = ["col", "notes", "cards", "revlog", "graves"] as const;

  /**
   * Creates an AnkiDatabase from a buffer containing SQLite data.
   * @param buffer - The SQLite database file contents
   * @returns A new AnkiDatabase instance
   * @throws {AnkiDatabaseError} if the buffer is empty, not a valid SQLite file, or corrupted
   */
  static async fromBuffer(buffer: Uint8Array): Promise<AnkiDatabase> {
    // Check for empty buffer
    if (buffer.length === 0) {
      throw new AnkiDatabaseError("empty", "The database file is empty (0 bytes).");
    }

    // Check for SQLite magic bytes (first 16 bytes should be "SQLite format 3\0")
    if (buffer.length < 16) {
      throw new AnkiDatabaseError(
        "truncated",
        "The database file is too small to be a valid SQLite database.",
      );
    }

    const hasSqliteMagic = AnkiDatabase.SQLITE_MAGIC.every((byte, index) => buffer[index] === byte);

    if (!hasSqliteMagic) {
      throw new AnkiDatabaseError(
        "invalid_header",
        "The file is not a valid SQLite database (invalid header).",
      );
    }

    // Try to open the database
    let sqlJsInstance: Database;
    try {
      const SQL = await InitSqlJs();
      sqlJsInstance = new SQL.Database(buffer);
    } catch (error) {
      // sql.js throws various errors for corrupted databases
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AnkiDatabaseError(
        "corrupted",
        `The database file is corrupted and cannot be opened: ${errorMessage}`,
      );
    }

    const dialect = new SqlJsDialect({
      database() {
        return sqlJsInstance;
      },
    });

    const db = new Kysely<DBTables>({ dialect });
    return new AnkiDatabase(db, sqlJsInstance);
  }

  /**
   * Validates that the database has all required Anki tables.
   * @throws {AnkiDatabaseError} if any required tables are missing or database is corrupted
   */
  validateSchema(): void {
    if (!this.sqlJsInstance) {
      throw new AnkiDatabaseError(
        "corrupted",
        "Database instance not available for schema validation.",
      );
    }

    // Query sqlite_master to get list of tables
    let result: ReturnType<Database["exec"]>;
    try {
      result = this.sqlJsInstance.exec("SELECT name FROM sqlite_master WHERE type='table'");
    } catch (error) {
      // sql.js throws for corrupted/truncated databases when queried
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AnkiDatabaseError(
        "corrupted",
        `The database is corrupted and cannot be read: ${errorMessage}`,
      );
    }

    const existingTables = new Set<string>();
    if (result.length > 0 && result[0]) {
      for (const row of result[0].values) {
        if (typeof row[0] === "string") {
          existingTables.add(row[0]);
        }
      }
    }

    const missingTables = AnkiDatabase.REQUIRED_TABLES.filter(
      (table) => !existingTables.has(table),
    );

    if (missingTables.length > 0) {
      const missingList = missingTables.map((t) => `'${t}'`).join(", ");
      throw new AnkiDatabaseError(
        "missing_tables",
        `The database is missing required tables: ${missingList}. This may indicate a corrupted or incompatible database.`,
        [...missingTables],
      );
    }
  }

  static async fromDump(dump: DatabaseDump): Promise<AnkiDatabase> {
    const SQL = await InitSqlJs();
    const sqlJsInstance = new SQL.Database();

    const dialect = new SqlJsDialect({
      database() {
        return sqlJsInstance;
      },
    });

    const db = new Kysely<DBTables>({ dialect });

    const newDb = new AnkiDatabase(db, sqlJsInstance);
    // We ignore the issues returned by executeQueries here,
    // as we are setting up the schema which is always expected to succeed.
    await newDb.executeQueries(ankiDbSchema);

    await newDb.db
      .insertInto("col")
      .values({
        ...dump.collection,
        conf: JSON.stringify(dump.collection.conf),
        decks: JSON.stringify(dump.collection.decks),
        dconf: JSON.stringify(dump.collection.dconf),
        models: serializeWithBigInts(dump.collection.models),
        tags: JSON.stringify(dump.collection.tags),
      })
      .execute();
    for (const card of dump.cards) {
      await newDb.db.insertInto("cards").values(card).execute();
    }
    for (const note of dump.notes) {
      await newDb.db.insertInto("notes").values(note).execute();
    }
    for (const review of dump.reviews) {
      await newDb.db.insertInto("revlog").values(review).execute();
    }
    for (const grave of dump.deletedItems) {
      await newDb.db.insertInto("graves").values(grave).execute();
    }
    return newDb;
  }

  toBuffer(): Uint8Array {
    if (!this.sqlJsInstance) {
      throw new Error("Database instance not available");
    }
    return this.sqlJsInstance.export();
  }

  /**
   * Converts the database to a DatabaseDump object.
   * @returns DatabaseDump containing the raw data from the database
   */
  async toObject(): Promise<DatabaseDump> {
    const dump: DatabaseDump = {
      cards: await this.getCards(),
      collection: await this.getCollection(),
      deletedItems: await this.getGraves(),
      notes: await this.getNotes(),
      reviews: await this.getRevlog(),
    };
    return dump;
  }

  async executeQueries(sql: string | string[]): Promise<ConversionIssue[]> {
    const issues: ConversionIssue[] = [];
    const prepareStatements = (stmt: string) =>
      stmt
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const statements = Array.isArray(sql)
      ? sql.flatMap((s) => prepareStatements(s))
      : prepareStatements(sql);

    for (const statement of statements) {
      try {
        await this.db.executeQuery(CompiledQuery.raw(statement));
      } catch (error) {
        issues.push({
          severity: "critical", // Schema setup issues are critical
          message: `Failed to execute query: ${statement}`,
          context: {
            originalData: { error, statement },
          },
        });
      }
    }

    return issues;
  }

  async close(): Promise<void> {
    await this.db.destroy();
    this.sqlJsInstance = undefined;
  }

  async getCollection(): Promise<ColTable> {
    const collectionRaw = await this.db.selectFrom("col").selectAll().executeTakeFirstOrThrow();

    // Parse the JSON fields in the database.
    // TODO: Handle the case where the fields do not comply with the expected types.
    const collection: ColTable = {
      ...collectionRaw,
      conf: JSON.parse(collectionRaw.conf) as Config,
      decks: JSON.parse(collectionRaw.decks) as Decks,
      dconf: JSON.parse(collectionRaw.dconf) as DeckConfigs,
      models: parseWithBigInts(collectionRaw.models, ["tmpls[].id", "flds[].id"]) as NoteTypes,
      tags: JSON.parse(collectionRaw.tags) as Record<string, never>,
    };

    return collection;
  }

  getCards(): Promise<CardsTable[]> {
    return this.db.selectFrom("cards").selectAll().execute();
  }

  getNotes(): Promise<NotesTable[]> {
    return this.db.selectFrom("notes").selectAll().execute();
  }

  getRevlog(): Promise<RevlogTable[]> {
    return this.db.selectFrom("revlog").selectAll().execute();
  }

  getGraves(): Promise<DBTables["graves"][]> {
    return this.db.selectFrom("graves").selectAll().execute();
  }

  async addDeck(deck: Deck): Promise<void> {
    const collection = await this.getCollection();
    collection.decks[deck.id.toString()] = deck;

    await this.db
      .updateTable("col")
      .set("decks", JSON.stringify(collection.decks))
      .where("id", "=", collection.id)
      .execute();
  }

  addNote(note: NotesTable): Promise<NotesTable> {
    return this.db.insertInto("notes").values(note).returningAll().executeTakeFirstOrThrow();
  }

  addCard(card: CardsTable): Promise<CardsTable> {
    return this.db.insertInto("cards").values(card).returningAll().executeTakeFirstOrThrow();
  }

  addRevlog(revlog: RevlogTable): Promise<RevlogTable> {
    return this.db.insertInto("revlog").values(revlog).returningAll().executeTakeFirstOrThrow();
  }
}
