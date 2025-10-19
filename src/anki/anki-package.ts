import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import protobuf from "protobufjs";
import { Open } from "unzipper";
import {
  type ConversionIssue,
  type ConversionOptions,
  type ConversionResult,
  IssueCollector,
} from "@/error-handling";
import {
  createCard,
  createDeck,
  createNote,
  createNoteType,
  createReview,
  type SrsCard,
  SrsPackage,
  SrsReviewScore,
} from "@/srs-package";
import { defaultDeck } from "./constants";
import { AnkiDatabase } from "./database";
import {
  type CardsTable,
  type Config,
  type DatabaseDump,
  type Deck,
  DeckDynamicity,
  Ease,
  ExportVersion,
  type MediaFileMapping,
  type NotesTable,
  type NoteType,
  NoteTypeKind,
  type RevlogTable,
} from "./types";
import {
  createSelectiveZip,
  extractTimestampFromUuid,
  guid64,
  joinAnkiFields,
  serializeWithBigInts,
  splitAnkiFields,
} from "./util";

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
  // biome-ignore lint/complexity/useLiteralKeys: Required for TS index signature
  if (applicationSpecificData?.["originalAnkiId"]) {
    const originalId = Number(
      // biome-ignore lint/complexity/useLiteralKeys: Required for TS index signature
      applicationSpecificData["originalAnkiId"],
    );
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

  private getCardDescription(
    card: CardsTable,
    note?: NotesTable,
    deck?: Deck,
  ): string {
    const cardId = card.id?.toFixed() ?? "Unknown";
    const deckName = deck?.name ?? "Unknown";

    if (!note) {
      return `Card ID ${cardId} in deck "${deckName}"`;
    }

    // Extract front text from note fields
    const fields = note.flds.split("\x1f");
    // TODO: This needs some love to work with multiple fields, HTML etc.
    const frontText = fields[0] ?? note.sfld;
    const cleanText = frontText.replace(/<[^>]*>/g, "").trim();
    const preview =
      cleanText.length > 50 ? `${cleanText.substring(0, 47)}...` : cleanText;

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
    const reviewDate = review.id
      ? new Date(review.id).toLocaleDateString()
      : "Unknown";

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
        instance.databaseContents = await db.toObject();

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

        // Unzip the Anki export file to the temp dir
        // TODO: Use zip.js for cross platform compatibility
        // https://github.com/gildas-lormeau/zip.js
        const directory = await Open.file(filepath);
        await directory.extract({ path: instance.tempDir });

        // Read the package version by looking at the "meta" file
        const metaFilePath = join(instance.tempDir, "meta");
        const metaFileContent = await readFile(metaFilePath);
        const meta = parseMeta(metaFileContent);

        if (meta.version !== EXPORT_VERSION.valueOf()) {
          collector.addCritical(
            `Unsupported Anki export package version: ${meta.version.toFixed()}. Make sure to check "Support older Anki versions" in the Anki export dialog.`,
          );
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        // Read the contents of the media mapping file
        const mediaFilePath = join(instance.tempDir, "media");
        const mediaFileContent = await readFile(mediaFilePath);
        instance.mediaFiles = JSON.parse(
          mediaFileContent.toString(),
        ) as MediaFileMapping;

        // Open the collection.anki21 file as the database
        const dbFilePath = join(instance.tempDir, "collection.anki21");
        db = await AnkiDatabase.fromBuffer(await readFile(dbFilePath));

        // Read the contents of the database
        instance.databaseContents = await db.toObject();

        if (instance.databaseContents.collection.ver !== DB_VERSION) {
          collector.addCritical(
            `This Anki file uses database version ${instance.databaseContents.collection.ver.toFixed()}, which is not supported. Please export your deck from a compatible Anki version.`,
          );
          const cleanupIssues = await removeDirectory(instance.tempDir);
          collector.addIssues(cleanupIssues);
          return collector.createFailureResult<AnkiPackage>();
        }

        return collector.createResult(instance);
      } catch (error) {
        if (error instanceof Error && error.message.includes("FILE_ENDED")) {
          collector.addCritical("Anki export file is corrupted or incomplete.");
        } else {
          collector.addCritical(
            `The Anki export file could not be read and may be corrupted. ${error instanceof Error ? error.message : String(error)}.`,
          );
        }

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
        `The package must contain exactly one deck, but found ${decks.length.toFixed()} decks: ${deckNames}.`,
        { itemType: "deck" },
      );
      return collector.createFailureResult<AnkiPackage>();
    }

    const deckIDs = new Map<string, number>();
    for (const deck of decks) {
      let deckID = resolveAnkiId(
        deck.applicationSpecificData,
        extractTimestampFromUuid(deck.id),
      );

      // Keep incrementing until we find an unused ID
      while (Array.from(deckIDs.values()).includes(deckID)) {
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
      while (Array.from(noteTypeIDs.values()).includes(noteTypeId)) {
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
      let noteId = resolveAnkiId(
        note.applicationSpecificData,
        extractTimestampFromUuid(note.id),
      );

      // Keep incrementing until we find an unused ID
      while (Array.from(noteIDs.values()).includes(noteId)) {
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
        data: "",
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
      // biome-ignore lint/complexity/useLiteralKeys: <Conflict with TS noUncheckedIndexedAccess>
      const ankiDeckId = srsDeck?.applicationSpecificData?.["originalAnkiId"]
        ? // biome-ignore lint/complexity/useLiteralKeys: <Conflict with TS noUncheckedIndexedAccess>
          Number(srsDeck.applicationSpecificData["originalAnkiId"])
        : deckId; // fallback to timestamp-based ID

      // Find the note type for this note
      const noteType = srsPackage
        .getNoteTypes()
        .find((nt) => nt.id === note.noteTypeId);

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
        const fieldContent = joinAnkiFields(
          note.fieldValues.map(([, value]) => value),
        );
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
        while (Array.from(cardIDs.values()).includes(cardId)) {
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
          data: "{}",
        };
        ankiPackage.addCard(ankiCard);
      }
    }

    for (const review of srsPackage.getReviews()) {
      let ease: Ease;

      switch (review.score) {
        case SrsReviewScore.Again:
          ease = Ease.AGAIN;
          break;
        case SrsReviewScore.Hard:
          ease = Ease.HARD;
          break;
        case SrsReviewScore.Normal:
          ease = Ease.GOOD;
          break;
        case SrsReviewScore.Easy:
          ease = Ease.EASY;
          break;
        default:
          collector.addError(
            `Cannot convert review because the score ${String(review.score)} is not valid. Valid review scores are 1 (Again), 2 (Hard), 3 (Normal), 4 (Easy). This review will be skipped.`,
            {
              itemType: "review",
              originalData: review,
            },
          );
          continue;
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

    await createSelectiveZip(filepath, [
      {
        path: join(this.tempDir, "collection.anki21"),
        compress: true,
      },
      {
        path: join(this.tempDir, "media"),
        compress: false,
      },
      {
        path: join(this.tempDir, "meta"),
        compress: false,
      },
    ]);
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
          ([key]) => key !== deckId.toFixed(),
        ),
      );
    } else {
      throw new Error(`Deck with ID ${deckId.toFixed()} does not exist`);
    }
  }

  /**
   * Converts the AnkiPackage to an SrsPackage.
   * This method transforms Anki data structures into the universal SRS format.
   * @param options - Configuration options for the conversion process
   * @returns A new SrsPackage containing the converted data
   */
  public toSrsPackage(
    options?: ConversionOptions,
  ): ConversionResult<SrsPackage> {
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

    for (const [deckId, ankiDeck] of Object.entries(
      this.databaseContents.collection.decks,
    )) {
      const deckData: Parameters<typeof createDeck>[0] = {
        name: ankiDeck.name,
        applicationSpecificData: {
          originalAnkiId: deckId,
          ankiDeckData: JSON.stringify(ankiDeck),
        },
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
        name: ankiNoteType.name,
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
        templates: ankiNoteType.tmpls.map((template, index) => ({
          id: index,
          name: template.name,
          questionTemplate: template.qfmt,
          answerTemplate: template.afmt,
          applicationSpecificData: {
            ankiTemplateData: serializeWithBigInts(template),
          },
        })),
        applicationSpecificData: {
          originalAnkiId: noteTypeId,
        },
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
      const srsNoteTypeId = ankiToSrsNoteTypeMap.get(ankiNote.mid.toFixed());
      const ankiDeckId = noteIdToDeckId.get(ankiNote.id) ?? 1; // Default to deck 1
      const srsDeckId = ankiToSrsDeckMap.get(ankiDeckId);

      if (!srsNoteTypeId || !srsDeckId) {
        collector.addError(
          `Cannot convert note ${ankiNote.id.toFixed()} because note type or deck mapping is missing. This note will be skipped.`,
          {
            itemType: "note",
            originalData: ankiNote,
          },
        );
        continue;
      }

      const srsNoteType = srsPackage
        .getNoteTypes()
        .find((nt) => nt.id === srsNoteTypeId);
      if (!srsNoteType) {
        collector.addError(
          `Cannot convert note ${ankiNote.id.toFixed()} because its note type was not found. This note will be skipped.`,
          {
            itemType: "note",
            originalData: ankiNote,
          },
        );
        continue;
      }

      const fieldValues = splitAnkiFields(ankiNote.flds);
      const noteFieldValues: [string, string][] = srsNoteType.fields.map(
        (field, index) => [field.name, fieldValues[index] ?? ""],
      );

      const srsNote = createNote(
        {
          noteTypeId: srsNoteTypeId,
          deckId: srsDeckId,
          fieldValues: noteFieldValues,
          applicationSpecificData: {
            originalAnkiId: ankiNote.id.toFixed(),
            ankiGuid: ankiNote.guid,
            ankiTags: ankiNote.tags,
            ankiNoteData: JSON.stringify(ankiNote),
          },
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
          noteId: srsNoteId,
          templateId: ankiCard.ord,
          applicationSpecificData: {
            // TODO: Check which of these fields actually need to be stored. Maybe extract a type.
            originalAnkiId: ankiCard.id?.toFixed() ?? "",
            ankiCardData: JSON.stringify(ankiCard),
            ankiDue: ankiCard.due.toFixed(),
            ankiQueue: ankiCard.queue.toString(),
            ankiType: ankiCard.type.toString(),
          },
        });

        srsPackage.addCard(srsCard);
        if (ankiCard.id) {
          ankiToSrsCardMap.set(ankiCard.id, srsCard.id);
        }
      } catch (error) {
        const note = this.databaseContents.notes.find(
          (n) => n.id === ankiCard.nid,
        );
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
          const ankiCard = this.databaseContents.cards.find(
            (c) => c.id === ankiReview.cid,
          );
          const note = ankiCard
            ? this.databaseContents.notes.find((n) => n.id === ankiCard.nid)
            : undefined;
          const deck = ankiCard
            ? this.databaseContents.collection.decks[ankiCard.did]
            : undefined;

          collector.addReviewError(
            `Review ID is undefined for ${this.getReviewDescription(ankiReview, ankiCard, note, deck)} - Skipping review`,
            ankiReview,
          );
          continue;
        }

        // Check for invalid review score
        if (
          ![Ease.AGAIN, Ease.HARD, Ease.GOOD, Ease.EASY].includes(
            ankiReview.ease,
          )
        ) {
          // Find the card and related data for better error messages
          const ankiCard = this.databaseContents.cards.find(
            (c) => c.id === ankiReview.cid,
          );
          const note = ankiCard
            ? this.databaseContents.notes.find((n) => n.id === ankiCard.nid)
            : undefined;
          const deck = ankiCard
            ? this.databaseContents.collection.decks[ankiCard.did]
            : undefined;

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
          case Ease.AGAIN:
            srsScore = SrsReviewScore.Again;
            break;
          case Ease.HARD:
            srsScore = SrsReviewScore.Hard;
            break;
          case Ease.GOOD:
            srsScore = SrsReviewScore.Normal;
            break;
          case Ease.EASY:
            srsScore = SrsReviewScore.Easy;
            break;
        }
        const srsReview = createReview({
          cardId: srsCardId,
          timestamp: ankiReview.id, // Anki review ID is the timestamp
          score: srsScore,
          applicationSpecificData: {
            originalAnkiId: ankiReview.id.toFixed(),
          },
        });

        srsPackage.addReview(srsReview);
      } catch (error) {
        const ankiCard = this.databaseContents.cards.find(
          (c) => c.id === ankiReview.cid,
        );
        const note = ankiCard
          ? this.databaseContents.notes.find((n) => n.id === ankiCard.nid)
          : undefined;
        const deck = ankiCard
          ? this.databaseContents.collection.decks[ankiCard.did]
          : undefined;

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
  // eslint-disable-next-line import-x/no-named-as-default-member -- protobufjs is a CommonJS module
  const root = new protobuf.Root();
  // eslint-disable-next-line import-x/no-named-as-default-member -- protobufjs is a CommonJS module
  const Meta = new protobuf.Type("Meta").add(
    // eslint-disable-next-line import-x/no-named-as-default-member -- protobufjs is a CommonJS module
    new protobuf.Field("version", 1, "int32", "required"),
  );
  root.add(Meta);

  // Cast the decoded message to our interface
  return Meta.decode(buffer) as unknown as MetaMessage;
}

function writeMeta(message: MetaMessage): Uint8Array {
  // eslint-disable-next-line import-x/no-named-as-default-member -- protobufjs is a CommonJS module
  const root = new protobuf.Root();
  // eslint-disable-next-line import-x/no-named-as-default-member -- protobufjs is a CommonJS module
  const Meta = new protobuf.Type("Meta").add(
    // eslint-disable-next-line import-x/no-named-as-default-member -- protobufjs is a CommonJS module
    new protobuf.Field("version", 1, "int32", "required"),
  );
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
      severity: "warning",
      message:
        "Could not clean up temporary files after conversion. This does not affect your converted data.",
      context: {
        originalData: error,
      },
    });
  }

  return issues;
}
