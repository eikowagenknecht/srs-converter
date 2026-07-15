import { platform } from "#platform";
import type { ConversionIssue, ConversionOptions, ConversionResult } from "@/error-handling";
import { IssueCollector } from "@/error-handling";
import { MediaStore } from "@/media-store";
import type {
  SrsCard,
  SrsDeck,
  SrsNote,
  SrsNoteField,
  SrsNoteTemplate,
  SrsNoteType,
  SrsReview,
} from "@/srs-package";
import {
  SrsPackage,
  SrsReviewScore,
  createCard,
  createDeck,
  createNote,
  createNoteType,
  createReview,
} from "@/srs-package";
import type { MediaStorage } from "@/storage";

import { mediaEntriesCodec } from "./anki-proto";
import { defaultDeck } from "./constants";
import type { ModernCollectionData } from "./database";
import { AnkiDatabase, AnkiDatabaseError } from "./database";
import { ANKI_SCHEMA_KEY, ANKI_SCHEMA_MODERN, fromStorable, toStorable } from "./native-blobs";
import { decodePackageMeta, encodePackageMeta } from "./protobuf-wire";
import type {
  ConfigRow,
  DeckConfigProtoBundle,
  DeckProtoBundle,
  NotetypeProtoBundle,
  TagRow,
} from "./schema-convert";
import {
  configRowsToConfJson,
  deckConfigProtoToSchema11,
  deckProtoToSchema11,
  notetypeProtoToSchema11,
  tagRowsToTagsJson,
} from "./schema-convert";
import { sha1Async } from "./sha1";
import type {
  CardsTable,
  Config,
  DatabaseDump,
  Deck,
  DeckConfigs,
  MediaFileMapping,
  NoteType,
  NotesTable,
  RevlogTable,
} from "./types";
import { DeckDynamicity, Ease, ExportVersion, NoteTypeKind } from "./types";
import {
  bytesEqual,
  extractMediaReferences,
  extractTimestampFromUuid,
  fieldChecksum,
  generateUniqueIdFromUuid,
  guid64,
  joinAnkiFields,
  parseJsonWithBigInts,
  serializeWithBigInts,
  splitAnkiFields,
  stripHtml,
} from "./util";
import type { ZipOutEntry } from "./zip";
import { buildZip, readZipEntries } from "./zip";

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
  // NOTE: {{c0::...}} is NOT a valid cloze deletion - clozes start from c1.
  // The body is matched non-greedily (`.*?`) so a `}` inside the cloze content
  // (e.g. MathJax `\(x^{2}\)`) does not end the match early, and the `s` flag
  // lets a multi-line cloze body match. Mirrors Anki's rslib cloze pattern.
  const clozeRegex = /\{\{c(?<ordinal>[1-9]\d*)::.*?\}\}/gsu;

  const clozeNumbers = [...fieldContent.matchAll(clozeRegex)]
    .map((match) => match.groups?.["ordinal"])
    .filter((group): group is string => group !== undefined)
    .map((group) => Math.trunc(Number(group)) - 1) // Convert to 0-based ordinals
    .filter((ordinal, index, arr) => arr.indexOf(ordinal) === index) // Remove duplicates
    .sort((a, b) => a - b);

  return clozeNumbers;
}

/**
 * Extracts the field names referenced through a `cloze` filter chain in a single
 * Anki template string.
 *
 * Anki mustache tags may chain filters with `:` (applied right-to-left); the
 * last colon-segment is the field name. A tag references a field for cloze
 * generation when one of its leading segments is exactly `cloze` — this handles
 * both `{{cloze:Text}}` and chained filters such as `{{type:cloze:Text}}`.
 * @param templateContent - The raw question/answer template string
 * @returns The cloze-referenced field names found in the template
 */
function clozeFieldsInTemplate(templateContent: string): string[] {
  const fields: string[] = [];
  for (const match of templateContent.matchAll(/\{\{(?<body>.*?)\}\}/gsu)) {
    const body = match.groups?.["body"];
    if (body === undefined) {
      continue;
    }
    const segments = body.split(":").map((segment) => segment.trim());
    const fieldName = segments.at(-1);
    if (fieldName !== undefined && fieldName !== "" && segments.slice(0, -1).includes("cloze")) {
      fields.push(fieldName);
    }
  }
  return fields;
}

/**
 * Determines whether an SRS note type is a cloze note type by scanning its
 * templates for a `{{cloze:...}}` filter reference (question or answer side).
 * @param noteType - The SRS note type to inspect
 * @returns True when any template references a field through a cloze filter
 */
function isClozeSrsNoteType(noteType: SrsNoteType): boolean {
  return noteType.templates.some(
    (template) =>
      clozeFieldsInTemplate(template.questionTemplate).length > 0 ||
      clozeFieldsInTemplate(template.answerTemplate).length > 0,
  );
}

/**
 * Collects the field names a cloze note type scans for cloze deletions: those
 * referenced through a `{{cloze:...}}` filter in a question template (Anki only
 * generates cloze cards from question-side cloze references).
 * @param noteType - The SRS note type to inspect
 * @returns The set of question-referenced cloze field names
 */
function clozeFieldNamesForNoteType(noteType: SrsNoteType): Set<string> {
  const names = new Set<string>();
  for (const template of noteType.templates) {
    for (const field of clozeFieldsInTemplate(template.questionTemplate)) {
      names.add(field);
    }
  }
  return names;
}

/**
 * Plans the cards a cloze note must produce, pairing each required cloze ordinal
 * with its SRS card.
 *
 * Only the fields referenced through a `{{cloze:...}}` question template are
 * scanned for cloze deletions (S2); if the note type references none, all fields
 * are scanned and a warning is emitted. Ordinals without a matching SRS card
 * yield a fabricated fresh card (`srsCard: undefined`, S1) plus a warning; SRS
 * cards whose ordinal no longer appears in the content are dropped with a
 * warning.
 * @param note - The SRS note being converted
 * @param noteType - The note's cloze note type
 * @param noteCards - The SRS cards belonging to the note
 * @param collector - Issue collector for the S1/S2 warnings
 * @returns One entry per required ordinal: its ordinal and matching SRS card (or `undefined` to fabricate)
 */
function planClozeCards(
  note: SrsNote,
  noteType: SrsNoteType,
  noteCards: SrsCard[],
  collector: IssueCollector,
): { ord: number; srsCard: SrsCard | undefined }[] {
  const clozeFieldNames = clozeFieldNamesForNoteType(noteType);
  let fieldsToScan: string[];
  if (clozeFieldNames.size > 0) {
    fieldsToScan = note.fieldValues
      .filter(([name]) => clozeFieldNames.has(name))
      .map(([, value]) => value);
  } else {
    collector.addWarning(
      `Cloze note type "${noteType.name}" has no field referenced by a {{cloze:...}} question template; scanning all fields for cloze deletions instead.`,
      { itemType: "note", originalData: note },
    );
    fieldsToScan = note.fieldValues.map(([, value]) => value);
  }

  const requiredOrdinals = [
    ...new Set(fieldsToScan.flatMap((value) => analyzeClozeOrdinals(value))),
  ].sort((a, b) => a - b);
  const requiredOrdinalSet = new Set(requiredOrdinals);

  // An SRS card whose ordinal no longer appears in the content is orphaned and
  // dropped — surface it instead of dropping silently.
  for (const card of noteCards) {
    if (!requiredOrdinalSet.has(card.templateId)) {
      collector.addWarning(
        `Card for cloze deletion c${(card.templateId + 1).toFixed(0)} of note ${note.id} was dropped because that cloze deletion no longer appears in the note content.`,
        { itemType: "card", originalData: card },
      );
    }
  }

  return requiredOrdinals.map((ord) => {
    const existingCard = noteCards.find((card) => card.templateId === ord);
    if (!existingCard) {
      collector.addWarning(
        `Cloze deletion c${(ord + 1).toFixed(0)} of note ${note.id} has no card in the package; created a new card.`,
        { itemType: "card", originalData: note },
      );
    }
    return { ord, srsCard: existingCard };
  });
}

/**
 * Builds a short, human-readable label for an SRS note from its first field
 * value, falling back to the note id when the field is empty. Mirrors the
 * HTML-stripping and truncation used by {@link AnkiPackage.getCardDescription}.
 * @param note - The SRS note to describe
 * @returns A trimmed, HTML-stripped preview of the first field, or the note id
 */
function describeSrsNote(note: SrsNote): string {
  const firstValue = note.fieldValues[0]?.[1] ?? "";
  const cleanText = firstValue.replaceAll(/<[^>]*>/gu, "").trim();
  const preview = cleanText.length > 50 ? `${cleanText.slice(0, 47)}...` : cleanText;
  return preview.length > 0 ? preview : note.id;
}

/**
 * Turns the report from {@link SrsPackage.removeUnused} into warning issues so
 * that pruned decks, note types, and card-less notes are surfaced to the caller
 * instead of vanishing silently. Warnings do not demote a conversion's status.
 * @param report - The entities removed by {@link SrsPackage.removeUnused}
 * @param collector - Issue collector that receives one warning per removed entity
 */
function warnRemovedEntities(
  report: {
    removedDecks: SrsDeck[];
    removedNoteTypes: SrsNoteType[];
    removedNotes: SrsNote[];
  },
  collector: IssueCollector,
): void {
  for (const deck of report.removedDecks) {
    collector.addWarning(`Deck '${deck.name}' contains no notes and was not converted.`, {
      itemType: "deck",
      originalData: deck,
    });
  }
  for (const noteType of report.removedNoteTypes) {
    collector.addWarning(
      `Note type '${noteType.name}' is not used by any note and was not converted.`,
      { itemType: "noteType", originalData: noteType },
    );
  }
  for (const note of report.removedNotes) {
    collector.addWarning(`Note '${describeSrsNote(note)}' has no cards and was not converted.`, {
      itemType: "note",
      originalData: note,
    });
  }
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

/**
 * Matches a canonical UUID: 8-4-4-4-12 hyphen-separated hex groups. Deliberately
 * not version-specific — any hyphenated hex UUID (v4, v7, …) yields a usable
 * timestamp via {@link extractTimestampFromUuid}, whereas a hand-authored id
 * like `"deck-1"` does not and must take the hash path instead.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Derives a stable Anki id from an SRS entity's string id, used as the fallback
 * when no `originalAnkiId` was preserved.
 *
 * For UUIDs the embedded millisecond timestamp is extracted (UUIDv7 ids sort
 * like Anki's own timestamp ids). For non-UUID ids,
 * {@link extractTimestampFromUuid} would hex-parse arbitrary leading characters
 * into a tiny, collision-prone number (e.g. `"deck-1"` → 3564), so a hash of the
 * whole id is used instead.
 * @param srsId - The SRS entity id (a UUID for library-generated entities)
 * @returns A positive Anki id derived from the SRS id
 */
function srsIdToAnkiId(srsId: string): number {
  return UUID_PATTERN.test(srsId)
    ? extractTimestampFromUuid(srsId)
    : generateUniqueIdFromUuid(srsId);
}

/**
 * Default CSS applied to note types that carry no captured Anki model (i.e.
 * SRS-authored packages). Mirrors Anki's stock styling.
 */
const DEFAULT_MODEL_CSS =
  ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n";
const DEFAULT_MODEL_LATEX_PRE =
  "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n";
const DEFAULT_MODEL_LATEX_POST = String.raw`\end{document}`;

/**
 * Parses a captured Anki entity blob from `applicationSpecificData`.
 *
 * Returns `undefined` (silently) when the blob is absent — the entity was
 * SRS-authored and never had one. When the blob is present but cannot be
 * parsed, a warning is recorded and `undefined` is returned so the caller falls
 * back to defaults instead of throwing.
 * @param serialized - The serialized blob, or undefined when the key is absent
 * @param entityDescription - Human-readable entity name for warning messages
 * @param collector - Issue collector for the warning
 * @param parse - JSON parser (defaults to `JSON.parse`; note types pass `parseJsonWithBigInts`)
 * @returns The parsed blob, or `undefined` to signal "use defaults"
 */
function parseAnkiBlob<T>(
  serialized: string | undefined,
  entityDescription: string,
  collector: IssueCollector,
  parse: (json: string) => unknown = (json) => JSON.parse(json),
): T | undefined {
  if (serialized === undefined) {
    return undefined;
  }

  try {
    return parse(serialized) as T;
  } catch (error) {
    collector.addWarning(
      `Could not restore the original Anki data for ${entityDescription}; using default values instead. ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Whether an entity's blobs are stored in the modern decoded-proto dialect
 * (ADR-0016 schema marker).
 * @param applicationSpecificData - The entity's application-specific data
 * @returns True when the blobs need proto→11 conversion before use
 */
function isModernBlobSource(applicationSpecificData: Record<string, string> | undefined): boolean {
  return applicationSpecificData?.[ANKI_SCHEMA_KEY] === ANKI_SCHEMA_MODERN;
}

/**
 * Parses a modern-dialect blob (decoded-proto JSON per ADR-0016) and converts
 * it to the schema-11 base the Legacy 2 writer works with — the write-time
 * schema crossing.
 * @param serialized - The stored blob
 * @param entityDescription - Human-readable description for warnings
 * @param collector - Issue collector for restore warnings
 * @param convert - The proto→11 conversion for this entity kind
 * @returns The schema-11 base, or undefined when missing/unparseable
 */
function parseModernBlob<T>(
  serialized: string | undefined,
  entityDescription: string,
  collector: IssueCollector,
  convert: (native: unknown) => unknown,
): T | undefined {
  if (serialized === undefined) {
    return undefined;
  }
  try {
    return convert(fromStorable(parseJsonWithBigInts(serialized))) as T;
  } catch (error) {
    collector.addWarning(
      `Could not restore the original Anki data for ${entityDescription}; using default values instead. ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Reconstructs an Anki deck, restoring the full captured deck JSON as the base
 * and overlaying the SRS-owned fields (id, name, description).
 * @param srsDeck - The SRS deck being converted
 * @param deckId - The resolved Anki deck id
 * @param collector - Issue collector for restore warnings
 * @returns The reconstructed Anki deck
 */
function restoreAnkiDeck(srsDeck: SrsDeck, deckId: number, collector: IssueCollector): Deck {
  const base = isModernBlobSource(srsDeck.applicationSpecificData)
    ? parseModernBlob<Deck>(
        srsDeck.applicationSpecificData?.["ankiDeck"],
        `deck "${srsDeck.name}"`,
        collector,
        (native) => deckProtoToSchema11(native as DeckProtoBundle),
      )
    : parseAnkiBlob<Deck>(
        srsDeck.applicationSpecificData?.["ankiDeck"],
        `deck "${srsDeck.name}"`,
        collector,
      );

  if (base) {
    return {
      ...base,
      id: deckId,
      name: srsDeck.name,
      desc: srsDeck.description ?? base.desc,
    };
  }

  return {
    id: deckId,
    mod: 0,
    name: srsDeck.name,
    usn: 0,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: true,
    browserCollapsed: true,
    desc: srsDeck.description ?? "",
    dyn: DeckDynamicity.STATIC,
    conf: 1, // Deck configuration 1 is Anki's default preset
    extendNew: 0,
    extendRev: 0,
    reviewLimit: null,
    newLimit: null,
    reviewLimitToday: null,
    newLimitToday: null,
  };
}

/**
 * Builds a default Anki template for an SRS template that has no captured
 * counterpart (SRS-authored, or a structural-drift extra).
 * @param template - The SRS template
 * @param ord - The template ordinal (array position)
 * @returns A default Anki template
 */
function defaultAnkiTemplate(template: SrsNoteTemplate, ord: number): NoteType["tmpls"][number] {
  return {
    id: BigInt(template.id),
    name: template.name,
    ord,
    qfmt: template.questionTemplate,
    afmt: template.answerTemplate,
    bqfmt: "",
    bafmt: "",
    did: null,
    bfont: "",
    bsize: 0,
  };
}

/**
 * Builds a default Anki field for an SRS field that has no captured counterpart.
 * @param field - The SRS field
 * @param ord - The field ordinal (array position)
 * @returns A default Anki field
 */
function defaultAnkiField(field: SrsNoteField, ord: number): NoteType["flds"][number] {
  return {
    id: BigInt(field.id),
    name: field.name,
    ord,
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
  };
}

/**
 * Reconstructs an Anki note type. The captured model JSON is the base; the SRS
 * format owns the id, name, field names/descriptions and template
 * names/qfmt/afmt (matched to the blob by position). Everything else — css,
 * latex, sortf, req, template/field ids and props, plugin keys — comes from the
 * blob. SRS structure is authoritative: extra SRS fields/templates get
 * generated defaults, extra blob entries are dropped.
 * @param srsNoteType - The SRS note type being converted
 * @param noteTypeId - The resolved Anki note type id
 * @param fallbackDeckId - Deck id to assign when no blob is present
 * @param collector - Issue collector for restore warnings
 * @returns The reconstructed Anki note type
 */
function restoreAnkiNoteType(
  srsNoteType: SrsNoteType,
  noteTypeId: number,
  fallbackDeckId: number | null,
  collector: IssueCollector,
): NoteType {
  const base = isModernBlobSource(srsNoteType.applicationSpecificData)
    ? parseModernBlob<NoteType>(
        srsNoteType.applicationSpecificData?.["ankiNoteType"],
        `note type "${srsNoteType.name}"`,
        collector,
        (native) => notetypeProtoToSchema11(native as NotetypeProtoBundle),
      )
    : parseAnkiBlob<NoteType>(
        srsNoteType.applicationSpecificData?.["ankiNoteType"],
        `note type "${srsNoteType.name}"`,
        collector,
        parseJsonWithBigInts,
      );

  const tmpls = srsNoteType.templates.map((template, index) => {
    const baseTemplate = base?.tmpls[index];
    if (!baseTemplate) {
      return defaultAnkiTemplate(template, index);
    }
    return {
      ...baseTemplate,
      id: baseTemplate.id ?? BigInt(template.id),
      name: template.name,
      ord: index,
      qfmt: template.questionTemplate,
      afmt: template.answerTemplate,
    };
  });

  const flds = srsNoteType.fields.map((field, index) => {
    const baseField = base?.flds[index];
    if (!baseField) {
      return defaultAnkiField(field, index);
    }
    return {
      ...baseField,
      id: baseField.id ?? BigInt(field.id),
      name: field.name,
      ord: index,
      description: field.description ?? baseField.description,
    };
  });

  if (base) {
    return { ...base, id: noteTypeId, name: srsNoteType.name, tmpls, flds };
  }

  return {
    id: noteTypeId,
    name: srsNoteType.name,
    type: isClozeSrsNoteType(srsNoteType) ? NoteTypeKind.CLOZE : NoteTypeKind.STANDARD,
    mod: 0,
    usn: 0,
    sortf: 0,
    did: fallbackDeckId,
    tmpls,
    flds,
    css: DEFAULT_MODEL_CSS,
    latexPre: DEFAULT_MODEL_LATEX_PRE,
    latexPost: DEFAULT_MODEL_LATEX_POST,
    latexsvg: false,
    // One requirement entry per template (F18): each card needs its first field.
    req: srsNoteType.templates.map((_template, index): [number, "any" | "all", number[]] => [
      index,
      "any",
      [0],
    ]),
    originalStockKind: null,
  };
}

/**
 * Reconstructs an Anki note. The captured note row is the base; the SRS format
 * owns the id, note-type id, joined fields, and the recomputed sort field and
 * checksum. `data` follows the ankiData-key → blob → "" precedence. Guid, tags,
 * mod, usn and flags come from the blob (or defaults when SRS-authored).
 * @param srsNote - The SRS note being converted
 * @param noteId - The resolved Anki note id
 * @param mid - The resolved Anki note type id
 * @param noteType - The already-reconstructed Anki note type (for sortf)
 * @param collector - Issue collector for restore warnings
 * @returns The reconstructed Anki note row
 */
function restoreAnkiNote(
  srsNote: SrsNote,
  noteId: number,
  mid: number,
  noteType: NoteType,
  collector: IssueCollector,
): NotesTable {
  const base = parseAnkiBlob<NotesTable>(
    srsNote.applicationSpecificData?.["ankiNote"],
    `note ${noteId.toFixed(0)}`,
    collector,
  );

  // Order the values by the note type's field order, looking each field up by
  // name (positional fallback when the name is absent) rather than trusting the
  // incoming array order. This keeps `flds`, `sfld` and `csum` correct even if a
  // note's fieldValues arrived out of order.
  const fieldStrings = noteType.flds.map((field, index) => {
    const match = srsNote.fieldValues.find(([name]) => name === field.name);
    return match ? match[1] : (srsNote.fieldValues[index]?.[1] ?? "");
  });
  const flds = joinAnkiFields(fieldStrings);
  const sortIndex =
    noteType.sortf >= 0 && noteType.sortf < fieldStrings.length ? noteType.sortf : 0;
  const sfld = stripHtml(fieldStrings[sortIndex] ?? "");
  const csum = fieldChecksum(fieldStrings[0] ?? "");
  const data = srsNote.applicationSpecificData?.["ankiData"] ?? base?.data ?? "";

  if (base) {
    return { ...base, id: noteId, mid, flds, sfld, csum, data };
  }

  return {
    id: noteId,
    guid: guid64(),
    mid,
    mod: 0,
    usn: 0,
    tags: "",
    flds,
    sfld,
    csum,
    flags: 0,
    data,
  };
}

/**
 * Reconstructs an Anki card. The captured card row is the base and supplies all
 * scheduling state; the SRS format owns id, note id, deck id, ordinal and the
 * ankiData-key → blob → "{}" `data` precedence.
 * @param srsCard - The SRS card being converted
 * @param cardId - The resolved Anki card id
 * @param nid - The resolved Anki note id
 * @param did - The resolved Anki deck id
 * @param ord - The card ordinal (template index / cloze ordinal)
 * @param collector - Issue collector for restore warnings
 * @returns The reconstructed Anki card row
 */
function restoreAnkiCard(
  srsCard: SrsCard,
  cardId: number,
  nid: number,
  did: number,
  ord: number,
  collector: IssueCollector,
): CardsTable {
  const base = parseAnkiBlob<CardsTable>(
    srsCard.applicationSpecificData?.["ankiCard"],
    `card ${cardId.toFixed(0)}`,
    collector,
  );

  const data = srsCard.applicationSpecificData?.["ankiData"] ?? base?.data ?? "{}";

  if (base) {
    return { ...base, id: cardId, nid, did, ord, data };
  }

  return {
    id: cardId,
    nid,
    did,
    ord,
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
    data,
  };
}

/**
 * Reconstructs an Anki review. The captured revlog row is the base and supplies
 * ivl/lastIvl/factor/time/type/usn; the SRS format owns id, card id and ease.
 * @param srsReview - The SRS review being converted
 * @param reviewId - The resolved Anki review id
 * @param cid - The resolved Anki card id
 * @param ease - The ease derived from the SRS review score
 * @param collector - Issue collector for restore warnings
 * @returns The reconstructed Anki review row
 */
function restoreAnkiReview(
  srsReview: SrsReview,
  reviewId: number,
  cid: number,
  ease: Ease,
  collector: IssueCollector,
): RevlogTable {
  const base = parseAnkiBlob<RevlogTable>(
    srsReview.applicationSpecificData?.["ankiReview"],
    `review ${reviewId.toFixed(0)}`,
    collector,
  );

  if (base) {
    return { ...base, id: reviewId, cid, ease };
  }

  return {
    id: reviewId,
    cid,
    usn: 0,
    ease,
    ivl: 0,
    lastIvl: 0,
    factor: 0,
    time: 0,
    type: 0,
  };
}

const EXPORT_VERSION = ExportVersion.Legacy_V2;
const DB_VERSION = 11;

/** Options accepted by the AnkiPackage factory methods. */
export interface AnkiPackageOptions extends Partial<ConversionOptions> {
  /**
   * Media storage backend for the package's media staging. Defaults to the
   * platform default (disk-backed temp directory on Node, in-memory in
   * browsers). One storage instance must not be shared between packages.
   */
  storage?: MediaStorage;
}

/**
 * Extracts the error-handling options for the issue collector, which needs
 * a complete ConversionOptions object or nothing.
 * @param options - The package options as passed by the caller
 * @returns The conversion options, or undefined to use collector defaults
 */
function collectorOptions(options?: AnkiPackageOptions): ConversionOptions | undefined {
  return options?.errorHandling === undefined
    ? undefined
    : { errorHandling: options.errorHandling };
}

export class AnkiPackage {
  private readonly media: MediaStore;
  private databaseContents: DatabaseDump | undefined;
  /** Native decoded entities when the source was a schema-18 package (ADR-0016). */
  private modernData: ModernCollectionData | undefined;

  private constructor(media: MediaStore) {
    this.media = media;
  }

  private getCardDescription(card: CardsTable, note?: NotesTable, deck?: Deck): string {
    const cardId = card.id?.toFixed(0) ?? "Unknown";
    const deckName = deck?.name ?? "Unknown";

    if (!note) {
      return `Card ID ${cardId} in deck "${deckName}"`;
    }

    // Extract front text from note fields
    const fields = note.flds.split("\u001F");
    // TODO: This needs some love to work with multiple fields, HTML etc.
    const frontText = fields[0] ?? note.sfld;
    const cleanText = frontText.replaceAll(/<[^>]*>/gu, "").trim();
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
    const reviewId = review.id?.toFixed(0) ?? "Unknown";
    const reviewDate = review.id ? new Date(review.id).toLocaleDateString() : "Unknown";

    if (card && note) {
      const cardDesc = this.getCardDescription(card, note, deck);
      return `Review of ${cardDesc} on ${reviewDate}`;
    }
    return `Review ID ${reviewId} on ${reviewDate}`;
  }

  public static async fromDefault(
    options?: AnkiPackageOptions,
  ): Promise<ConversionResult<AnkiPackage>> {
    const collector = new IssueCollector(collectorOptions(options));

    const instance = new AnkiPackage(new MediaStore(options?.storage));
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

      const cleanupIssues = await instance.media.cleanup();
      collector.addIssues(cleanupIssues);
      return collector.createFailureResult<AnkiPackage>();
    } finally {
      await db?.close();
    }
  }

  public static async fromAnkiExport(
    data: Uint8Array,
    options?: AnkiPackageOptions,
  ): Promise<ConversionResult<AnkiPackage>> {
    const collector = new IssueCollector(collectorOptions(options));

    try {
      const instance = new AnkiPackage(new MediaStore(options?.storage));
      let db: AnkiDatabase | undefined;

      try {
        if (data.length === 0) {
          collector.addCritical(
            "The file is empty (0 bytes). This may indicate a failed download or file transfer. Please re-export your deck from Anki.",
          );
          const cleanupIssues = await instance.media.cleanup();
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Check the first 4 bytes for the ZIP magic number
        const hasZipMagic =
          data.length >= 4 &&
          data[0] === 0x50 && // P
          data[1] === 0x4b && // K
          (data[2] === 0x03 || data[2] === 0x05) && // 0x03 for local file, 0x05 for empty archive
          (data[3] === 0x04 || data[3] === 0x06); // 0x04 for local file, 0x06 for empty archive

        // Read the Anki export's ZIP entries into memory
        let zipEntries: Map<string, Uint8Array>;
        try {
          zipEntries = readZipEntries(data);
        } catch {
          if (hasZipMagic) {
            collector.addCritical(
              "The ZIP archive is truncated or corrupted. This typically happens when a download was interrupted. Please re-download or re-export your deck from Anki. Note that archives requiring ZIP64 (over 4 GiB or more than 65535 files) are not supported.",
            );
          } else {
            collector.addCritical(
              "The file is not a valid ZIP archive. Anki packages (.apkg/.colpkg) must be ZIP files. Please ensure you're using a file exported from Anki.",
            );
          }
          const cleanupIssues = await instance.media.cleanup();
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Step 1: Determine the package version (docs/formats/anki.md,
        // §Package v3 container layout): decode the protobuf `meta` file when
        // present, otherwise fall back to Anki's file-presence rules.
        const metaEntry = zipEntries.get("meta");

        let version: number;
        if (metaEntry === undefined) {
          if (zipEntries.has("collection.anki21")) {
            version = ExportVersion.Legacy_V2.valueOf();
          } else if (zipEntries.has("collection.anki2")) {
            version = ExportVersion.Legacy_V1.valueOf();
          } else {
            collector.addCritical(
              "The Anki package is missing the 'meta' file and does not contain a collection database ('collection.anki21' or 'collection.anki2'). This does not appear to be a valid Anki export. Please re-export your deck from Anki.",
            );
            const cleanupIssues = await instance.media.cleanup();
            collector.addIssues(cleanupIssues);
            return collector.createFailureResult<AnkiPackage>();
          }
        } else {
          try {
            version = decodePackageMeta(metaEntry).version;
          } catch {
            collector.addCritical(
              "The 'meta' file in this Anki package could not be parsed as version information. The file may be corrupted. Please re-export your deck from Anki.",
            );
            const cleanupIssues = await instance.media.cleanup();
            collector.addIssues(cleanupIssues);
            return collector.createFailureResult<AnkiPackage>();
          }
        }

        // Step 2: Dispatch by version; reject versions this library cannot
        // read, with guidance specific to each format.
        if (version === ExportVersion.Latest.valueOf()) {
          return await AnkiPackage.readModernPackage(instance, collector, zipEntries);
        }

        if (version === ExportVersion.Legacy_V1.valueOf()) {
          collector.addCritical(
            "This package is a Legacy 1 Anki export ('collection.anki2', created by Anki 2.0-era clients), which srs-converter does not support. Please import it into a current version of Anki and export it again.",
          );
          const cleanupIssues = await instance.media.cleanup();
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        if (version !== EXPORT_VERSION.valueOf()) {
          collector.addCritical(
            `Unrecognized Anki package version: ${version.toFixed(0)}. This package may have been created by a newer Anki version than this library understands. Please check for an updated version of srs-converter.`,
          );
          const cleanupIssues = await instance.media.cleanup();
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Step 3: Check for remaining required files (version-specific)
        const mediaEntry = zipEntries.get("media");
        const dbEntry = zipEntries.get("collection.anki21");

        const missingFiles: string[] = [];

        if (mediaEntry === undefined) {
          missingFiles.push("media");
          collector.addCritical(
            "The Anki package is missing the 'media' file which contains media file mappings. This file is required for all Anki exports. Please re-export your deck from Anki.",
          );
        }

        if (dbEntry === undefined) {
          missingFiles.push("collection.anki21");
          collector.addCritical(
            "The Anki package is missing the 'collection.anki21' database file. This file contains all your cards and decks. Please re-export your deck from Anki.",
          );
        }

        if (missingFiles.length > 0 || mediaEntry === undefined || dbEntry === undefined) {
          const cleanupIssues = await instance.media.cleanup();
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Read and parse the media mapping file with validation. An empty
        // media file is a valid case (no media); the store starts empty.
        const mediaFileString = new TextDecoder().decode(mediaEntry).trim();
        let mediaMapping: MediaFileMapping = {};

        if (mediaFileString !== "") {
          // Parse JSON with error handling
          let parsedMedia: unknown;
          try {
            parsedMedia = JSON.parse(mediaFileString);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            collector.addCritical(
              `The media mapping file contains invalid JSON and cannot be parsed: ${errorMessage}. Please re-export your deck from Anki.`,
            );
            const cleanupIssues = await instance.media.cleanup();
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
            const cleanupIssues = await instance.media.cleanup();
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
              const cleanupIssues = await instance.media.cleanup();
              collector.addIssues(cleanupIssues);
              return collector.createFailureResult<AnkiPackage>();
            }
          }

          mediaMapping = parsedMedia as MediaFileMapping;
        }

        // Open the collection.anki21 entry as the database
        try {
          db = await AnkiDatabase.fromBuffer(dbEntry);
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
            const cleanupIssues = await instance.media.cleanup();
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
            const cleanupIssues = await instance.media.cleanup();
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
          const cleanupIssues = await instance.media.cleanup();
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Stage the media files listed in the mapping into the media store
        // and warn about entries the archive does not actually contain.
        for (const [mediaId, filename] of Object.entries(mediaMapping)) {
          const mediaContent = zipEntries.get(mediaId);

          if (mediaContent === undefined) {
            collector.addWarning(
              `Media file '${filename}' (ID: ${mediaId}) is listed in the media mapping but not found in the package. References to this file may be broken.`,
              { itemType: "media", originalData: { filename, mediaId } },
            );
            continue;
          }

          try {
            await instance.media.restoreMediaFile(
              Math.trunc(Number(mediaId)),
              filename,
              mediaContent,
            );
          } catch (error) {
            collector.addWarning(
              `Media file '${filename}' (ID: ${mediaId}) could not be restored from the package and was skipped: ${error instanceof Error ? error.message : String(error)}`,
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

        const cleanupIssues = await instance.media.cleanup();
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

  /**
   * Reads a modern (package version 3 / schema 18) export from its ZIP
   * entries: zstd-decompresses the collection, decodes the split entity
   * tables into the legacy-shaped dump (keeping the native form for
   * ADR-0016 blob storage), and restores the media files from the protobuf
   * manifest.
   * @returns The populated package, or a failure result with issues
   */
  private static async readModernPackage(
    instance: AnkiPackage,
    collector: IssueCollector,
    zipEntries: Map<string, Uint8Array>,
  ): Promise<ConversionResult<AnkiPackage>> {
    const fail = async (): Promise<ConversionResult<AnkiPackage>> => {
      const cleanupIssues = await instance.media.cleanup();
      collector.addIssues(cleanupIssues);
      return collector.createFailureResult<AnkiPackage>();
    };

    // Collection database: whole-file zstd around a schema-18 SQLite file.
    const dbEntry = zipEntries.get("collection.anki21b");
    if (dbEntry === undefined) {
      collector.addCritical(
        "The Anki package declares the modern format but is missing the 'collection.anki21b' database file. This file contains all your cards and decks. Please re-export your deck from Anki.",
      );
      return await fail();
    }

    let dbBuffer: Uint8Array;
    try {
      dbBuffer = await platform.zstdDecompress(dbEntry);
    } catch (error) {
      collector.addCritical(
        `The 'collection.anki21b' database could not be decompressed: ${error instanceof Error ? error.message : String(error)}. The package may be corrupted. Please re-export your deck from Anki.`,
      );
      return await fail();
    }

    let db: AnkiDatabase | undefined;
    try {
      db = await AnkiDatabase.fromBuffer(dbBuffer);
      db.validateSchema();

      const schemaVersion = db.getSchemaVersion();
      if (schemaVersion !== 18) {
        collector.addCritical(
          `This modern Anki package uses database schema version ${schemaVersion.toFixed(0)}, which is not supported (expected 18). Please check for an updated version of srs-converter.`,
        );
        return await fail();
      }

      const { dump, modern } = await db.toModernObject();
      instance.databaseContents = filterValidDatabaseItems(dump, collector);
      instance.modernData = modern;
    } catch (error) {
      if (error instanceof AnkiDatabaseError) {
        collector.addCritical(
          `The 'collection.anki21b' database could not be read: ${error.message} Please re-export your deck from Anki.`,
        );
        return await fail();
      }
      throw error;
    } finally {
      await db?.close();
    }

    // Media: zstd-compressed protobuf manifest; entry position = zip entry
    // name; each media file is individually zstd-compressed. A missing
    // manifest is tolerated (old AnkiDroid wrote packages without one).
    const mediaManifestEntry = zipEntries.get("media");

    if (mediaManifestEntry !== undefined) {
      let entries;
      try {
        entries = mediaEntriesCodec.decode(
          await platform.zstdDecompress(mediaManifestEntry),
        ).entries;
      } catch (error) {
        collector.addCritical(
          `The media manifest of this modern Anki package could not be read: ${error instanceof Error ? error.message : String(error)}. Please re-export your deck from Anki.`,
        );
        return await fail();
      }

      for (const [index, entry] of entries.entries()) {
        const compressed = zipEntries.get(index.toFixed(0));
        let data: Uint8Array;
        try {
          if (compressed === undefined) {
            throw new Error("entry is missing from the archive");
          }
          data = await platform.zstdDecompress(compressed);
        } catch (error) {
          collector.addWarning(
            `Media file '${entry.name}' (ID: ${index.toFixed(0)}) is listed in the media manifest but could not be read: ${error instanceof Error ? error.message : String(error)}. References to this file may be broken.`,
            { itemType: "media", originalData: { filename: entry.name, mediaId: index } },
          );
          continue;
        }

        const sha1 = await sha1Async(data);
        if (data.length !== entry.size || !bytesEqual(sha1, entry.sha1)) {
          collector.addWarning(
            `Media file '${entry.name}' (ID: ${index.toFixed(0)}) does not match its manifest checksum and was skipped. The package may be corrupted.`,
            { itemType: "media", originalData: { filename: entry.name, mediaId: index } },
          );
          continue;
        }

        // Stage the decompressed bytes under the numeric id so the mapping
        // works exactly like the legacy path downstream.
        try {
          await instance.media.restoreMediaFile(index, entry.name, data);
        } catch (error) {
          collector.addWarning(
            `Media file '${entry.name}' (ID: ${index.toFixed(0)}) could not be restored from the package and was skipped: ${error instanceof Error ? error.message : String(error)}`,
            { itemType: "media", originalData: { filename: entry.name, mediaId: index } },
          );
        }
      }
    }

    return collector.createResult(instance);
  }

  public static async fromSrsPackage(
    srsPackage: SrsPackage,
    options?: AnkiPackageOptions,
  ): Promise<ConversionResult<AnkiPackage>> {
    const collector = new IssueCollector(collectorOptions(options));

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

    // Compress the SRS package first to ensure it has no unused entities. The
    // pruning is intentional, but every dropped entity is surfaced as a warning.
    warnRemovedEntities(srsPackage.removeUnused(), collector);

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
    const usedDeckIds = new Set<number>();
    for (const deck of decks) {
      let deckID = resolveAnkiId(deck.applicationSpecificData, srsIdToAnkiId(deck.id));

      // Keep incrementing until we find an unused ID
      while (usedDeckIds.has(deckID)) {
        deckID++;
      }
      usedDeckIds.add(deckID);

      deckIDs.set(deck.id, deckID);

      ankiPackage.addDeck(restoreAnkiDeck(deck, deckID, collector));
    }

    // Convert note types (restore-with-overlay; see restoreAnkiNoteType)
    const noteTypes = srsPackage.getNoteTypes();
    const noteTypeIDs = new Map<string, number>();
    const usedNoteTypeIds = new Set<number>();
    const restoredNoteTypes = new Map<string, NoteType>();
    const firstDeckId = deckIDs.values().next().value ?? null;
    for (const noteType of noteTypes) {
      let noteTypeId = resolveAnkiId(noteType.applicationSpecificData, srsIdToAnkiId(noteType.id));

      // Keep incrementing until we find an unused ID
      while (usedNoteTypeIds.has(noteTypeId)) {
        noteTypeId++;
      }
      usedNoteTypeIds.add(noteTypeId);

      noteTypeIDs.set(noteType.id, noteTypeId);

      const ankiNoteType = restoreAnkiNoteType(noteType, noteTypeId, firstDeckId, collector);
      ankiPackage.addNoteType(ankiNoteType);
      restoredNoteTypes.set(noteType.id, ankiNoteType);
    }

    // Convert notes
    const noteIDs = new Map<string, number>();
    const usedNoteIds = new Set<number>();
    for (const note of srsPackage.getNotes()) {
      let noteId = resolveAnkiId(note.applicationSpecificData, srsIdToAnkiId(note.id));

      // Keep incrementing until we find an unused ID
      while (usedNoteIds.has(noteId)) {
        noteId++;
      }
      usedNoteIds.add(noteId);

      noteIDs.set(note.id, noteId);
      const noteTypeId = noteTypeIDs.get(note.noteTypeId);
      const restoredNoteType = restoredNoteTypes.get(note.noteTypeId);
      if (!noteTypeId || !restoredNoteType) {
        collector.addError(
          `Cannot convert note because note type ID ${note.noteTypeId} was not found. This note will be skipped.`,
          {
            itemType: "note",
            originalData: note,
          },
        );
        continue;
      }
      ankiPackage.addNote(restoreAnkiNote(note, noteId, noteTypeId, restoredNoteType, collector));
    }

    // Convert cards. `cardIDs` maps SRS card id → Anki card id and only ever
    // holds real SRS cards, so reviews resolve to the correct card. `usedCardIds`
    // tracks every assigned id (real and fabricated) to keep them unique.
    const cardIDs = new Map<string, number>();
    const usedCardIds = new Set<number>();

    // Group cards by note to not generate duplicate cards
    // TODO: Clean this up
    const cards = srsPackage.getCards();
    const cardsByNote = new Map<string, SrsCard[]>();
    for (const card of cards) {
      const noteCards = cardsByNote.get(card.noteId) ?? [];
      noteCards.push(card);
      cardsByNote.set(card.noteId, noteCards);
    }

    for (const [noteId, noteCards] of cardsByNote) {
      // Find the note for these cards
      const note = srsPackage.getNotes().find((n) => n.id === noteId);
      if (!note) {
        for (const card of noteCards) {
          collector.addError(
            "Cannot convert card because its note was not found. The note may not have been converted properly. This card will be skipped.",
            { itemType: "card", originalData: card },
          );
        }
        continue;
      }

      const ankiNoteId = noteIDs.get(note.id);
      if (!ankiNoteId) {
        for (const card of noteCards) {
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
        for (const card of noteCards) {
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

      // For cloze note types the card set is derived from the cloze deletions in
      // the templated fields (an ordinal may need a fabricated fresh card); for
      // regular note types each SRS card maps to its template ordinal directly.
      const cardsToCreate: { ord: number; srsCard: SrsCard | undefined }[] =
        noteType && isClozeSrsNoteType(noteType)
          ? planClozeCards(note, noteType, noteCards, collector)
          : noteCards.map((card) => ({ ord: card.templateId, srsCard: card }));

      // Create the Anki cards
      for (const { ord, srsCard } of cardsToCreate) {
        // A missing cloze ordinal has no SRS card: fabricate a fresh one so it
        // gets a new identity and default scheduling (no captured blob).
        const cardForRestore = srsCard ?? createCard({ noteId: note.id, templateId: ord });

        let cardId = resolveAnkiId(
          cardForRestore.applicationSpecificData,
          srsIdToAnkiId(cardForRestore.id),
        );

        // Keep incrementing until we find an unused ID
        while (usedCardIds.has(cardId)) {
          cardId++;
        }
        usedCardIds.add(cardId);

        // Only real SRS cards enter the review-mapping table; fabricated cards
        // never receive reviews.
        if (srsCard) {
          cardIDs.set(srsCard.id, cardId);
        }

        ankiPackage.addCard(
          restoreAnkiCard(cardForRestore, cardId, ankiNoteId, ankiDeckId, ord, collector),
        );
      }
    }

    const usedReviewIds = new Set<number>();
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

      // Reviews use timestamp as fallback, not UUID extraction. `revlog.id` is
      // the primary key, so bump until unique: two reviews in the same
      // millisecond (realistic with second-granularity import sources) would
      // otherwise collide and throw `UNIQUE constraint failed` at export time.
      let reviewId = resolveAnkiId(review.applicationSpecificData, review.timestamp);
      while (usedReviewIds.has(reviewId)) {
        reviewId++;
      }
      usedReviewIds.add(reviewId);

      ankiPackage.addReview(restoreAnkiReview(review, reviewId, cardId, ease, collector));
    }

    // Restore collection-level metadata (crt/conf/tags/dconf/graves) captured
    // during Anki → SRS, and force the schema-defining scalars.
    ankiPackage.restoreCollectionMetadata(srsPackage.getApplicationSpecificData(), collector);

    // Copy media across, preserving filenames verbatim (Anki manifest values are
    // arbitrary Unicode). A duplicate filename (addMediaFile throws) becomes an
    // error issue + skip rather than an unhandled exception.
    for (const filename of srsPackage.listMediaFiles()) {
      try {
        await ankiPackage.addMediaFile(filename, await srsPackage.getMediaFile(filename));
      } catch (error) {
        collector.addError(
          `Media file '${filename}' could not be added to the Anki package and was skipped: ${error instanceof Error ? error.message : String(error)}`,
          { itemType: "media", originalData: { filename } },
        );
      }
    }

    // Warn about note media references (<img src> / [sound:...]) that have no
    // backing media file in the package — the reference would be broken in Anki.
    const availableMedia = new Set(srsPackage.listMediaFiles());
    const referencedMedia = extractMediaReferences(
      srsPackage.getNotes().flatMap((note) => note.fieldValues.map(([, value]) => value)),
    );
    for (const filename of referencedMedia) {
      if (!availableMedia.has(filename)) {
        collector.addWarning(
          `Note media reference '${filename}' has no matching media file in the package; the reference may be broken.`,
          { itemType: "media", originalData: { filename } },
        );
      }
    }

    // Forward any issues from the initial result
    collector.addIssues(result.issues);
    return collector.createResult(ankiPackage);
  }

  /**
   * Restores collection-level metadata onto this package from the SRS
   * package-level `applicationSpecificData` blobs captured during
   * {@link AnkiPackage.toSrsPackage}. Missing/unparseable blobs keep the
   * `fromDefault` values and emit a warning. `ver` and `id` are always forced.
   * @param applicationSpecificData - Package-level blobs (ankiCol/ankiDconf/ankiGraves)
   * @param collector - Issue collector for restore warnings
   */
  private restoreCollectionMetadata(
    applicationSpecificData: Record<string, string>,
    collector: IssueCollector,
  ): void {
    if (!this.databaseContents) {
      throw new Error("Database contents not available");
    }
    const collection = this.databaseContents.collection;

    interface RestoredCol {
      crt: number;
      mod: number;
      scm: number;
      dty: number;
      usn: number;
      ls: number;
      conf: Config;
      tags: Record<string, never>;
    }

    const modernSource = isModernBlobSource(applicationSpecificData);
    const col = modernSource
      ? parseModernBlob<RestoredCol>(
          applicationSpecificData["ankiCol"],
          "collection metadata",
          collector,
          (native) => {
            const nativeCol = native as {
              crt: number;
              mod: number;
              scm: number;
              dty: number;
              usn: number;
              ls: number;
              configRows: ConfigRow[];
              tagRows: TagRow[];
            };
            return {
              crt: nativeCol.crt,
              mod: nativeCol.mod,
              scm: nativeCol.scm,
              dty: nativeCol.dty,
              usn: nativeCol.usn,
              ls: nativeCol.ls,
              conf: configRowsToConfJson(nativeCol.configRows),
              tags: tagRowsToTagsJson(nativeCol.tagRows),
            };
          },
        )
      : parseAnkiBlob<RestoredCol>(
          applicationSpecificData["ankiCol"],
          "collection metadata",
          collector,
        );
    if (col) {
      collection.crt = col.crt;
      collection.mod = col.mod;
      collection.scm = col.scm;
      collection.dty = col.dty;
      collection.usn = col.usn;
      collection.ls = col.ls;
      collection.conf = col.conf;
      collection.tags = col.tags;
    }

    const dconf = modernSource
      ? parseModernBlob<DeckConfigs>(
          applicationSpecificData["ankiDconf"],
          "deck options",
          collector,
          (native) =>
            Object.fromEntries(
              Object.entries(native as Record<string, DeckConfigProtoBundle>).map(
                ([id, bundle]) => [id, deckConfigProtoToSchema11(bundle)],
              ),
            ),
        )
      : parseAnkiBlob<DeckConfigs>(applicationSpecificData["ankiDconf"], "deck options", collector);
    if (dconf) {
      collection.dconf = dconf;
    }

    const graves = parseAnkiBlob<DatabaseDump["deletedItems"]>(
      applicationSpecificData["ankiGraves"],
      "deleted-item tombstones (graves)",
      collector,
    );
    if (graves) {
      this.databaseContents.deletedItems = graves;
    }

    // The schema version and collection id are fixed for the Legacy V2 format.
    collection.ver = DB_VERSION;
    collection.id = 1;

    // Every deck must point at a deck configuration that exists.
    for (const deck of Object.values(collection.decks)) {
      if (!(deck.conf.toString() in collection.dconf)) {
        collector.addWarning(
          `Deck '${deck.name}' referenced deck options ${deck.conf.toFixed(0)}, which are not present in the restored configuration. Falling back to the default preset.`,
          { itemType: "deck" },
        );
        deck.conf = 1;
      }
    }
  }

  /**
   * Writes this package as an Anki export.
   *
   * By default this writes the modern package format (version 3,
   * `collection.anki21b`, schema 18) — the same format current Anki
   * produces. `options.legacy: true` mirrors Anki's "Support older Anki
   * versions" checkbox and writes a Legacy 2 package (`collection.anki21`)
   * instead, which every Anki version can import (ADR-0015).
   * @param options - Export format options
   * @returns The bytes of the .apkg file
   */
  public async toAnkiExport(options?: { legacy?: boolean }): Promise<Uint8Array> {
    if (this.databaseContents === undefined) {
      throw new Error("Database contents not available");
    }

    if (options?.legacy !== true) {
      return await this.toModernAnkiExport();
    }

    const meta = encodePackageMeta({ version: EXPORT_VERSION.valueOf() });
    const mediaEntries = this.media.getMediaEntries();
    const mediaMapping = Object.fromEntries(
      mediaEntries.map(([id, filename]) => [id.toFixed(0), filename]),
    );
    const media = new TextEncoder().encode(JSON.stringify(mediaMapping, null, 2));

    const db = await AnkiDatabase.fromDump(this.databaseContents);
    const dbBuffer = db.toBuffer();

    // Media entries are read from the media store one at a time while the
    // archive is assembled, so only a single media file is in memory.
    const mediaStore = this.media;
    async function* zipEntries(): AsyncGenerator<ZipOutEntry> {
      yield { compress: true, data: dbBuffer, name: "collection.anki21" };
      yield { compress: false, data: media, name: "media" };
      yield { compress: false, data: meta, name: "meta" };
      for (const [id, filename] of mediaEntries) {
        yield {
          compress: false,
          data: await mediaStore.getMediaFile(filename),
          name: id.toFixed(0),
        };
      }
    }

    return await buildZip(zipEntries());
  }

  /**
   * Writes this package in the modern format (package version 3 / schema
   * 18), mirroring Anki's own layout: `meta`, zstd-compressed
   * `collection.anki21b`, a dummy legacy `collection.anki2` for pre-2.1.50
   * clients, the zstd protobuf media manifest, and individually compressed
   * media files (docs/formats/anki.md §Package v3 container layout).
   * @returns The bytes of the .apkg file
   */
  private async toModernAnkiExport(): Promise<Uint8Array> {
    if (this.databaseContents === undefined) {
      throw new Error("Database contents not available");
    }

    // The meta file (version 3).
    const meta = encodePackageMeta({ version: ExportVersion.Latest.valueOf() });

    // Build and compress the schema-18 database.
    const db = await AnkiDatabase.fromModernDump(this.databaseContents, this.modernData);
    const dbBuffer = db.toBuffer();
    await db.close();
    const compressedDb = await platform.zstdCompress(dbBuffer);

    // Dummy legacy collection so pre-2.1.50 clients open an (empty) valid
    // database instead of failing. Anki additionally puts an explanatory
    // note inside; ours stays empty.
    const dummyDb = await AnkiDatabase.fromDefault();
    const dummyBuffer = dummyDb.toBuffer();
    await dummyDb.close();

    // Media: manifest entry order defines the numeric zip entry names;
    // names must be NFC-normalized; sha1 of the uncompressed bytes is
    // mandatory. The compressed copies are staged in a scratch storage so
    // only one media file is held in memory at a time; the instance's own
    // media files stay readable.
    const scratch = platform.createDefaultMediaStorage();
    try {
      const entries: { name: string; size: number; sha1: Uint8Array }[] = [];
      for (const [, filename] of this.media.getMediaEntries()) {
        const data = await this.media.getMediaFile(filename);
        const index = entries.length;
        entries.push({
          name: filename.normalize("NFC"),
          size: data.length,
          sha1: await sha1Async(data),
        });
        await scratch.write(index.toFixed(0), await platform.zstdCompress(data));
      }
      const manifest = await platform.zstdCompress(mediaEntriesCodec.encode({ entries }));

      const mediaCount = entries.length;
      const zipEntries = async function* zipEntries(): AsyncGenerator<ZipOutEntry> {
        yield { compress: false, data: meta, name: "meta" };
        yield { compress: false, data: compressedDb, name: "collection.anki21b" };
        yield { compress: false, data: dummyBuffer, name: "collection.anki2" };
        yield { compress: false, data: manifest, name: "media" };
        for (let index = 0; index < mediaCount; index++) {
          yield {
            compress: false,
            data: await scratch.read(index.toFixed(0)),
            name: index.toFixed(0),
          };
        }
      };

      return await buildZip(zipEntries());
    } finally {
      await scratch.dispose();
    }
  }

  public async cleanup(): Promise<ConversionIssue[]> {
    return await this.media.cleanup();
  }

  toString(): string {
    const mediaMapping = Object.fromEntries(
      this.media.getMediaEntries().map(([id, filename]) => [id.toFixed(0), filename]),
    );
    let res = "AnkiPackage\n";
    res += `Media file mapping: ${JSON.stringify(mediaMapping, null, 2)}\n`;
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
    return this.media.listMediaFiles();
  }

  /**
   * Retrieves the size of a specific media file.
   * @param filename - The name of the media file to get the size for
   * @returns Promise resolving to the file size in bytes
   * @throws {Error} if the file is not found in the package
   */
  public async getMediaFileSize(filename: string): Promise<number> {
    return await this.media.getMediaFileSize(filename);
  }

  /**
   * Retrieves the content of a media file.
   * @param filename - The name of the media file to retrieve
   * @returns The media file's bytes
   * @throws {Error} if the file is not found in the package
   */
  public async getMediaFile(filename: string): Promise<Uint8Array> {
    return await this.media.getMediaFile(filename);
  }

  /**
   * Adds a media file to the package. The content is copied, so the caller
   * retains ownership of `data`.
   * @param filename - The name for the media file (e.g., "image.jpg")
   * @param data - The content of the media file
   * @throws {Error} if the filename already exists in the package
   * @throws {Error} if the content cannot be stored
   */
  public async addMediaFile(filename: string, data: Uint8Array): Promise<void> {
    await this.media.addMediaFile(filename, data);
  }

  /**
   * Removes a media file from the package.
   * @param filename - The name of the media file to remove (e.g., "image.jpg")
   * @throws {Error} if the file does not exist in the package
   * @throws {Error} if the backing content cannot be deleted
   */
  public async removeMediaFile(filename: string): Promise<void> {
    await this.media.removeMediaFile(filename);
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

    // Collect all filenames referenced across every note field. The reference
    // pattern is shared with fromSrsPackage's missing-media warning.
    const referencedFiles = extractMediaReferences(
      this.getNotes().flatMap((note) => splitAnkiFields(note.flds)),
    );

    // Find unreferenced files
    const allMediaFiles = this.media.listMediaFiles();
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
   *
   * Media files are copied into the returned {@link SrsPackage}, which then owns
   * independent media storage; the caller must eventually call
   * {@link SrsPackage.cleanup} on it. This copying is why the method is async.
   * @param options - Configuration options for the conversion process
   * @returns A new SrsPackage containing the converted data
   */
  public async toSrsPackage(options?: ConversionOptions): Promise<ConversionResult<SrsPackage>> {
    const collector = new IssueCollector(options);

    if (!this.databaseContents) {
      collector.addCritical(
        "The Anki database could not be loaded, so conversion to SRS format is not possible.",
      );
      return collector.createFailureResult<SrsPackage>();
    }

    const srsPackage = new SrsPackage();

    // Step 0: Capture collection-level metadata that has no per-entity home so
    // it can be restored on the way back (crt/conf/tags, deck options, graves).
    // Modern-sourced packages store the native decoded form plus a schema
    // marker instead of the legacy-shaped view (ADR-0016).
    const collection = this.databaseContents.collection;
    const packageData: Record<string, string> = {
      ankiGraves: serializeWithBigInts(this.databaseContents.deletedItems),
    };
    if (this.modernData) {
      packageData[ANKI_SCHEMA_KEY] = ANKI_SCHEMA_MODERN;
      packageData["ankiCol"] = serializeWithBigInts(
        toStorable({
          crt: collection.crt,
          mod: collection.mod,
          scm: collection.scm,
          dty: collection.dty,
          usn: collection.usn,
          ls: collection.ls,
          ver: this.modernData.col.ver,
          configRows: this.modernData.col.configRows,
          tagRows: this.modernData.col.tagRows,
        }),
      );
      packageData["ankiDconf"] = serializeWithBigInts(
        toStorable(
          Object.fromEntries(
            [...this.modernData.deckConfigs.entries()].map(([id, bundle]) => [String(id), bundle]),
          ),
        ),
      );
    } else {
      packageData["ankiCol"] = serializeWithBigInts({
        crt: collection.crt,
        mod: collection.mod,
        scm: collection.scm,
        dty: collection.dty,
        usn: collection.usn,
        ls: collection.ls,
        conf: collection.conf,
        tags: collection.tags,
      });
      packageData["ankiDconf"] = serializeWithBigInts(collection.dconf);
    }
    srsPackage.setApplicationSpecificData(packageData);

    // Step 1: Convert and add decks
    const ankiToSrsDeckMap = new Map<number, string>();

    for (const [deckId, ankiDeck] of Object.entries(this.databaseContents.collection.decks)) {
      const modernDeck = this.modernData?.decks.get(Number(deckId));
      const deckData: Parameters<typeof createDeck>[0] = {
        applicationSpecificData: {
          ankiDeck: modernDeck
            ? serializeWithBigInts(toStorable(modernDeck))
            : serializeWithBigInts(ankiDeck),
          ...(modernDeck ? { [ANKI_SCHEMA_KEY]: ANKI_SCHEMA_MODERN } : {}),
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
      // S3: order fields/templates by their `ord`, not their stored array
      // position, so a mis-sorted model cannot remap content to the wrong
      // field/template. The captured blob uses the same order so restore can
      // match SRS fields/templates back to it by position.
      const sortedFlds = [...ankiNoteType.flds].sort((a, b) => a.ord - b.ord);
      const sortedTmpls = [...ankiNoteType.tmpls].sort((a, b) => a.ord - b.ord);
      const sortedNoteType = { ...ankiNoteType, flds: sortedFlds, tmpls: sortedTmpls };

      const modernNoteType = this.modernData?.noteTypes.get(Number(noteTypeId));
      const srsNoteType = createNoteType({
        applicationSpecificData: {
          ankiNoteType: modernNoteType
            ? serializeWithBigInts(toStorable(modernNoteType))
            : serializeWithBigInts(sortedNoteType),
          ...(modernNoteType ? { [ANKI_SCHEMA_KEY]: ANKI_SCHEMA_MODERN } : {}),
          originalAnkiId: noteTypeId,
        },
        fields: sortedFlds.map((field, index) => {
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
        templates: sortedTmpls.map((template, index) => ({
          answerTemplate: template.afmt,
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
            ankiNote: serializeWithBigInts(ankiNote),
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
            ankiCard: serializeWithBigInts(ankiCard),
            ankiData: ankiCard.data,
            originalAnkiId: ankiCard.id?.toFixed(0) ?? "",
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
            ankiReview: serializeWithBigInts(ankiReview),
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

    // Step 7: Clean up unused entities. Pruning is intentional, but every
    // dropped entity is surfaced as a warning rather than vanishing silently.
    warnRemovedEntities(srsPackage.removeUnused(), collector);

    // Step 8: Copy media files into the SRS package so they survive the round
    // trip. Content is copied, so the SRS package owns independent copies. A
    // file that is listed in the manifest but missing on disk (already warned
    // about at read time) is skipped with a warning rather than aborting.
    for (const filename of this.listMediaFiles()) {
      try {
        await srsPackage.addMediaFile(filename, await this.getMediaFile(filename));
      } catch (error) {
        collector.addWarning(
          `Media file '${filename}' could not be copied to the SRS package and was skipped: ${error instanceof Error ? error.message : String(error)}`,
          { itemType: "media", originalData: { filename } },
        );
      }
    }

    return collector.createResult(srsPackage);
  }
}
