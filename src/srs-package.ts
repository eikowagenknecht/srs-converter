import type { Readable } from "node:stream";

import { generateUuid } from "./anki/util";
import type { ConversionIssue } from "./error-handling";
import { MediaStore } from "./media-store";

/**
 * Represents a complete SRS (Spaced Repetition System) package containing all
 * necessary components for a learning system.
 *
 * This class manages the relationships between decks, notes, cards, and reviews,
 * ensuring referential integrity between components.
 *
 * Media lifecycle: media files added via {@link SrsPackage.addMediaFile} (or
 * copied in during a conversion) are stored in a temporary directory owned by
 * the package. Callers must eventually call {@link SrsPackage.cleanup} to remove
 * it. Conversions copy media content rather than sharing it, so a source and a
 * target package have fully independent lifetimes and each must be cleaned up by
 * its own owner. A package that never holds media never creates the directory,
 * and {@link SrsPackage.cleanup} is a safe no-op in that case.
 */
export class SrsPackage {
  private decks: SrsDeck[];
  private noteTypes: SrsNoteType[];
  private notes: SrsNote[];
  private cards: SrsCard[];
  private reviews: SrsReview[];
  private applicationSpecificData: Record<string, string>;
  private readonly media: MediaStore;

  constructor() {
    this.decks = [];
    this.noteTypes = [];
    this.notes = [];
    this.cards = [];
    this.reviews = [];
    this.applicationSpecificData = {};
    this.media = new MediaStore();
  }

  /**
   * Returns a copy of the package-level application-specific data.
   *
   * This holds collection-scoped metadata that has no per-entity home, such as
   * the Anki `col` scalars, deck configurations and graves captured during an
   * Anki → SRS conversion so they can be restored on the way back.
   * @returns A shallow copy of the application-specific data record
   */
  public getApplicationSpecificData(): Record<string, string> {
    return { ...this.applicationSpecificData };
  }

  public setApplicationSpecificData(data: Record<string, string>) {
    this.applicationSpecificData = { ...data };
  }

  public getDecks(): readonly SrsDeck[] {
    return [...this.decks];
  }

  public addDeck(deck: SrsDeck) {
    this.decks.push(deck);
  }

  public removeDeck(deckId: string) {
    this.decks = this.decks.filter((deck) => deck.id !== deckId);
  }

  public getNoteTypes(): readonly SrsNoteType[] {
    return [...this.noteTypes];
  }

  public addNoteType(noteType: SrsNoteType) {
    this.noteTypes.push(noteType);
  }

  public removeNoteType(noteTypeId: string) {
    this.noteTypes = this.noteTypes.filter((noteType) => noteType.id !== noteTypeId);
  }

  public getNotes(): readonly SrsNote[] {
    return [...this.notes];
  }

  public addNote(note: SrsNote) {
    const noteTypeExists = this.noteTypes.some((nt) => nt.id === note.noteTypeId);
    if (!noteTypeExists) {
      throw new Error(`Note type ${note.noteTypeId} does not exist.`);
    }

    const deckExists = this.decks.some((d) => d.id === note.deckId);
    if (!deckExists) {
      throw new Error(`Deck ${note.deckId} does not exist.`);
    }

    this.notes.push(note);
  }

  public removeNote(noteId: string) {
    for (const card of this.cards) {
      if (card.noteId === noteId) {
        this.removeCard(card.id);
      }
    }
    this.notes = this.notes.filter((note) => note.id !== noteId);
  }

  public getCards(): readonly SrsCard[] {
    return [...this.cards];
  }

  /**
   * Adds a card to the SRS package.
   *
   * TODO: This should only be used internally.
   * When adding a note or changing templates, the cards should be created
   * automatically based on the note type's templates.
   * @param card The card to add.
   */
  public addCard(card: SrsCard) {
    const noteExists = this.notes.some((n) => n.id === card.noteId);
    if (!noteExists) {
      throw new Error(`Note ${card.noteId} does not exist.`);
    }

    const note = this.notes.find((n) => n.id === card.noteId);
    const noteType = this.noteTypes.find((nt) => nt.id === note?.noteTypeId);
    if (!noteType) {
      throw new Error(`Note type not found for template ID ${card.templateId.toFixed(0)}.`);
    }

    // Check if this is a cloze note type by looking at template content
    const isClozeNoteType = noteType.templates.some(
      (template) =>
        template.questionTemplate.includes("{{cloze:") ||
        template.answerTemplate.includes("{{cloze:"),
    );

    // For cloze note types, templateId can be higher than templates.length (one per cloze deletion)
    // For regular note types, templateId must be within templates bounds
    if (!isClozeNoteType && card.templateId >= noteType.templates.length) {
      throw new Error(
        `Invalid template ID ${card.templateId.toFixed(0)} for note type "${noteType.name}". Expected 0-${(noteType.templates.length - 1).toFixed(0)}.`,
      );
    }

    this.cards.push(card);
  }

  public removeCard(cardId: string) {
    for (const review of this.reviews) {
      if (review.cardId === cardId) {
        this.removeReview(review.id);
      }
    }
    this.cards = this.cards.filter((card) => card.id !== cardId);
  }

  public getReviews(): readonly SrsReview[] {
    return [...this.reviews];
  }

  public addReview(review: SrsReview) {
    this.reviews.push(review);
  }

  public removeReview(reviewId: string) {
    this.reviews = this.reviews.filter((review) => review.id !== reviewId);
  }

  /**
   * Removes entities that nothing references, keeping the package minimal for
   * conversion: decks not referenced by any note, note types not referenced by
   * any note, and notes not referenced by any card (a card-less note).
   *
   * The pruning is intentional, but callers need to know what was dropped so
   * they can surface it (e.g. as warning issues during conversion). The
   * returned report lists every entity that was removed.
   * @returns The decks, note types, and notes that were removed
   */
  public removeUnused(): {
    removedDecks: SrsDeck[];
    removedNoteTypes: SrsNoteType[];
    removedNotes: SrsNote[];
  } {
    // Decks are used if they are referenced by any notes
    const usedDeckIds = new Set(this.notes.map((note) => note.deckId));
    const removedDecks = this.decks.filter((deck) => !usedDeckIds.has(deck.id));
    this.decks = this.decks.filter((deck) => usedDeckIds.has(deck.id));

    // Note types are used if they are referenced by any notes
    const usedNoteTypeIds = new Set(this.notes.map((note) => note.noteTypeId));
    const removedNoteTypes = this.noteTypes.filter((noteType) => !usedNoteTypeIds.has(noteType.id));
    this.noteTypes = this.noteTypes.filter((noteType) => usedNoteTypeIds.has(noteType.id));

    // Notes are used if they are referenced by any cards
    const usedNoteIds = new Set(this.cards.map((card) => card.noteId));
    const removedNotes = this.notes.filter((note) => !usedNoteIds.has(note.id));
    this.notes = this.notes.filter((note) => usedNoteIds.has(note.id));

    return { removedDecks, removedNoteTypes, removedNotes };
  }

  /**
   * Lists the filenames of every media file stored in this package.
   * @returns The media filenames
   */
  public listMediaFiles(): string[] {
    return this.media.listMediaFiles();
  }

  /**
   * Opens a media file for reading.
   * @param filename - The media filename to read
   * @returns A readable stream of the file's bytes
   * @throws {Error} if no media file with that name exists
   */
  public getMediaFile(filename: string): Readable {
    return this.media.getMediaFile(filename);
  }

  /**
   * Returns the size in bytes of a stored media file.
   * @param filename - The media filename
   * @returns The file size in bytes
   * @throws {Error} if no media file with that name exists or it cannot be read
   */
  public async getMediaFileSize(filename: string): Promise<number> {
    return await this.media.getMediaFileSize(filename);
  }

  /**
   * Adds a media file to the package.
   *
   * The content is copied into a temporary directory owned by this package, so
   * the caller keeps ownership of `source`. See the class-level media lifecycle
   * note: the caller must eventually call {@link SrsPackage.cleanup}.
   * @param filename - The name to store the media under (used verbatim, may be Unicode)
   * @param source - The media content as a file path, Buffer, or readable stream
   * @throws {Error} if a media file with that name already exists
   */
  public async addMediaFile(filename: string, source: string | Buffer | Readable): Promise<void> {
    await this.media.addMediaFile(filename, source);
  }

  /**
   * Removes a media file from the package and deletes its backing file.
   * @param filename - The media filename to remove
   * @throws {Error} if no media file with that name exists
   */
  public async removeMediaFile(filename: string): Promise<void> {
    await this.media.removeMediaFile(filename);
  }

  /**
   * Releases the temporary directory backing this package's media files.
   *
   * Safe to call when no media was ever added (a no-op). Because conversions
   * copy media content rather than sharing it, a source and target package have
   * independent lifetimes and must each be cleaned up by their owner.
   * @returns Any warnings raised while removing the temporary directory
   */
  public async cleanup(): Promise<ConversionIssue[]> {
    return await this.media.cleanup();
  }
}

export interface SrsDeck {
  /** UUIDv7 identifier */
  id: string;
  /** Name of the deck */
  name: string;
  /** Description of the deck */
  description?: string;
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

export interface SrsNote<T extends SrsNoteType = SrsNoteType> {
  /** UUIDv7 identifier */
  id: string;
  /** The note type of the note (UUIDv7) */
  noteTypeId: string;
  /** The deck of the note (UUIDv7) */
  deckId: string;
  /** The values of the fields as defined in the note type. */
  fieldValues: [name: T["fields"][number]["name"], value: string][];
  // /** Tags that are associated with the note */
  // tags?: string[];
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

export interface SrsCard<T extends SrsNoteType = SrsNoteType> {
  /** UUIDv7 identifier */
  id: string;
  /** The note of the card (UUIDv7) */
  noteId: string;
  /** The template used to generate this card (0, 1, 2, ...) */
  templateId: T["templates"][number]["id"];
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

export enum SrsReviewScore {
  Again = 1,
  Hard = 2,
  Normal = 3,
  Easy = 4,
}

export interface SrsReview {
  /** UUIDv7 identifier */
  id: string;
  /** The card that was reviewed (UUIDv7) */
  cardId: string;
  /** The timestamp of the review (unixtime in milliseconds) */
  timestamp: number;
  /** The review score */
  score: SrsReviewScore;
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

export interface SrsNoteField<TName = string> {
  /** 0, 1, 2, ... */
  id: number;
  /** Name of the field, e.g. "Question" or "Answer" */
  name: TName;
  /** Description of the field */
  description?: string;
}

export interface SrsNoteTemplate<TId = number> {
  /** 0, 1, 2, ... */
  id: TId;
  /** The name of the template, e.g. "Question > Answer" */
  name: string;
  /** The question template in Markdown, e.g. "{{Front}}" */
  questionTemplate: string;
  /** The answer template in Markdown, e.g. {{Back}} */
  answerTemplate: string;
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

export interface SrsNoteType {
  /** UUIDv7 identifier */
  id: string;
  /** Name of the note type, e.g. "Basic" */
  name: string;
  /** Fields, e.g. "Question" and "Answer" */
  fields: SrsNoteField[];
  /** Templates, e.g. "Front > Back" */
  templates: SrsNoteTemplate[];
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

export interface CreateCompleteDeck<T extends SrsNoteType = SrsNoteType> {
  deck: Omit<SrsDeck, "id">;
  noteTypes: (T & {
    notes: (Omit<SrsNote<T>, "id" | "deckId" | "noteTypeId"> & {
      id?: string;
      cards?: (Omit<SrsCard<T>, "id" | "noteId"> & {
        id?: string;
        reviews?: Omit<SrsReview, "id" | "cardId">[];
      })[];
    })[];
  })[];
}

/**
 * TODO: When notes with multiple note types are created, the type checking accepts the sum of all allowed values.
 * @param input The input data to create the complete deck structure
 * @returns The complete SRS package
 */
export function createCompleteDeckStructure<T extends SrsNoteType>(
  input: CreateCompleteDeck<T>,
): SrsPackage {
  const srsPackage = new SrsPackage();
  const deck = createDeck(input.deck);
  srsPackage.addDeck(deck);

  for (const nt of input.noteTypes) {
    srsPackage.addNoteType(createNoteType(nt));

    for (const n of nt.notes) {
      const fullNote = {
        ...n,
        deckId: deck.id,
        noteTypeId: nt.id,
        id: n.id ?? generateUuid(),
      };
      srsPackage.addNote(createNote(fullNote, nt));

      for (const c of n.cards ?? []) {
        const fullCard = {
          ...c,
          noteId: fullNote.id,
          id: c.id ?? generateUuid(),
        };
        srsPackage.addCard(createCard(fullCard));

        for (const r of c.reviews ?? []) {
          srsPackage.addReview(createReview({ ...r, cardId: fullCard.id }));
        }
      }
    }
  }

  return srsPackage;
}

export function createNoteType<TName extends string, TId extends number>(
  input: Omit<SrsNoteType, "fields" | "templates" | "id"> & {
    fields: SrsNoteField<TName>[];
    templates: SrsNoteTemplate<TId>[];
    id?: string;
  },
) {
  const id = input.id ?? generateUuid();

  return { ...input, id } satisfies SrsNoteType;
}

export function createDeck(
  input: Omit<SrsDeck, "id"> & {
    id?: string;
  },
): SrsDeck {
  const id = input.id ?? generateUuid();

  return { ...input, id } as SrsDeck;
}

export function createNote<T extends SrsNoteType>(
  input: Omit<SrsNote<T>, "id"> & { id?: string },
  noteType: T,
): SrsNote<T> {
  const providedFields = new Set(input.fieldValues.map(([name]) => name));
  const requiredFields = new Set(noteType.fields.map((field) => field.name));

  if (
    providedFields.size !== requiredFields.size ||
    ![...providedFields].every((field) => requiredFields.has(field))
  ) {
    throw new Error("Field names do not match the note type exactly");
  }

  const id = input.id ?? generateUuid();

  // Store field values in note-type field order regardless of the order the
  // caller supplied them. Downstream consumers (e.g. joining into Anki's `flds`)
  // rely on positional order, so accepting names-as-a-set but keeping the
  // caller's order would silently swap field content. The set-equality check
  // above guarantees every field name is present exactly once.
  const orderedFieldValues = noteType.fields.map((field): [string, string] => {
    const match = input.fieldValues.find(([name]) => name === field.name);
    return [field.name, match?.[1] ?? ""];
  });

  return { ...input, fieldValues: orderedFieldValues, id } as SrsNote<T>;
}

/**
 * Creates a card for a note.
 *
 * This should only be used internally.
 * When adding a note or changing templates, the cards should be created
 * automatically based on the note type's templates.
 * @param input The input data to create the card
 * @returns The created card with a generated ID
 */
export function createCard<T extends SrsNoteType>(
  input: Omit<SrsCard<T>, "id"> & { id?: string },
): SrsCard<T> {
  const id = input.id ?? generateUuid();

  return { ...input, id } as SrsCard<T>;
}

export function createReview(input: Omit<SrsReview, "id"> & { id?: string }): SrsReview {
  const id = input.id ?? generateUuid();

  return { ...input, id } as SrsReview;
}

export const BasicNote = {
  fields: [
    { id: 0, name: "Question" },
    { id: 1, name: "Answer" },
  ],
  id: "019343de-833d-736d-bcda-a75874b2e5a8",
  name: "Basic (srs-converter)",
  templates: [
    {
      answerTemplate: "{{Answer}}",
      id: 0,
      name: "Question > Answer",
      questionTemplate: "{{Question}}",
    },
  ],
} as const satisfies SrsNoteType;

export const BasicAndReverseNote = {
  fields: [
    { id: 0, name: "Front" },
    { id: 1, name: "Back" },
  ],
  id: "019343de-833d-736d-bcda-a97a136df584",
  name: "Basic and reverse (srs-converter)",
  templates: [
    {
      answerTemplate: "{{Back}}",
      id: 0,
      name: "Front > Back",
      questionTemplate: "{{Front}}",
    },
    {
      answerTemplate: "{{Front}}",
      id: 1,
      name: "Back > Front",
      questionTemplate: "{{Back}}",
    },
  ],
} as const satisfies SrsNoteType;

export const ClozeNote = {
  fields: [{ id: 0, name: "Text" }],
  id: "019343de-833d-736d-bcda-af3d2c567ea3",
  name: "Cloze (srs-converter)",
  templates: [
    {
      answerTemplate: "{{cloze:Text}}",
      id: 0,
      name: "Cloze",
      questionTemplate: "{{cloze:Text}}",
    },
  ],
} as const satisfies SrsNoteType;
