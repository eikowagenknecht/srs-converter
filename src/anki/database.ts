import { CompiledQuery, Kysely } from "kysely";
import { SqlJsDialect } from "kysely-wasm";
import type { Database } from "sql.js";
import InitSqlJs from "sql.js";
import type { ConversionIssue } from "@/error-handling";
import { ankiDbSchema, ankiDefaultCollectionInsert } from "./constants";
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
import { parseWithBigInts, serializeWithBigInts } from "./util";

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

  static async fromBuffer(buffer: Uint8Array): Promise<AnkiDatabase> {
    const SQL = await InitSqlJs();
    const sqlJsInstance = new SQL.Database(buffer);

    const dialect = new SqlJsDialect({
      database() {
        return sqlJsInstance;
      },
    });

    const db = new Kysely<DBTables>({ dialect });
    return new AnkiDatabase(db, sqlJsInstance);
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

  async toObject(): Promise<DatabaseDump> {
    const dump: DatabaseDump = {
      collection: await this.getCollection(),
      cards: await this.getCards(),
      notes: await this.getNotes(),
      reviews: await this.getRevlog(),
      deletedItems: await this.getGraves(),
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
      ? sql.flatMap(prepareStatements)
      : prepareStatements(sql);

    for (const statement of statements) {
      try {
        await this.db.executeQuery(CompiledQuery.raw(statement));
      } catch (error) {
        issues.push({
          severity: "critical", // Schema setup issues are critical
          message: `Failed to execute query: ${statement}`,
          context: {
            originalData: { statement, error },
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
    const collectionRaw = await this.db
      .selectFrom("col")
      .selectAll()
      .executeTakeFirstOrThrow();

    // Parse the JSON fields in the database.
    // TODO: Handle the case where the fields do not comply with the expected types.
    const collection: ColTable = {
      ...collectionRaw,
      conf: JSON.parse(collectionRaw.conf) as Config,
      decks: JSON.parse(collectionRaw.decks) as Decks,
      dconf: JSON.parse(collectionRaw.dconf) as DeckConfigs,
      models: parseWithBigInts(collectionRaw.models, [
        "tmpls[].id",
        "flds[].id",
      ]) as NoteTypes,
      tags: JSON.parse(collectionRaw.tags) as Record<string, never>,
    };

    return collection;
  }

  async getCards(): Promise<CardsTable[]> {
    return this.db.selectFrom("cards").selectAll().execute();
  }

  async getNotes(): Promise<NotesTable[]> {
    return this.db.selectFrom("notes").selectAll().execute();
  }

  async getRevlog(): Promise<RevlogTable[]> {
    return this.db.selectFrom("revlog").selectAll().execute();
  }

  async getGraves(): Promise<DBTables["graves"][]> {
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

  async addNote(note: NotesTable): Promise<NotesTable> {
    return this.db
      .insertInto("notes")
      .values(note)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async addCard(card: CardsTable): Promise<CardsTable> {
    return this.db
      .insertInto("cards")
      .values(card)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async addRevlog(revlog: RevlogTable): Promise<RevlogTable> {
    return this.db
      .insertInto("revlog")
      .values(revlog)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
