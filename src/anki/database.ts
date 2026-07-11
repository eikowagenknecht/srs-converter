import { CompiledQuery, Kysely } from "kysely";
import { SqlJsDialect } from "kysely-wasm";
import type { Database } from "sql.js";
import InitSqlJs from "sql.js";

import type { ConversionIssue } from "@/error-handling";

import type { FieldConfig, TemplateConfig } from "./anki-proto";
import {
  deckCommonCodec,
  deckConfigCodec,
  deckKindCodec,
  fieldConfigCodec,
  notetypeConfigCodec,
  templateConfigCodec,
} from "./anki-proto";
import { ankiDbSchema, ankiDefaultCollectionInsert, ankiModernDbSchema } from "./constants";
import type {
  ConfigRow,
  DeckConfigProtoBundle,
  DeckProtoBundle,
  NotetypeProtoBundle,
  TagRow,
} from "./schema-convert";
import {
  confJsonToConfigRows,
  configRowsToConfJson,
  deckConfigProtoToSchema11,
  deckConfigSchema11ToProto,
  deckProtoToSchema11,
  deckSchema11ToProto,
  notetypeProtoToSchema11,
  notetypeSchema11ToProto,
  tagRowsToTagsJson,
  tagsJsonToTagRows,
} from "./schema-convert";
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
import { parseJsonWithBigInts, serializeWithBigInts } from "./util";

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

/**
 * Native decoded entities of a schema-18 collection, carried alongside the
 * legacy-shaped dump for ADR-0016 blob storage.
 */
export interface ModernCollectionData {
  noteTypes: Map<number, NotetypeProtoBundle>;
  decks: Map<number, DeckProtoBundle>;
  deckConfigs: Map<number, DeckConfigProtoBundle>;
  col: {
    ver: number;
    configRows: ConfigRow[];
    tagRows: TagRow[];
  };
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

      // Schema-18 collections use Anki's custom `unicase` collation, which
      // sql.js cannot register — even reading the `tags` table fails ("no
      // query solution"). Full table scans never rely on unicase ordering,
      // so stripping the collation from the schema text is safe for reading
      // (docs/formats/anki.md §Schema-18 DDL). Probe errors are ignored so
      // corrupted databases keep their established error reporting below.
      try {
        const needsUnicasePatch =
          sqlJsInstance.exec("SELECT 1 FROM sqlite_master WHERE sql LIKE '%unicase%' LIMIT 1")
            .length > 0;
        if (needsUnicasePatch) {
          sqlJsInstance.exec("PRAGMA writable_schema=ON");
          sqlJsInstance.exec(
            "UPDATE sqlite_schema SET sql = REPLACE(sql, ' COLLATE unicase', '') WHERE sql LIKE '%unicase%'",
          );
          const patched = sqlJsInstance.export();
          sqlJsInstance.close();
          sqlJsInstance = new SQL.Database(patched);
        }
      } catch {
        // Leave the database as-is; later validation reports the details.
      }
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

  /**
   * Builds a schema-18 database from a legacy-shaped dump (ADR-0015 writer).
   * Entities come from the native modern bundles when available (same-schema
   * passthrough) and are up-converted from the schema-11 view otherwise.
   *
   * @returns A new AnkiDatabase holding the schema-18 collection.
   */
  static async fromModernDump(
    dump: DatabaseDump,
    modern?: ModernCollectionData,
  ): Promise<AnkiDatabase> {
    const SQL = await InitSqlJs();
    const sqlJsInstance = new SQL.Database();

    const dialect = new SqlJsDialect({
      database() {
        return sqlJsInstance;
      },
    });
    const db = new Kysely<DBTables>({ dialect });
    const newDb = new AnkiDatabase(db, sqlJsInstance);
    await newDb.executeQueries(ankiModernDbSchema);

    // The col row keeps its schema-11 shape, but at schema 18 the JSON
    // columns are stale empty strings and `ver` is 18.
    await newDb.db
      .insertInto("col")
      .values({
        id: dump.collection.id,
        crt: dump.collection.crt,
        mod: dump.collection.mod,
        scm: dump.collection.scm,
        ver: 18,
        dty: dump.collection.dty,
        usn: dump.collection.usn,
        ls: dump.collection.ls,
        conf: "",
        models: "",
        decks: "",
        dconf: "",
        tags: "",
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
      sqlJsInstance.run("INSERT OR IGNORE INTO graves (oid, type, usn) VALUES (?, ?, ?)", [
        grave.oid,
        grave.type,
        grave.usn,
      ]);
    }

    // Entity tables: protobuf blobs, encoded with the ADR-0013 codec.
    for (const [id, model] of Object.entries(dump.collection.models)) {
      const bundle =
        modern?.noteTypes.get(Number(id)) ??
        notetypeSchema11ToProto(model as unknown as Record<string, unknown>);
      sqlJsInstance.run(
        "INSERT INTO notetypes (id, name, mtime_secs, usn, config) VALUES (?, ?, ?, ?, ?)",
        [
          bundle.row.id,
          bundle.row.name,
          bundle.row.mtimeSecs,
          bundle.row.usn,
          notetypeConfigCodec.encode(bundle.config as never),
        ],
      );
      for (const field of bundle.fields) {
        sqlJsInstance.run("INSERT INTO fields (ntid, ord, name, config) VALUES (?, ?, ?, ?)", [
          bundle.row.id,
          field.ord,
          field.name,
          fieldConfigCodec.encode(field.config as never),
        ]);
      }
      for (const template of bundle.templates) {
        // Schema 11 has no per-template mtime/usn; Anki's own upgrade zeroes
        // them too.
        sqlJsInstance.run(
          "INSERT INTO templates (ntid, ord, name, mtime_secs, usn, config) VALUES (?, ?, ?, 0, 0, ?)",
          [
            bundle.row.id,
            template.ord,
            template.name,
            templateConfigCodec.encode(template.config as never),
          ],
        );
      }
    }

    for (const [id, deck] of Object.entries(dump.collection.decks)) {
      const bundle =
        modern?.decks.get(Number(id)) ??
        deckSchema11ToProto(deck as unknown as Record<string, unknown>);
      sqlJsInstance.run(
        "INSERT INTO decks (id, name, mtime_secs, usn, common, kind) VALUES (?, ?, ?, ?, ?, ?)",
        [
          bundle.row.id,
          bundle.row.name,
          bundle.row.mtimeSecs,
          bundle.row.usn,
          deckCommonCodec.encode(bundle.common as never),
          deckKindCodec.encode(bundle.kind as never),
        ],
      );
    }

    for (const [id, deckConfig] of Object.entries(dump.collection.dconf)) {
      const bundle =
        modern?.deckConfigs.get(Number(id)) ??
        deckConfigSchema11ToProto(deckConfig as unknown as Record<string, unknown>);
      sqlJsInstance.run(
        "INSERT INTO deck_config (id, name, mtime_secs, usn, config) VALUES (?, ?, ?, ?, ?)",
        [
          bundle.row.id,
          bundle.row.name,
          bundle.row.mtimeSecs,
          bundle.row.usn,
          deckConfigCodec.encode(bundle.config as never),
        ],
      );
    }

    const configRows =
      modern?.col.configRows ??
      confJsonToConfigRows(dump.collection.conf as unknown as Record<string, unknown>);
    for (const row of configRows) {
      sqlJsInstance.run("INSERT INTO config (KEY, usn, mtime_secs, val) VALUES (?, ?, ?, ?)", [
        row.key,
        row.usn,
        row.mtimeSecs,
        row.val,
      ]);
    }

    const tagRows =
      modern?.col.tagRows ??
      tagsJsonToTagRows(dump.collection.tags as unknown as Record<string, unknown>);
    for (const row of tagRows) {
      sqlJsInstance.run(
        "INSERT OR IGNORE INTO tags (tag, usn, collapsed, config) VALUES (?, ?, ?, ?)",
        [row.tag, row.usn, row.collapsed ? 1 : 0, row.config],
      );
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
   * Reads the collection's schema version (`col.ver`): 11 for legacy
   * packages, 18 for modern ones.
   *
   * @returns The schema version number.
   */
  getSchemaVersion(): number {
    const rows = this.rawRows("SELECT ver FROM col");
    return Number(rows[0]?.["ver"] ?? 0);
  }

  /** Runs a raw query against sql.js (for tables Kysely does not model). */
  private rawRows(sql: string): Record<string, unknown>[] {
    if (!this.sqlJsInstance) {
      throw new Error("Database instance not available");
    }
    const result = this.sqlJsInstance.exec(sql);
    if (result.length === 0 || !result[0]) {
      return [];
    }
    const { columns, values } = result[0];
    return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i] ?? "", v])));
  }

  /**
   * Reads a schema-18 collection: split entity tables are decoded (protobuf
   * blobs) and converted into the legacy-shaped {@link DatabaseDump} so
   * everything downstream of the reader stays format-agnostic, while the
   * native decoded entities are returned alongside for ADR-0016 blob
   * storage.
   *
   * @returns The legacy-shaped dump plus the native modern entities.
   */
  async toModernObject(): Promise<{ dump: DatabaseDump; modern: ModernCollectionData }> {
    const fieldsByNt = new Map<number, { ord: number; name: string; config: FieldConfig }[]>();
    for (const row of this.rawRows(
      "SELECT ntid, ord, name, config FROM fields ORDER BY ntid, ord",
    )) {
      const ntid = row["ntid"] as number;
      const list = fieldsByNt.get(ntid) ?? [];
      list.push({
        ord: row["ord"] as number,
        name: row["name"] as string,
        config: fieldConfigCodec.decode(row["config"] as Uint8Array),
      });
      fieldsByNt.set(ntid, list);
    }
    const templatesByNt = new Map<
      number,
      { ord: number; name: string; config: TemplateConfig }[]
    >();
    for (const row of this.rawRows(
      "SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord",
    )) {
      const ntid = row["ntid"] as number;
      const list = templatesByNt.get(ntid) ?? [];
      list.push({
        ord: row["ord"] as number,
        name: row["name"] as string,
        config: templateConfigCodec.decode(row["config"] as Uint8Array),
      });
      templatesByNt.set(ntid, list);
    }

    const noteTypes = new Map<number, NotetypeProtoBundle>();
    for (const row of this.rawRows("SELECT id, name, mtime_secs, usn, config FROM notetypes")) {
      const id = row["id"] as number;
      noteTypes.set(id, {
        row: {
          id,
          name: row["name"] as string,
          mtimeSecs: row["mtime_secs"] as number,
          usn: row["usn"] as number,
        },
        config: notetypeConfigCodec.decode(row["config"] as Uint8Array),
        fields: fieldsByNt.get(id) ?? [],
        templates: templatesByNt.get(id) ?? [],
      });
    }

    const decks = new Map<number, DeckProtoBundle>();
    for (const row of this.rawRows("SELECT id, name, mtime_secs, usn, common, kind FROM decks")) {
      const id = row["id"] as number;
      decks.set(id, {
        row: {
          id,
          name: row["name"] as string,
          mtimeSecs: row["mtime_secs"] as number,
          usn: row["usn"] as number,
        },
        common: deckCommonCodec.decode(row["common"] as Uint8Array),
        kind: deckKindCodec.decode(row["kind"] as Uint8Array),
      });
    }

    const deckConfigs = new Map<number, DeckConfigProtoBundle>();
    for (const row of this.rawRows("SELECT id, name, mtime_secs, usn, config FROM deck_config")) {
      const id = row["id"] as number;
      deckConfigs.set(id, {
        row: {
          id,
          name: row["name"] as string,
          mtimeSecs: row["mtime_secs"] as number,
          usn: row["usn"] as number,
        },
        config: deckConfigCodec.decode(row["config"] as Uint8Array),
      });
    }

    const configRows: ConfigRow[] = this.rawRows(
      "SELECT KEY, usn, mtime_secs, val FROM config",
    ).map((row) => ({
      key: row["KEY"] as string,
      usn: row["usn"] as number,
      mtimeSecs: row["mtime_secs"] as number,
      val: row["val"] as Uint8Array,
    }));
    const tagRows: TagRow[] = this.rawRows("SELECT tag, usn, collapsed, config FROM tags").map(
      (row) => ({
        tag: row["tag"] as string,
        usn: row["usn"] as number,
        collapsed: Boolean(row["collapsed"]),
        config: (row["config"] as Uint8Array | null) ?? null,
      }),
    );

    const colRow = this.rawRows("SELECT id, crt, mod, scm, ver, dty, usn, ls FROM col")[0];
    if (!colRow) {
      throw new AnkiDatabaseError("corrupted", "The collection row is missing.");
    }

    // Legacy-shaped view: models/decks/dconf as schema-11 JSON, ver as 11 —
    // the blobs' native form travels separately in `modern`.
    const collection: ColTable = {
      id: colRow["id"] as number,
      crt: colRow["crt"] as number,
      mod: colRow["mod"] as number,
      scm: colRow["scm"] as number,
      ver: 11,
      dty: colRow["dty"] as number,
      usn: colRow["usn"] as number,
      ls: colRow["ls"] as number,
      conf: configRowsToConfJson(configRows) as unknown as Config,
      models: Object.fromEntries(
        [...noteTypes.entries()].map(([id, bundle]) => [
          String(id),
          notetypeProtoToSchema11(bundle),
        ]),
      ) as unknown as NoteTypes,
      decks: Object.fromEntries(
        [...decks.entries()].map(([id, bundle]) => [String(id), deckProtoToSchema11(bundle)]),
      ) as unknown as Decks,
      dconf: Object.fromEntries(
        [...deckConfigs.entries()].map(([id, bundle]) => [
          String(id),
          deckConfigProtoToSchema11(bundle),
        ]),
      ) as unknown as DeckConfigs,
      tags: tagRowsToTagsJson(tagRows) as Record<string, never>,
    };

    const dump: DatabaseDump = {
      cards: await this.getCards(),
      collection,
      deletedItems: await this.getGraves(),
      notes: await this.getNotes(),
      reviews: await this.getRevlog(),
    };

    return {
      dump,
      modern: {
        noteTypes,
        decks,
        deckConfigs,
        col: {
          ver: this.getSchemaVersion(),
          configRows,
          tagRows,
        },
      },
    };
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
      models: parseJsonWithBigInts(collectionRaw.models) as NoteTypes,
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
