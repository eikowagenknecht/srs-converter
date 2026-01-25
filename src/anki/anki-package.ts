import type { Readable } from "node:stream";
import type { CentralDirectory } from "unzipper";

import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import protobuf from "protobufjs";
import { Open } from "unzipper";

import type { ConversionIssue, ConversionOptions, ConversionResult } from "@/error-handling";
import type { SrsCard } from "@/srs-package";

import { IssueCollector } from "@/error-handling";
import {
  SrsPackage,
  SrsReviewScore,
  createCard,
  createDeck,
  createNote,
  createNoteType,
  createReview,
} from "@/srs-package";

import type {
  CardsTable,
  Config,
  DatabaseDump,
  Deck,
  MediaFileMapping,
  NoteType,
  NotesTable,
  RevlogTable,
} from "./types";

import { defaultDeck } from "./constants";
import { AnkiDatabase, AnkiDatabaseError } from "./database";
import { DeckDynamicity, Ease, ExportVersion, NoteTypeKind } from "./types";
import {
  createSelectiveZip,
  extractTimestampFromUuid,
  guid64,
  joinAnkiFields,
  serializeWithBigInts,
  splitAnkiFields,
} from "./util";

/**
 * Validation result for individual items
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a deck entry from the database
 * @param deckId - The deck ID key from the decks object
 * @param data - The raw deck data to validate
 * @returns Validation result indicating if the deck is valid
 */
function validateDeckEntry(deckId: string, data: unknown): ValidationResult {
  if (data === null || typeof data !== "object") {
    return { error: "not an object", valid: false };
  }

  const deck = data as Record<string, unknown>;
  const deckIdValue = deck["id"];
  const deckNameValue = deck["name"];

  if (typeof deckIdValue !== "number" || Number.isNaN(deckIdValue)) {
    return { error: "missing or invalid 'id' field", valid: false };
  }

  if (typeof deckNameValue !== "string") {
    return { error: "missing or invalid 'name' field", valid: false };
  }

  if (deckIdValue.toString() !== deckId) {
    return {
      error: `deck ID mismatch: key is '${deckId}' but id field is '${deckIdValue.toString()}'`,
      valid: false,
    };
  }

  return { valid: true };
}

/**
 * Validates a note type entry from the database
 * @param noteTypeId - The note type ID key from the models object
 * @param data - The raw note type data to validate
 * @returns Validation result indicating if the note type is valid
 */
function validateNoteTypeEntry(noteTypeId: string, data: unknown): ValidationResult {
  if (data === null || typeof data !== "object") {
    return { error: "not an object", valid: false };
  }

  const noteType = data as Record<string, unknown>;
  const noteTypeIdValue = noteType["id"];
  const noteTypeNameValue = noteType["name"];
  const noteTypeFldsValue = noteType["flds"];
  const noteTypeTmplsValue = noteType["tmpls"];

  if (typeof noteTypeIdValue !== "number" || Number.isNaN(noteTypeIdValue)) {
    return { error: "missing or invalid 'id' field", valid: false };
  }

  if (typeof noteTypeNameValue !== "string") {
    return { error: "missing or invalid 'name' field", valid: false };
  }

  if (!Array.isArray(noteTypeFldsValue)) {
    return { error: "missing or invalid 'flds' (fields) array", valid: false };
  }

  if (!Array.isArray(noteTypeTmplsValue)) {
    return {
      error: "missing or invalid 'tmpls' (templates) array",
      valid: false,
    };
  }

  if (noteTypeIdValue.toString() !== noteTypeId) {
    return {
      error: `note type ID mismatch: key is '${noteTypeId}' but id field is '${noteTypeIdValue.toString()}'`,
      valid: false,
    };
  }

  return { valid: true };
}

/**
 * Validates a note from the database
 * @param note - The note to validate
 * @param validNoteTypeIds - Set of valid note type IDs to check against
 * @returns Validation result indicating if the note is valid
 */
function validateNote(note: NotesTable, validNoteTypeIds: Set<number>): ValidationResult {
  if (Number.isNaN(note.id)) {
    return { error: "missing or invalid 'id' field", valid: false };
  }

  if (typeof note.guid !== "string" || note.guid === "") {
    return { error: "missing or invalid 'guid' field", valid: false };
  }

  if (typeof note.mid !== "number" || Number.isNaN(note.mid)) {
    return { error: "missing or invalid 'mid' (note type id)", valid: false };
  }

  if (!validNoteTypeIds.has(note.mid)) {
    return {
      error: `references non-existent note type '${note.mid.toFixed(0)}'`,
      valid: false,
    };
  }

  if (typeof note.flds !== "string") {
    return { error: "missing or invalid 'flds' (fields)", valid: false };
  }

  return { valid: true };
}

/**
 * Validates a card from the database
 * @param card - The card to validate
 * @param validNoteIds - Set of valid note IDs to check against
 * @param validDeckIds - Set of valid deck IDs to check against
 * @returns Validation result indicating if the card is valid
 */
function validateCard(
  card: CardsTable,
  validNoteIds: Set<number>,
  validDeckIds: Set<number>,
): ValidationResult {
  if (card.id === null || Number.isNaN(card.id)) {
    return { error: "missing or invalid 'id' field", valid: false };
  }

  if (typeof card.nid !== "number" || Number.isNaN(card.nid)) {
    return { error: "missing or invalid 'nid' (note id)", valid: false };
  }

  if (!validNoteIds.has(card.nid)) {
    return {
      error: `references non-existent note '${card.nid.toFixed(0)}'`,
      valid: false,
    };
  }

  if (typeof card.did !== "number" || Number.isNaN(card.did)) {
    return { error: "missing or invalid 'did' (deck id)", valid: false };
  }

  if (!validDeckIds.has(card.did)) {
    return {
      error: `references non-existent deck '${card.did.toFixed(0)}'`,
      valid: false,
    };
  }

  return { valid: true };
}

/**
 * Validates a review from the database
 * @param review - The review to validate
 * @param validCardIds - Set of valid card IDs to check against
 * @returns Validation result indicating if the review is valid
 */
function validateReview(review: RevlogTable, validCardIds: Set<number>): ValidationResult {
  if (review.id === null || Number.isNaN(review.id)) {
    return { error: "missing or invalid 'id' field", valid: false };
  }

  if (typeof review.cid !== "number" || Number.isNaN(review.cid)) {
    return { error: "missing or invalid 'cid' (card id)", valid: false };
  }

  if (!validCardIds.has(review.cid)) {
    return {
      error: `references non-existent card '${review.cid.toFixed(0)}'`,
      valid: false,
    };
  }

  return { valid: true };
}

/**
 * Filters database contents to keep only valid items.
 * @param dump - The raw database dump to filter
 * @param collector - Issue collector to report validation errors
 * @returns Database dump with only valid items
 */
function filterValidDatabaseItems(dump: DatabaseDump, collector: IssueCollector): DatabaseDump {
  // Step 1: Validate decks
  const validDecks: Record<string, Deck> = {};
  for (const [deckId, deckData] of Object.entries(dump.collection.decks)) {
    const validation = validateDeckEntry(deckId, deckData);
    if (validation.valid) {
      validDecks[deckId] = deckData;
    } else {
      collector.addError(
        `Deck '${deckId}' is invalid: ${validation.error ?? "unknown error"}. This deck will be skipped.`,
        { itemType: "deck", originalData: deckData },
      );
    }
  }

  // Step 2: Validate note types
  const validNoteTypes: Record<string, NoteType> = {};
  for (const [modelId, modelData] of Object.entries(dump.collection.models)) {
    const validation = validateNoteTypeEntry(modelId, modelData);
    if (validation.valid) {
      validNoteTypes[modelId] = modelData;
    } else {
      collector.addError(
        `Note type '${modelId}' is invalid: ${validation.error ?? "unknown error"}. This note type will be skipped.`,
        { itemType: "noteType", originalData: modelData },
      );
    }
  }

  const validDeckIds = new Set(Object.keys(validDecks).map(Number));
  const validNoteTypeIds = new Set(Object.keys(validNoteTypes).map(Number));

  // Step 3: Validate notes
  const validNotes: NotesTable[] = [];
  for (const note of dump.notes) {
    const validation = validateNote(note, validNoteTypeIds);
    if (validation.valid) {
      validNotes.push(note);
    } else {
      collector.addError(
        `Note ${note.id.toFixed(0)} is invalid: ${validation.error ?? "unknown error"}. This note will be skipped.`,
        { itemType: "note", originalData: note },
      );
    }
  }

  const validNoteIds = new Set(validNotes.map((n) => n.id));

  // Step 4: Validate cards
  const validCards: CardsTable[] = [];
  for (const card of dump.cards) {
    const validation = validateCard(card, validNoteIds, validDeckIds);
    if (validation.valid) {
      validCards.push(card);
    } else {
      const cardId = card.id === null ? "unknown" : card.id.toFixed(0);
      collector.addError(
        `Card ${cardId} is invalid: ${validation.error ?? "unknown error"}. This card will be skipped.`,
        { itemType: "card", originalData: card },
      );
    }
  }

  const validCardIds = new Set(
    validCards.map((c) => c.id).filter((id): id is number => id !== null),
  );

  // Step 5: Validate reviews
  const validReviews: RevlogTable[] = [];
  for (const review of dump.reviews) {
    const validation = validateReview(review, validCardIds);
    if (validation.valid) {
      validReviews.push(review);
    } else {
      const reviewId = review.id === null ? "unknown" : review.id.toFixed(0);
      collector.addError(
        `Review ${reviewId} is invalid: ${validation.error ?? "unknown error"}. This review will be skipped.`,
        { itemType: "review", originalData: review },
      );
    }
  }

  return {
    cards: validCards,
    collection: {
      ...dump.collection,
      decks: validDecks,
      models: validNoteTypes,
    },
    deletedItems: dump.deletedItems,
    notes: validNotes,
    reviews: validReviews,
  };
}

/**
 * Analyzes a note's field content to find cloze deletions and returns the required card ordinals.
 * For cloze note types, cards are generated based on the cloze deletion numbers found in the field content.
 * @param fieldContent - The combined field content of a note (joined with \x1f separator)
 * @returns Array of ordinals (0-indexed) that should have cards generated
 */
function analyzeClozeOrdinals(fieldContent: string): number[] {
  // Find valid cloze deletion patterns: {{c1::text}}, {{c2::text::hint}}, etc.
  // NOTE: {{c0::...}} is NOT a valid cloze deletion - clozes start from c1
  const clozeRegex = /\{\{c([1-9]\d*)::[^}]*\}\}/g;

  const clozeNumbers = [...fieldContent.matchAll(clozeRegex)]
    .map((match) => match[1])
    .filter((group): group is string => group !== undefined)
    .map((group) => Number.parseInt(group, 10) - 1) // Convert to 0-based ordinals
    .filter((ordinal, index, arr) => arr.indexOf(ordinal) === index) // Remove duplicates
    .sort((a, b) => a - b);

  return clozeNumbers;
}

/**
 * Resolves an Anki ID from an SRS entity using a two-step strategy.
 *
 * Resolution strategy:
 * 1. Check applicationSpecificData.originalAnkiId (preserved from Anki → SRS conversion)
 * 2. Fall back to provided fallback value
 * @param applicationSpecificData - The entity's application-specific metadata
 * @param fallbackValue - Fallback ID if no valid ID can be resolved
 * @returns The resolved Anki ID
 */
function resolveAnkiId(
  applicationSpecificData: Record<string, string> | undefined,
  fallbackValue: number,
): number {
  // Check for preserved Anki ID first
  if (applicationSpecificData?.["originalAnkiId"]) {
    const originalId = Number(applicationSpecificData["originalAnkiId"]);
    if (!Number.isNaN(originalId)) {
      return originalId;
    }
  }

  // Fall back to provided value
  return fallbackValue;
}

const EXPORT_VERSION = ExportVersion.Legacy_V2;
const DB_VERSION = 11;
const VALID_FILE_EXTENSIONS = [".apkg", ".colpkg"] as const;

export class AnkiPackage {
  private tempDir: string;
  private databaseContents: DatabaseDump | undefined;
  private mediaFiles: MediaFileMapping = {};

  private constructor(tempDir: string) {
    this.tempDir = tempDir;
  }

  private getCardDescription(card: CardsTable, note?: NotesTable, deck?: Deck): string {
    const cardId = card.id?.toFixed() ?? "Unknown";
    const deckName = deck?.name ?? "Unknown";

    if (!note) {
      return `Card ID ${cardId} in deck "${deckName}"`;
    }

    // Extract front text from note fields
    const fields = note.flds.split("\u001F");
    // TODO: This needs some love to work with multiple fields, HTML etc.
    const frontText = fields[0] ?? note.sfld;
    const cleanText = frontText.replaceAll(/<[^>]*>/g, "").trim();
    const preview = cleanText.length > 50 ? `${cleanText.slice(0, 47)}...` : cleanText;

    return preview
      ? `Card "${preview}" (ID ${cardId}) in deck "${deckName}"`
      : `Card ID ${cardId} in deck "${deckName}"`;
  }

  private getReviewDescription(
    review: RevlogTable,
    card?: CardsTable,
    note?: NotesTable,
    deck?: Deck,
  ): string {
    const reviewId = review.id?.toFixed() ?? "Unknown";
    const reviewDate = review.id ? new Date(review.id).toLocaleDateString() : "Unknown";

    if (card && note) {
      const cardDesc = this.getCardDescription(card, note, deck);
      return `Review of ${cardDesc} on ${reviewDate}`;
    }
    return `Review ID ${reviewId} on ${reviewDate}`;
  }

  public static async fromDefault(
    options?: ConversionOptions,
  ): Promise<ConversionResult<AnkiPackage>> {
    const collector = new IssueCollector(options);

    try {
      const instance = new AnkiPackage(await makeTempDir());
      let db: AnkiDatabase | undefined;

      try {
        db = await AnkiDatabase.fromDefault();
        const rawDump = await db.toObject();
        instance.databaseContents = filterValidDatabaseItems(rawDump, collector);

        return collector.createResult(instance);
      } catch (error) {
        collector.addCritical(
          `Cannot start conversion because the default database could not be created. ${error instanceof Error ? error.message : String(error)}.`,
        );

        const cleanupIssues = await removeDirectory(instance.tempDir);
        collector.addIssues(cleanupIssues);
        return collector.createFailureResult<AnkiPackage>();
      } finally {
        await db?.close();
      }
    } catch (error) {
      collector.addCritical(
        `Cannot proceed with conversion because the temporary working directory could not be created. ${error instanceof Error ? error.message : String(error)}.`,
      );
      return collector.createFailureResult<AnkiPackage>();
    }
  }

  public static async fromAnkiExport(
    filepath: string,
    options?: ConversionOptions,
  ): Promise<ConversionResult<AnkiPackage>> {
    const collector = new IssueCollector(options);

    try {
      const instance = new AnkiPackage(await makeTempDir());
      let db: AnkiDatabase | undefined;

      try {
        if (!VALID_FILE_EXTENSIONS.some((ext) => filepath.endsWith(ext))) {
          collector.addCritical(
            `Invalid file extension. Expected one of: ${VALID_FILE_EXTENSIONS.join(", ")}.`,
          );
          return collector.createFailureResult<AnkiPackage>();
        }

        // Check file properties before attempting to unzip
        const fileStats = await stat(filepath);
        if (fileStats.size === 0) {
          collector.addCritical(
            "The file is empty (0 bytes). This may indicate a failed download or file transfer. Please re-export your deck from Anki.",
          );
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Read first 4 bytes to check for ZIP magic number
        const fileHandle = await readFile(filepath);
        const hasZipMagic =
          fileHandle.length >= 4 &&
          fileHandle[0] === 0x50 && // P
          fileHandle[1] === 0x4b && // K
          (fileHandle[2] === 0x03 || fileHandle[2] === 0x05) && // 0x03 for local file, 0x05 for empty archive
          (fileHandle[3] === 0x04 || fileHandle[3] === 0x06); // 0x04 for local file, 0x06 for empty archive

        // Unzip the Anki export file to the temp dir
        // TODO: Use zip.js for cross platform compatibility
        // https://github.com/gildas-lormeau/zip.js
        let directory: CentralDirectory;
        try {
          directory = await Open.file(filepath);
        } catch (error) {
          if (error instanceof Error && error.message.includes("FILE_ENDED")) {
            if (hasZipMagic) {
              collector.addCritical(
                "The ZIP archive is truncated or corrupted. This typically happens when a download was interrupted. Please re-download or re-export your deck from Anki.",
              );
            } else {
              collector.addCritical(
                "The file is not a valid ZIP archive. Anki packages (.apkg/.colpkg) must be ZIP files. Please ensure you're using a file exported from Anki.",
              );
            }
          } else {
            collector.addCritical(
              `Failed to open the ZIP archive: ${error instanceof Error ? error.message : String(error)}. Please ensure the file is a valid Anki export.`,
            );
          }
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }
        await directory.extract({ path: instance.tempDir });

        // Define paths for required files
        const metaFilePath = join(instance.tempDir, "meta");
        const mediaFilePath = join(instance.tempDir, "media");
        const dbFilePath = join(instance.tempDir, "collection.anki21");

        // Step 1: Check for meta file (required for all Anki exports)
        const metaExists = await stat(metaFilePath)
          .then(() => true)
          .catch(() => false);

        if (!metaExists) {
          collector.addCritical(
            "The Anki package is missing the 'meta' file which contains version information. This file is required for all Anki exports. Please re-export your deck from Anki.",
          );
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Step 2: Read and validate version before checking other files
        const metaFileContent = await readFile(metaFilePath);
        const meta = parseMeta(metaFileContent);

        if (meta.version !== EXPORT_VERSION.valueOf()) {
          collector.addCritical(
            `Unsupported Anki export package version: ${meta.version.toFixed(0)}. Make sure to check "Support older Anki versions" in the Anki export dialog.`,
          );
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Step 3: Check for remaining required files (version-specific)
        const [mediaExists, dbExists] = await Promise.all([
          stat(mediaFilePath)
            .then(() => true)
            .catch(() => false),
          stat(dbFilePath)
            .then(() => true)
            .catch(() => false),
        ]);

        const missingFiles: string[] = [];

        if (!mediaExists) {
          missingFiles.push("media");
          collector.addCritical(
            "The Anki package is missing the 'media' file which contains media file mappings. This file is required for all Anki exports. Please re-export your deck from Anki.",
          );
        }

        if (!dbExists) {
          missingFiles.push("collection.anki21");
          collector.addCritical(
            "The Anki package is missing the 'collection.anki21' database file. This file contains all your cards and decks. Please re-export your deck from Anki.",
          );
        }

        if (missingFiles.length > 0) {
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Read and parse the media mapping file with validation
        const mediaFileContent = await readFile(mediaFilePath);
        const mediaFileString = mediaFileContent.toString().trim();

        // Handle empty media file (valid case - no media)
        if (mediaFileString === "") {
          instance.mediaFiles = {};
        } else {
          // Parse JSON with error handling
          let parsedMedia: unknown;
          try {
            parsedMedia = JSON.parse(mediaFileString);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            collector.addCritical(
              `The media mapping file contains invalid JSON and cannot be parsed: ${errorMessage}. Please re-export your deck from Anki.`,
            );
            const cleanupIssues = await removeDirectory(instance.tempDir);
            collector.addIssues(cleanupIssues);
            return collector.createFailureResult<AnkiPackage>();
          }

          // Validate structure: must be a non-null object (not array)
          if (
            parsedMedia === null ||
            typeof parsedMedia !== "object" ||
            Array.isArray(parsedMedia)
          ) {
            const actualType = Array.isArray(parsedMedia)
              ? "array"
              : parsedMedia === null
                ? "null"
                : typeof parsedMedia;
            collector.addCritical(
              `The media mapping file has an invalid structure. Expected an object mapping media IDs to filenames, but found ${actualType}. Please re-export your deck from Anki.`,
            );
            const cleanupIssues = await removeDirectory(instance.tempDir);
            collector.addIssues(cleanupIssues);
            return collector.createFailureResult<AnkiPackage>();
          }

          // Validate that all values are strings (filenames)
          const mediaRecord = parsedMedia as Record<string, unknown>;
          for (const [key, value] of Object.entries(mediaRecord)) {
            if (typeof value !== "string") {
              const actualType = value === null ? "null" : typeof value;
              collector.addCritical(
                `The media mapping file contains an invalid entry: key '${key}' has a ${actualType} value instead of a filename string. Please re-export your deck from Anki.`,
              );
              const cleanupIssues = await removeDirectory(instance.tempDir);
              collector.addIssues(cleanupIssues);
              return collector.createFailureResult<AnkiPackage>();
            }
          }

          instance.mediaFiles = parsedMedia as MediaFileMapping;
        }

        // Open the collection.anki21 file as the database
        try {
          db = await AnkiDatabase.fromBuffer(await readFile(dbFilePath));
        } catch (error) {
          if (error instanceof AnkiDatabaseError) {
            let userMessage: string;
            switch (error.type) {
              case "empty": {
                userMessage =
                  "The collection.anki21 database file is empty (0 bytes). This may indicate an incomplete export or file corruption. Please re-export your deck from Anki.";
                break;
              }
              case "truncated": {
                userMessage =
                  "The collection.anki21 database file is truncated and too small to be valid. This may indicate an interrupted download or corrupted export. Please re-export your deck from Anki.";
                break;
              }
              case "invalid_header": {
                userMessage =
                  "The collection.anki21 file is not a valid SQLite database. The file may have been corrupted or replaced with non-database content. Please re-export your deck from Anki.";
                break;
              }
              case "corrupted": {
                userMessage = `The collection.anki21 database is corrupted and cannot be opened. ${error.message} Please try re-exporting your deck from Anki, or check if your Anki installation is working correctly.`;
                break;
              }
              default: {
                userMessage = `Database error: ${error.message}`;
              }
            }
            collector.addCritical(userMessage);
            const cleanupIssues = await removeDirectory(instance.tempDir);
            collector.addIssues(cleanupIssues);
            return collector.createFailureResult<AnkiPackage>();
          }
          throw error; // Re-throw non-AnkiDatabaseError errors
        }

        // Validate the database schema has all required tables
        try {
          db.validateSchema();
        } catch (error) {
          if (error instanceof AnkiDatabaseError) {
            const missingTables = error.missingTables
              ? error.missingTables.map((t) => `'${t}'`).join(", ")
              : "unknown tables";
            collector.addCritical(
              `The collection.anki21 database is missing required tables: ${missingTables}. This may indicate a corrupted database or an incompatible Anki version. Please re-export your deck from Anki.`,
            );
            const cleanupIssues = await removeDirectory(instance.tempDir);
            collector.addIssues(cleanupIssues);
            return collector.createFailureResult<AnkiPackage>();
          }
          throw error; // Re-throw non-AnkiDatabaseError errors
        }

        // Read the contents of the database and validate
        const rawDump = await db.toObject();
        instance.databaseContents = filterValidDatabaseItems(rawDump, collector);

        if (instance.databaseContents.collection.ver !== DB_VERSION) {
          collector.addCritical(
            `This Anki file uses database version ${instance.databaseContents.collection.ver.toFixed(0)}, which is not supported. Please export your deck from a compatible Anki version.`,
          );
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Validate media file existence
        for (const [mediaId, filename] of Object.entries(instance.mediaFiles)) {
          const mediaPath = join(instance.tempDir, mediaId);
          const mediaExists = await stat(mediaPath)
            .then(() => true)
            .catch(() => false);

          if (!mediaExists) {
            collector.addWarning(
              `Media file '${filename}' (ID: ${mediaId}) is listed in the media mapping but not found in the package. References to this file may be broken.`,
              { itemType: "media", originalData: { filename, mediaId } },
            );
          }
        }

        return collector.createResult(instance);
      } catch (error) {
        // Handle any remaining errors (non-ZIP related errors like file reading issues)
        collector.addCritical(
          `The Anki export file could not be read. ${error instanceof Error ? error.message : String(error)}.`,
        );

        const cleanupIssues = await removeDirectory(instance.tempDir);
        collector.addIssues(cleanupIssues);
        return collector.createFailureResult<AnkiPackage>();
      } finally {
        await db?.close();
      }
    } catch (error) {
      collector.addCritical(
        `Conversion could not be started due to an unexpected error. ${error instanceof Error ? error.message : String(error)}.`,
      );
      return collector.createFailureResult<AnkiPackage>();
    }
  }

  public static async fromSrsPackage(
    srsPackage: SrsPackage,
    options?: ConversionOptions,
  ): Promise<ConversionResult<AnkiPackage>> {
    const collector = new IssueCollector(options);

    // Start with a new empty AnkiPackage
    const result = await AnkiPackage.fromDefault(options);

    if (result.status === "failure" || !result.data) {
      // Forward any existing issues
      collector.addIssues(result.issues);
      return collector.createFailureResult<AnkiPackage>();
    }

    const ankiPackage = result.data;

    // Remove the default deck
    ankiPackage.removeDeck(defaultDeck.id);

    // Compress the SRS package first to ensure it has no unused entities
    srsPackage.removeUnused();

    // Convert decks
    const decks = srsPackage.getDecks();

    if (decks.length !== 1) {
      const deckNames = decks.map((deck) => `'${deck.name}'`).join(", ");
      collector.addCritical(
        `The package must contain exactly one deck, but found ${decks.length.toFixed(0)} decks: ${deckNames}.`,
        { itemType: "deck" },
      );
      return collector.createFailureResult<AnkiPackage>();
    }

    const deckIDs = new Map<string, number>();
    for (const deck of decks) {
      let deckID = resolveAnkiId(deck.applicationSpecificData, extractTimestampFromUuid(deck.id));

      // Keep incrementing until we find an unused ID
      while ([...deckIDs.values()].includes(deckID)) {
        deckID++;
      }

      deckIDs.set(deck.id, deckID);

      const ankiDecks: Deck = {
        id: deckID,
        mod: 0,
        name: deck.name,
        usn: 0,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: true,
        browserCollapsed: true,
        desc: deck.description ?? "",
        dyn: DeckDynamicity.STATIC,
        conf: 1, // This refers to deck configuration 1, which is the default in Anki
        extendNew: 0,
        extendRev: 0,
        reviewLimit: null,
        newLimit: null,
        reviewLimitToday: null,
        newLimitToday: null,
      };
      ankiPackage.addDeck(ankiDecks);
    }

    // Convert note types
    const noteTypes = srsPackage.getNoteTypes();
    const noteTypeIDs = new Map<string, number>();
    for (const noteType of noteTypes) {
      let noteTypeId = resolveAnkiId(
        noteType.applicationSpecificData,
        extractTimestampFromUuid(noteType.id),
      );

      // Keep incrementing until we find an unused ID
      while ([...noteTypeIDs.values()].includes(noteTypeId)) {
        noteTypeId++;
      }

      noteTypeIDs.set(noteType.id, noteTypeId);

      // Detect if this is a cloze note type by checking template content
      // TODO: This is very Anki-style, we might want to find a cleaner way to
      // do this.
      const isClozeNoteType = noteType.templates.some(
        (template) =>
          template.questionTemplate.includes("{{cloze:") ||
          template.answerTemplate.includes("{{cloze:"),
      );

      const ankiNoteType: NoteType = {
        id: noteTypeId,
        name: noteType.name,
        type: isClozeNoteType ? NoteTypeKind.CLOZE : NoteTypeKind.STANDARD,
        mod: 0,
        usn: 0,
        sortf: 0, // Sort by the first field by default
        did: deckIDs.values().next().value ?? null, // Use the first deck ID. null for type checker only
        tmpls: noteType.templates.map((template) => ({
          id: BigInt(template.id), // TODO: Not sure if this needs to be unique in Anki
          name: template.name,
          ord: template.id,
          qfmt: template.questionTemplate, // TODO: Handle HTML/Markdown conversion if needed
          afmt: template.answerTemplate, // TODO: Handle HTML/Markdown conversion if needed
          bqfmt: "",
          bafmt: "",
          did: null,
          bfont: "",
          bsize: 0,
        })),
        flds: noteType.fields.map((field) => ({
          id: BigInt(field.id), // TODO: Not sure if this needs to be unique in Anki
          name: field.name,
          ord: field.id,
          sticky: false,
          rtl: false,
          font: "Arial",
          size: 20,
          description: field.description ?? "",
          plainText: false,
          collapsed: false,
          excludeFromSearch: false,
          tag: null,
          preventDeletion: false,
        })),
        css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
        latexPre:
          "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        latexPost: "\\end{document}",
        latexsvg: false,
        req: [[0, "any", [0]]],
        originalStockKind: 1,
      };
      ankiPackage.addNoteType(ankiNoteType);
    }

    // Convert notes
    const noteIDs = new Map<string, number>();
    for (const note of srsPackage.getNotes()) {
      let noteId = resolveAnkiId(note.applicationSpecificData, extractTimestampFromUuid(note.id));

      // Keep incrementing until we find an unused ID
      while ([...noteIDs.values()].includes(noteId)) {
        noteId++;
      }

      noteIDs.set(note.id, noteId);
      const noteTypeId = noteTypeIDs.get(note.noteTypeId);
      if (!noteTypeId) {
        collector.addError(
          `Cannot convert note because note type ID ${note.noteTypeId} was not found. This note will be skipped.`,
          {
            itemType: "note",
            originalData: note,
          },
        );
        continue;
      }
      const ankiNotes: NotesTable = {
        id: noteId,
        guid: guid64(),
        mid: noteTypeId,
        mod: 0,
        usn: 0,
        tags: "",
        flds: joinAnkiFields(note.fieldValues.map(([, value]) => value)),
        sfld: note.fieldValues[0]?.[1] ?? "", // Sort field defaults to the first field value
        csum: 0, // TODO: Find out how Anki calculates this and do it that way as well. Not sure if needed or if Anki accepts notes without it.
        flags: 0,
        data: note.applicationSpecificData?.["ankiData"] ?? "",
      };
      ankiPackage.addNote(ankiNotes);
    }

    // Convert cards
    const cardIDs = new Map<string, number>();

    // Group cards by note to not generate duplicate cards
    // TODO: Clean this up
    const cards = srsPackage.getCards();
    const cardsByNote = new Map<string, SrsCard[]>();
    for (const card of cards) {
      const noteCards = cardsByNote.get(card.noteId) ?? [];
      noteCards.push(card);
      cardsByNote.set(card.noteId, noteCards);
    }

    for (const [noteId, cards] of cardsByNote) {
      // Find the note for these cards
      const note = srsPackage.getNotes().find((n) => n.id === noteId);
      if (!note) {
        for (const card of cards) {
          collector.addError(
            "Cannot convert card because its note was not found. The note may not have been converted properly. This card will be skipped.",
            { itemType: "card", originalData: card },
          );
        }
        continue;
      }

      const ankiNoteId = noteIDs.get(note.id);
      if (!ankiNoteId) {
        for (const card of cards) {
          collector.addError(
            `Cannot convert card because note ID ${note.id} was not found. The note may have been skipped earlier. This card will be skipped.`,
            {
              itemType: "card",
              originalData: card,
            },
          );
        }
        continue;
      }

      // TODO: Should probably be ankiDeckId, see below
      const deckId = deckIDs.get(note.deckId);
      if (!deckId) {
        for (const card of cards) {
          collector.addError(
            `Cannot convert card because deck ID ${note.deckId} was not found. The deck may have been skipped earlier. This card will be skipped.`,
            {
              itemType: "card",
              originalData: card,
            },
          );
        }
        continue;
      }

      // Find the corresponding Anki deck ID
      const srsDeck = srsPackage.getDecks().find((d) => d.id === note.deckId);
      // TODO: Check if this is needed and if so, if it needs to also be applied to the deck somewhere above
      const ankiDeckId = srsDeck?.applicationSpecificData?.["originalAnkiId"]
        ? Number(srsDeck.applicationSpecificData["originalAnkiId"])
        : deckId; // fallback to timestamp-based ID

      // Find the note type for this note
      const noteType = srsPackage.getNoteTypes().find((nt) => nt.id === note.noteTypeId);

      // Check if this is a cloze note type by looking at the template content
      // TODO: This is used in multiple places, extract to utility function
      const isClozeNoteType =
        noteType?.templates.some(
          (template) =>
            template.questionTemplate.includes("{{cloze:") ||
            template.answerTemplate.includes("{{cloze:"),
        ) ?? false;

      let cardsToCreate: { ord: number; srsCard: SrsCard }[];

      if (isClozeNoteType) {
        // For cloze notes, analyze the content to determine required ordinals
        const fieldContent = joinAnkiFields(note.fieldValues.map(([, value]) => value));
        const requiredOrdinals = analyzeClozeOrdinals(fieldContent);

        // Map SRS cards to ordinals, ensuring we have all required ordinals
        cardsToCreate = requiredOrdinals.map((ord) => {
          // Try to find an existing SRS card with this ordinal
          const existingCard = cards.find((c) => c.templateId === ord);
          const fallbackCard = cards[0];
          if (!fallbackCard) {
            throw new Error(`No cards available for note ${note.id}`);
          }
          return {
            ord,
            srsCard: existingCard ?? fallbackCard, // Use first card as fallback with correct ordinal
          };
        });
      } else {
        // For regular note types, create cards as normal
        cardsToCreate = cards.map((card) => ({
          ord: card.templateId,
          srsCard: card,
        }));
      }

      // Create the Anki cards
      for (const { ord, srsCard } of cardsToCreate) {
        let cardId = resolveAnkiId(
          srsCard.applicationSpecificData,
          extractTimestampFromUuid(srsCard.id),
        );

        // Keep incrementing until we find an unused ID
        while ([...cardIDs.values()].includes(cardId)) {
          cardId++;
        }

        cardIDs.set(srsCard.id, cardId);

        const ankiCard: CardsTable = {
          id: cardId,
          nid: ankiNoteId,
          did: ankiDeckId,
          ord: ord, // Use the calculated ordinal
          mod: 0,
          usn: 0,
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
          left: 0,
          odue: 0,
          odid: 0,
          flags: 0,
          data: srsCard.applicationSpecificData?.["ankiData"] ?? "{}",
        };
        ankiPackage.addCard(ankiCard);
      }
    }

    for (const review of srsPackage.getReviews()) {
      let ease: Ease;

      switch (review.score) {
        case SrsReviewScore.Again: {
          ease = Ease.AGAIN;
          break;
        }
        case SrsReviewScore.Hard: {
          ease = Ease.HARD;
          break;
        }
        case SrsReviewScore.Normal: {
          ease = Ease.GOOD;
          break;
        }
        case SrsReviewScore.Easy: {
          ease = Ease.EASY;
          break;
        }
        default: {
          collector.addError(
            `Cannot convert review because the score ${String(review.score)} is not valid. Valid review scores are 1 (Again), 2 (Hard), 3 (Normal), 4 (Easy). This review will be skipped.`,
            {
              itemType: "review",
              originalData: review,
            },
          );
          continue;
        }
      }

      const cardId = cardIDs.get(review.cardId);
      if (!cardId) {
        collector.addError(
          `Cannot convert review because card ID ${review.cardId} was not found. The card may have been skipped earlier. This review will be skipped.`,
          {
            itemType: "review",
            originalData: review,
          },
        );
        continue;
      }

      const reviewId = resolveAnkiId(
        review.applicationSpecificData,
        review.timestamp, // Reviews use timestamp as fallback, not UUID extraction
      );

      const ankiReviews: RevlogTable = {
        id: reviewId,
        cid: cardId,
        usn: 0,
        ease: ease,
        ivl: 0, // TODO: Find out how to fill this and "lastIvl", "factor" and "type"
        lastIvl: 0,
        factor: 0,
        time: 0,
        type: 0,
      };
      ankiPackage.addReview(ankiReviews);
    }

    // Forward any issues from the initial result
    collector.addIssues(result.issues);
    return collector.createResult(ankiPackage);
  }

  public async toAnkiExport(filepath: string): Promise<void> {
    if (this.databaseContents === undefined) {
      throw new Error("Database contents not available");
    }

    if (!filepath || filepath.trim() === "") {
      throw new Error("Export filepath cannot be empty");
    }

    // Write the meta file
    const meta = writeMeta({ version: EXPORT_VERSION.valueOf() });
    await writeFile(join(this.tempDir, "meta"), meta);

    // Write the media file mapping
    const media = JSON.stringify(this.mediaFiles, null, 2);
    await writeFile(join(this.tempDir, "media"), media);

    // Write the database
    const db = await AnkiDatabase.fromDump(this.databaseContents);
    const dbBuffer = db.toBuffer();
    await writeFile(join(this.tempDir, "collection.anki21"), dbBuffer);

    // Build list of files to include in zip
    const filesToZip = [
      {
        compress: true,
        path: join(this.tempDir, "collection.anki21"),
      },
      {
        compress: false,
        path: join(this.tempDir, "media"),
      },
      {
        compress: false,
        path: join(this.tempDir, "meta"),
      },
    ];

    // Add all media files to the zip
    for (const mediaId of Object.keys(this.mediaFiles)) {
      filesToZip.push({
        compress: false,
        path: join(this.tempDir, mediaId),
      });
    }

    await createSelectiveZip(filepath, filesToZip);
  }

  public async cleanup(): Promise<ConversionIssue[]> {
    return await removeDirectory(this.tempDir);
  }

  toString(): string {
    let res = "AnkiPackage\n";
    res += `Temp directory: ${this.tempDir}\n`;
    res += `Media file mapping: ${JSON.stringify(this.mediaFiles, null, 2)}\n`;
    res += `Database contents: ${serializeWithBigInts(this.databaseContents, 2)}\n`;
    return res;
  }

  public addDeck(deck: Deck): void {
    if (this.databaseContents === undefined) {
      throw new Error("Database contents not available");
    }
    this.databaseContents.collection.decks[deck.id] = deck;
  }

  public addNote(note: NotesTable): void {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    this.databaseContents.notes.push(note);
  }

  public addCard(card: CardsTable): void {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    this.databaseContents.cards.push(card);
  }

  public addNoteType(noteType: NoteType): void {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    this.databaseContents.collection.models[noteType.id] = noteType;
  }

  public addReview(review: RevlogTable): void {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    this.databaseContents.reviews.push(review);
  }

  public getDecks(): Deck[] {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    return Object.values(this.databaseContents.collection.decks);
  }

  public getNotes(): NotesTable[] {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    return this.databaseContents.notes;
  }

  public getCards(): CardsTable[] {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    return this.databaseContents.cards;
  }

  public getNoteTypes(): NoteType[] {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    return Object.values(this.databaseContents.collection.models);
  }

  public getReviews(): RevlogTable[] {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    return this.databaseContents.reviews;
  }

  public getConfig(): Config {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    return this.databaseContents.collection.conf;
  }

  public removeDeck(deckId: number): void {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }

    if (this.databaseContents.collection.decks[deckId]) {
      this.databaseContents.collection.decks = Object.fromEntries(
        Object.entries(this.databaseContents.collection.decks).filter(
          ([key]) => key !== deckId.toFixed(0),
        ),
      );
    } else {
      throw new Error(`Deck with ID ${deckId.toFixed(0)} does not exist`);
    }
  }

  /**
   * Returns a list of all media filenames available in the package.
   * @returns Array of media filenames
   */
  public listMediaFiles(): string[] {
    return Object.values(this.mediaFiles);
  }

  /**
   * Retrieves the size of a specific media file.
   * @param filename - The name of the media file to get the size for
   * @returns Promise resolving to the file size in bytes
   * @throws {Error} if the file is not found in the package
   */
  public async getMediaFileSize(filename: string): Promise<number> {
    // Find the media file ID from the filename
    const mediaId = Object.entries(this.mediaFiles).find(([, name]) => name === filename)?.[0];

    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' not found in package`);
    }

    const filePath = join(this.tempDir, mediaId);

    try {
      const stats = await stat(filePath);
      return stats.size;
    } catch (error) {
      throw new Error(
        `Failed to get size for media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retrieves a media file as a ReadableStream for efficient streaming.
   * @param filename - The name of the media file to retrieve
   * @returns A ReadableStream for the media file
   * @throws {Error} if the file is not found in the package
   */
  public getMediaFile(filename: string): Readable {
    // Find the media file ID from the filename
    const mediaId = Object.entries(this.mediaFiles).find(([, name]) => name === filename)?.[0];

    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' not found in package`);
    }

    const filePath = join(this.tempDir, mediaId);

    // Always return a readable stream for consistency
    return createReadStream(filePath);
  }

  /**
   * Adds a media file to the package.
   * @param filename - The name for the media file (e.g., "image.jpg")
   * @param source - The source of the media file (file path, Buffer, or Readable stream)
   * @throws {Error} if the filename already exists in the package
   * @throws {Error} if the source file cannot be read or processed
   */
  public async addMediaFile(filename: string, source: string | Buffer | Readable): Promise<void> {
    // Check if filename already exists
    const existingFile = Object.values(this.mediaFiles).find((name) => name === filename);
    if (existingFile !== undefined) {
      throw new Error(`Media file '${filename}' already exists in package`);
    }

    // Generate unique media ID (next available number)
    const existingIds = Object.keys(this.mediaFiles).map((id) => Number.parseInt(id, 10));
    const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
    const mediaId = nextId.toFixed(0);

    const targetPath = join(this.tempDir, mediaId);

    try {
      if (typeof source === "string") {
        // Source is a file path - copy it
        await copyFile(source, targetPath);
      } else if (Buffer.isBuffer(source)) {
        // Source is a Buffer - write it
        await writeFile(targetPath, source);
      } else {
        // Source is a Readable stream - pipe it
        const writeStream = createWriteStream(targetPath);
        await pipeline(source, writeStream);
      }

      // Update media mapping
      this.mediaFiles[Number.parseInt(mediaId, 10)] = filename;
    } catch (error) {
      throw new Error(
        `Failed to add media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Removes a media file from the package.
   * @param filename - The name of the media file to remove (e.g., "image.jpg")
   * @throws {Error} if the file does not exist in the package
   * @throws {Error} if the file cannot be deleted from disk
   */
  public async removeMediaFile(filename: string): Promise<void> {
    // Find the media file ID from the filename
    const mediaEntry = Object.entries(this.mediaFiles).find(([, name]) => name === filename);

    if (mediaEntry === undefined) {
      throw new Error(`Media file '${filename}' does not exist in package`);
    }

    const [mediaId] = mediaEntry;
    const filePath = join(this.tempDir, mediaId);

    try {
      // Remove the physical file from disk
      await rm(filePath);

      // Remove from media mapping by creating new object without the key
      const numericId = Number.parseInt(mediaId, 10);
      this.mediaFiles = Object.fromEntries(
        Object.entries(this.mediaFiles).filter(([key]) => Number.parseInt(key, 10) !== numericId),
      );
    } catch (error) {
      throw new Error(
        `Failed to remove media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Removes all media files that are not referenced by any notes.
   * Scans all note fields for media references and removes files that are not found.
   *
   * Common Anki media reference formats:
   * - Images: `<img src="filename.jpg">`
   * - Audio/Video: `[sound:filename.mp3]` (Anki uses `[sound:]` for both audio and video)
   *
   * The regex pattern used for detection can be easily modified if additional formats are discovered.
   * @returns Array of filenames that were removed
   * @throws {Error} if database contents are not available
   */
  public async removeUnreferencedMediaFiles(): Promise<string[]> {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }

    // Regex pattern for detecting media references in Anki notes
    // This pattern can be easily modified if we discover additional formats
    // Matches:
    // - <img src="filename.ext"> and variants (with/without quotes)
    // - [sound:filename.ext] (used for both audio and video in Anki)
    const mediaReferencePattern = /<img[^>]+src=["']?([^"'>\s]+)["']?|\[sound:([^\]]+)\]/gi;

    // Collect all referenced filenames from all notes
    const referencedFiles = new Set<string>();
    const notes = this.getNotes();

    for (const note of notes) {
      const fields = splitAnkiFields(note.flds);
      for (const field of fields) {
        // Use matchAll() to avoid lastIndex issues with global regex
        for (const match of field.matchAll(mediaReferencePattern)) {
          // match[1] contains img src, match[2] contains sound filename
          const filename = match[1] ?? match[2];
          if (filename) {
            referencedFiles.add(filename);
          }
        }
      }
    }

    // Find unreferenced files
    const allMediaFiles = Object.values(this.mediaFiles);
    const unreferencedFiles = allMediaFiles.filter((filename) => !referencedFiles.has(filename));

    // Remove unreferenced files
    for (const filename of unreferencedFiles) {
      await this.removeMediaFile(filename);
    }

    return unreferencedFiles;
  }

  /**
   * Converts the AnkiPackage to an SrsPackage.
   * This method transforms Anki data structures into the universal SRS format.
   * @param options - Configuration options for the conversion process
   * @returns A new SrsPackage containing the converted data
   */
  public toSrsPackage(options?: ConversionOptions): ConversionResult<SrsPackage> {
    const collector = new IssueCollector(options);

    if (!this.databaseContents) {
      collector.addCritical(
        "The Anki database could not be loaded, so conversion to SRS format is not possible.",
      );
      return collector.createFailureResult<SrsPackage>();
    }

    const srsPackage = new SrsPackage();

    // Step 1: Convert and add decks
    const ankiToSrsDeckMap = new Map<number, string>();

    for (const [deckId, ankiDeck] of Object.entries(this.databaseContents.collection.decks)) {
      const deckData: Parameters<typeof createDeck>[0] = {
        applicationSpecificData: {
          ankiDeckData: JSON.stringify(ankiDeck),
          originalAnkiId: deckId,
        },
        name: ankiDeck.name,
      };

      if (ankiDeck.desc) {
        deckData.description = ankiDeck.desc;
      }

      const srsDeck = createDeck(deckData);
      srsPackage.addDeck(srsDeck);
      ankiToSrsDeckMap.set(Number(deckId), srsDeck.id);
    }

    // Step 2: Convert and add note types
    const ankiToSrsNoteTypeMap = new Map<string, string>();

    for (const [noteTypeId, ankiNoteType] of Object.entries(
      this.databaseContents.collection.models,
    )) {
      const srsNoteType = createNoteType({
        applicationSpecificData: {
          originalAnkiId: noteTypeId,
        },
        fields: ankiNoteType.flds.map((field, index) => {
          const srsField: { id: number; name: string; description?: string } = {
            id: index,
            name: field.name,
          };
          if (field.description) {
            srsField.description = field.description;
          }
          return srsField;
        }),
        name: ankiNoteType.name,
        templates: ankiNoteType.tmpls.map((template, index) => ({
          answerTemplate: template.afmt,
          applicationSpecificData: {
            ankiTemplateData: serializeWithBigInts(template),
          },
          id: index,
          name: template.name,
          questionTemplate: template.qfmt,
        })),
      });
      srsPackage.addNoteType(srsNoteType);
      ankiToSrsNoteTypeMap.set(noteTypeId, srsNoteType.id);
    }

    // Step 3: Analyze cards to determine note-to-deck relationships
    // In Anki, decks are associated with cards, but in SRS they're associated with notes
    // We'll map each note to the deck of its first card
    const noteIdToDeckId = new Map<number, number>();

    for (const ankiCard of this.databaseContents.cards) {
      if (!noteIdToDeckId.has(ankiCard.nid)) {
        noteIdToDeckId.set(ankiCard.nid, ankiCard.did);
      }
    }

    // Build deck mapping - now using the map created in Step 1
    for (const ankiCard of this.databaseContents.cards) {
      if (!noteIdToDeckId.has(ankiCard.nid)) {
        noteIdToDeckId.set(ankiCard.nid, ankiCard.did);
      }
    }

    // Step 4: Convert and add notes
    const ankiToSrsNoteMap = new Map<number, string>();

    for (const ankiNote of this.databaseContents.notes) {
      const srsNoteTypeId = ankiToSrsNoteTypeMap.get(ankiNote.mid.toFixed(0));
      const ankiDeckId = noteIdToDeckId.get(ankiNote.id) ?? 1; // Default to deck 1
      const srsDeckId = ankiToSrsDeckMap.get(ankiDeckId);

      if (!srsNoteTypeId || !srsDeckId) {
        collector.addError(
          `Cannot convert note ${ankiNote.id.toFixed(0)} because note type or deck mapping is missing. This note will be skipped.`,
          {
            itemType: "note",
            originalData: ankiNote,
          },
        );
        continue;
      }

      const srsNoteType = srsPackage.getNoteTypes().find((nt) => nt.id === srsNoteTypeId);
      if (!srsNoteType) {
        collector.addError(
          `Cannot convert note ${ankiNote.id.toFixed(0)} because its note type was not found. This note will be skipped.`,
          {
            itemType: "note",
            originalData: ankiNote,
          },
        );
        continue;
      }

      const fieldValues = splitAnkiFields(ankiNote.flds);
      const noteFieldValues: [string, string][] = srsNoteType.fields.map((field, index) => [
        field.name,
        fieldValues[index] ?? "",
      ]);

      const srsNote = createNote(
        {
          applicationSpecificData: {
            ankiData: ankiNote.data,
            ankiGuid: ankiNote.guid,
            ankiTags: ankiNote.tags,
            originalAnkiId: ankiNote.id.toFixed(0),
          },
          deckId: srsDeckId,
          fieldValues: noteFieldValues,
          noteTypeId: srsNoteTypeId,
        },
        srsNoteType,
      );

      srsPackage.addNote(srsNote);
      if (ankiNote.id) {
        ankiToSrsNoteMap.set(ankiNote.id, srsNote.id);
      }
    }

    // Step 5: Convert and add cards
    const ankiToSrsCardMap = new Map<number, string>();

    for (const ankiCard of this.databaseContents.cards) {
      try {
        const srsNoteId = ankiToSrsNoteMap.get(ankiCard.nid);
        if (!srsNoteId) {
          const deck = this.databaseContents.collection.decks[ankiCard.did];
          collector.addCardError(
            `Note not found for ${this.getCardDescription(ankiCard, undefined, deck)} - Skipping card`,
            ankiCard,
          );
          continue;
        }

        const srsCard = createCard({
          applicationSpecificData: {
            // TODO: Check which of these fields actually need to be stored. Maybe extract a type.
            ankiData: ankiCard.data,
            ankiDue: ankiCard.due.toFixed(0),
            ankiQueue: ankiCard.queue.toString(),
            ankiType: ankiCard.type.toString(),
            originalAnkiId: ankiCard.id?.toFixed() ?? "",
          },
          noteId: srsNoteId,
          templateId: ankiCard.ord,
        });

        srsPackage.addCard(srsCard);
        if (ankiCard.id) {
          ankiToSrsCardMap.set(ankiCard.id, srsCard.id);
        }
      } catch (error) {
        const note = this.databaseContents.notes.find((n) => n.id === ankiCard.nid);
        const deck = this.databaseContents.collection.decks[ankiCard.did];

        collector.addCardError(
          `Failed to convert ${this.getCardDescription(ankiCard, note, deck)}: ${error instanceof Error ? error.message : String(error)}`,
          ankiCard,
        );
      }
    }

    // Step 6: Convert and add reviews
    for (const ankiReview of this.databaseContents.reviews) {
      try {
        const srsCardId = ankiToSrsCardMap.get(ankiReview.cid);
        if (!srsCardId) {
          collector.addReviewError(
            `Card not found for ${this.getReviewDescription(ankiReview)} - Skipping review`,
            ankiReview,
          );
          continue;
        }

        // Check for null review ID
        if (ankiReview.id === null) {
          // Find the card and related data for better error messages
          const ankiCard = this.databaseContents.cards.find((c) => c.id === ankiReview.cid);
          const note = ankiCard
            ? this.databaseContents.notes.find((n) => n.id === ankiCard.nid)
            : undefined;
          const deck = ankiCard ? this.databaseContents.collection.decks[ankiCard.did] : undefined;

          collector.addReviewError(
            `Review ID is undefined for ${this.getReviewDescription(ankiReview, ankiCard, note, deck)} - Skipping review`,
            ankiReview,
          );
          continue;
        }

        // Check for invalid review score
        if (![Ease.AGAIN, Ease.HARD, Ease.GOOD, Ease.EASY].includes(ankiReview.ease)) {
          // Find the card and related data for better error messages
          const ankiCard = this.databaseContents.cards.find((c) => c.id === ankiReview.cid);
          const note = ankiCard
            ? this.databaseContents.notes.find((n) => n.id === ankiCard.nid)
            : undefined;
          const deck = ankiCard ? this.databaseContents.collection.decks[ankiCard.did] : undefined;

          collector.addReviewError(
            `Unknown review score ${ankiReview.ease.toString()} for ${this.getReviewDescription(ankiReview, ankiCard, note, deck)} - Skipping review`,
            ankiReview,
          );
          continue;
        }

        // Map Anki review scores to SRS scores
        // Anki: 1=again, 2=hard, 3=good, 4=easy
        // SRS: 1=again, 2=hard, 3=normal, 4=easy
        let srsScore: SrsReviewScore;
        switch (ankiReview.ease) {
          case Ease.AGAIN: {
            srsScore = SrsReviewScore.Again;
            break;
          }
          case Ease.HARD: {
            srsScore = SrsReviewScore.Hard;
            break;
          }
          case Ease.GOOD: {
            srsScore = SrsReviewScore.Normal;
            break;
          }
          case Ease.EASY: {
            srsScore = SrsReviewScore.Easy;
            break;
          }
        }
        const srsReview = createReview({
          cardId: srsCardId,
          timestamp: ankiReview.id, // Anki review ID is the timestamp
          score: srsScore,
          applicationSpecificData: {
            originalAnkiId: ankiReview.id.toFixed(0),
          },
        });

        srsPackage.addReview(srsReview);
      } catch (error) {
        const ankiCard = this.databaseContents.cards.find((c) => c.id === ankiReview.cid);
        const note = ankiCard
          ? this.databaseContents.notes.find((n) => n.id === ankiCard.nid)
          : undefined;
        const deck = ankiCard ? this.databaseContents.collection.decks[ankiCard.did] : undefined;

        collector.addReviewError(
          `Failed to convert ${this.getReviewDescription(ankiReview, ankiCard, note, deck)}: ${error instanceof Error ? error.message : String(error)}`,
          ankiReview,
        );
      }
    }

    // Step 7: Clean up unused entities
    srsPackage.removeUnused();

    return collector.createResult(srsPackage);
  }
}

interface MetaMessage {
  version: number;
}

function parseMeta(buffer: Uint8Array): MetaMessage {
  const root = new protobuf.Root();
  const Meta = new protobuf.Type("Meta").add(new protobuf.Field("version", 1, "int32", "required"));
  root.add(Meta);

  // Cast the decoded message to our interface
  return Meta.decode(buffer) as unknown as MetaMessage;
}

function writeMeta(message: MetaMessage): Uint8Array {
  const root = new protobuf.Root();
  const Meta = new protobuf.Type("Meta").add(new protobuf.Field("version", 1, "int32", "required"));
  root.add(Meta);

  return Meta.encode(message).finish();
}

async function makeTempDir(): Promise<string> {
  // Use the node.js fs module to create a temporary directory
  // TODO: Use platform specific temp directory (Browser, Tauri, etc.)

  return await mkdtemp(join(tmpdir(), "srsconverter-"));
}

async function removeDirectory(dirPath: string): Promise<ConversionIssue[]> {
  const issues: ConversionIssue[] = [];

  try {
    await rm(dirPath, { recursive: true });
  } catch (error) {
    issues.push({
      context: {
        originalData: error,
      },
      message:
        "Could not clean up temporary files after conversion. This does not affect your converted data.",
      severity: "warning",
    });
  }

  return issues;
}
