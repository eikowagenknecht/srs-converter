import { generateUuid } from "./anki/util";

/**
 * Represents a complete SRS (Spaced Repetition System) package containing all
 * necessary components for a learning system.
 *
 * This class manages the relationships between decks, notes, cards, and reviews,
 * ensuring referential integrity between components.
 */
export class SrsPackage {
  private decks: SrsDeck[];
  private noteTypes: SrsNoteType[];
  private notes: SrsNote[];
  private cards: SrsCard[];
  private reviews: SrsReview[];

  constructor() {
    this.decks = [];
    this.noteTypes = [];
    this.notes = [];
    this.cards = [];
    this.reviews = [];
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
    this.noteTypes = this.noteTypes.filter(
      (noteType) => noteType.id !== noteTypeId,
    );
  }

  public getNotes(): readonly SrsNote[] {
    return [...this.notes];
  }

  public addNote(note: SrsNote) {
    const noteTypeExists = this.noteTypes.some(
      (nt) => nt.id === note.noteTypeId,
    );
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
    if (!noteType || card.templateId >= noteType.templates.length) {
      throw new Error(`Invalid template ID ${card.templateId.toFixed()}.`);
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

  public removeUnused() {
    // Decks are used if they are referenced by any notes
    const usedDeckIds = new Set(this.notes.map((note) => note.deckId));
    this.decks = this.decks.filter((deck) => usedDeckIds.has(deck.id));

    // Note types are used if they are referenced by any notes
    const usedNoteTypeIds = new Set(this.notes.map((note) => note.noteTypeId));
    this.noteTypes = this.noteTypes.filter((noteType) =>
      usedNoteTypeIds.has(noteType.id),
    );

    // Notes are used if they are referenced by any cards
    const usedNoteIds = new Set(this.cards.map((card) => card.noteId));
    this.notes = this.notes.filter((note) => usedNoteIds.has(note.id));
  }
}

interface SrsDeck {
  /** UUIDv7 identifier */
  id: string;
  /** Name of the deck */
  name: string;
  /** Description of the deck */
  description?: string;
  /** Additional data that is specific to the application */
  applicationSpecificData?: Record<string, string>;
}

interface SrsNote<T extends SrsNoteType = SrsNoteType> {
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

interface SrsCard<T extends SrsNoteType = SrsNoteType> {
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

interface SrsReview {
  /** UUIDv7 identifier */
  id: string;
  /** The card that was reviewed (UUIDv7) */
  cardId: string;
  /** The timestamp of the review (unixtime in milliseconds) */
  timestamp: number;
  /** The review score */
  score: SrsReviewScore;
}

interface SrsNoteField<TName = string> {
  /** 0, 1, 2, ... */
  id: number;
  /** Name of the field, e.g. "Question" or "Answer" */
  name: TName;
  /** Description of the field */
  description?: string;
}

interface SrsNoteTemplate<TId = number> {
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

interface SrsNoteType {
  /** UUIDv7 identifier */
  id: string;
  /** Name of the note type, e.g. "Basic" */
  name: string;
  /** Fields, e.g. "Question" and "Answer" */
  fields: SrsNoteField[];
  /** Templates, e.g. "Front > Back" */
  templates: SrsNoteTemplate[];
}

export interface CreateCompleteDeck<T extends SrsNoteType = SrsNoteType> {
  deck: Omit<SrsDeck, "id">;
  noteTypes: (T & {
    notes: (Omit<SrsNote<T>, "id" | "deckId" | "noteTypeId"> & {
      cards?: (Omit<SrsCard<T>, "id" | "noteId"> & {
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
        id: generateUuid(),
      };
      srsPackage.addNote(createNote(fullNote, nt));

      for (const c of n.cards ?? []) {
        const fullCard = { ...c, noteId: fullNote.id, id: generateUuid() };
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
    !Array.from(providedFields).every((field) => requiredFields.has(field))
  ) {
    throw new Error("Field names do not match the note type exactly");
  }

  const id = input.id ?? generateUuid();

  return { ...input, id } as SrsNote<T>;
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

export function createReview(
  input: Omit<SrsReview, "id"> & { id?: string },
): SrsReview {
  const id = input.id ?? generateUuid();

  return { ...input, id } as SrsReview;
}

export const BasicNote = {
  id: "019343de-833d-736d-bcda-a75874b2e5a8",
  name: "Basic (srs-converter)",
  fields: [
    { id: 0, name: "Question" },
    { id: 1, name: "Answer" },
  ],
  templates: [
    {
      id: 0,
      name: "Question > Answer",
      questionTemplate: "{{Question}}",
      answerTemplate: "{{Answer}}",
    },
  ],
} as const satisfies SrsNoteType;

export const BasicAndReverseNote = {
  id: "019343de-833d-736d-bcda-a97a136df584",
  name: "Basic and reverse (srs-converter)",
  fields: [
    { id: 0, name: "Front" },
    { id: 1, name: "Back" },
  ],
  templates: [
    {
      id: 0,
      name: "Front > Back",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Back}}",
    },
    {
      id: 1,
      name: "Back > Front",
      questionTemplate: "{{Front}}",
      answerTemplate: "{{Back}}",
    },
  ],
} as const satisfies SrsNoteType;

export const ClozeNote = {
  id: "019343de-833d-736d-bcda-af3d2c567ea3",
  name: "Cloze (srs-converter)",
  fields: [{ id: 0, name: "Text" }],
  templates: [
    {
      id: 0,
      name: "Cloze",
      questionTemplate: "{{cloze:Text}}",
      answerTemplate: "{{cloze:Text}}",
    },
  ],
} as const satisfies SrsNoteType;
