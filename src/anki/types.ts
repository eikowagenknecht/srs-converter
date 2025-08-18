/**
 * This file contains types representing Ankis APKG format v11.
 * The v18 format is not supported yet and will be in a separate file.
 *
 * For an exhaustive description see https://eikowagenknecht.de/posts/anki-apkg-format/ (post not written yet, "dissecting the anki apkg format" in the draft)
 */

/**
 * This is a complete (raw) representation of the Anki database, schema v11.
 * It is used to access the database with Kysely.
 */
export interface DBTables {
  cards: CardsTable;
  notes: NotesTable;
  col: ColTableRaw;
  revlog: RevlogTable;
  graves: GravesTable;
}

/**
 * This is mostly the same as `DBTables`, but with the `col` table parsed already.
 */
export interface DatabaseDump {
  cards: CardsTable[];
  notes: NotesTable[];
  collection: ColTable;
  reviews: RevlogTable[];
  deletedItems: GravesTable[];
}

/**
 * Representation of the Anki `notes` table (v11)
 *
 * Notes contain the information that is later used to create cards.
 *
 * In Anki, notes do not belong to a specific deck.
 * Instead, they are associated with decks through cards.
 * So there is no `did` (deck id) field in this table.
 */
export interface NotesTable {
  /**
   * A unique identifier of the note.
   *
   * Must be an integer >= 1.
   * Anki uses unix time in milliseconds when creating the note.
   */
  id: number;
  /**
   * Globally unique 10 characters long, base91 encoded 64-bit number.
   * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/pylib/anki/utils.py#L124
   * @see https://github.com/ankitects/anki/blob/15b48cf894b6c258b0a08b9e7a37bb47aba447dd/rslib/src/notes/mod.rs#L326
   */
  guid: string;
  /**
   * Model id (see the `models` field of the `col` table).
   */
  mid: number;
  /**
   * When the note was last modified.
   *
   * Must be an integer, unix time in seconds.
   */
  mod: number;
  /**
   * Update sequence number: Starts with 0, incremented when the note is changed.
   * Used for syncing.
   */
  usn: number;
  /**
   * Tags of the note.
   * The tags are stored as a single string, separated by spaces.
   */
  tags: string;
  /**
   * Values of the fields in this note.
   * The fields are stored as a single string, separated by 0x1f characters.
   */
  flds: string;
  /**
   * A string used as "Sort Field" in the "Browse" view in Anki.
   * Seems to default to the content of the first field in the `flds` column.
   *
   * Note: In the Anki database, the column is of type `integer` for sorting reasons.
   */
  sfld: string;
  /**
   * Checksum, 32 bit unsigned integer consisting of the first 8 digits of the
   * sha1 hash of the stripped first field in the `flds` column.
   * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/pylib/anki/importing/noteimp.py#L161C20-L161C34
   * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/pylib/anki/utils.py#L151
   */
  csum: number;
  /**
   * Not used. Cards can have flags, though, see the `cards` table.
   * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/pylib/anki/notes.py#L31
   */
  flags: number;
  /**
   * Additional data. This is usually an empty string, but can be used by
   * add-ons to store additional information.
   * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/pylib/anki/notes.py#L32
   */
  data: string;
}

/**
 * Representation of the Anki `cards` table (v11)
 *
 * Each row represents a card generated from a note. These are the actual cards
 * that the user reviews. There can be multiple cards for a single note,
 * depending on the note type and the card templates.
 */
export interface CardsTable {
  /** When the card was created (in unix time, milliseconds). */
  id: number | null;
  /** The corresponding note id. Reference to the `notes.id` column. */
  nid: number;
  /**
   * The corresponding deck id.
   * Reference to a JSON object key in the `col.decks` column.
   *
   * Note: Anki stores the deck reference for the card and not the note.
   */
  did: number;
  /**
   * Identifies the card template used to generate this card from the note.
   * 0 is the first card template, 1 the second, and so on.
   * For cloze deletions, this is the index of the cloze deletion in the note,
   * starting at 0 (despite cloze deletions starting from c1 in the UI).
   *
   * Hint: For image occlusions (which are a special case of cloze deletions),
   * text on the image is stored as {{c0::...}}. These are not real clozes and
   * don't get any card.
   */
  ord: number;
  /** When the card was last modified (in unix time, seconds). */
  mod: number;
  /**
   * Update sequence number: Incremented when the card is changed.
   * Used for syncing.
   *
   * Must be an integer >= -1.
   */
  usn: number;
  /**
   * The card type.
   * @default 0 (CardType.NEW)
   */
  type: CardType;
  /**
   * The queue the card is in.
   * 0 = new, 1 = learn, 2 = review, 3 = daylearn, 4 = previewrepeat
   * -1 = suspended, -2 = buried by scheduler, -3 = buried by user
   * @default 0 (QueueType.NEW)
   */
  queue: QueueType;
  /**
   * This has a very different meaning for different queue values.
   * For queue = 0 (new), it is the order the cards are to be studied (starting at 1).
   * For queue = 1 (learn) and 4 (previewrepeat), it is a unix timestamp of the next time the card is due.
   * For queue = 2 (review) and 3 (daylearn), it is the number of days since the card was created.
   * For queue = -1, -2, -3, it is not set, because these cards are not due.
   */
  due: number;
  /**
   * Interval in days after which the card is due again.
   * Warning: Negative values instead describe the time in seconds (!) until the card is due again.
   * They are used in the following circumstances:
   * The v2 scheduler uses negative values only for (re)learning cards.
   * The v3 scheduler uses negative values only for intraday (re)learning cards.
   * @default 0
   */
  ivl: number;
  /**
   * Ease factor of the card (part of the algorithm to calculate the next interval).
   * @default 0
   */
  factor: number;
  /**
   * Number of times the card was reviewed.
   * @default 0
   */
  reps: number;
  /**
   * Number of times the card was answered incorrectly after a previous correct answer.
   * @default 0
   */
  lapses: number;
  /**
   * Number of reviews left until the card graduates (becomes a review card).
   * @default 0
   */
  left: number;
  /**
   * Original due date of the card (in unix time), before the card moved to a filtered deck.
   * Irrelevant outside filtered decks.
   * @default 0
   */
  odue: number;
  /**
   * Original deck id of the card (see `did` field), before the card moved to a filtered deck.
   * Irrelevant outside filtered decks.
   * @default 0
   */
  odid: number;
  /**
   * Flags of the card. Despite the name, it is not a bitfield, but a single integer.
   * 1 = Red, 2 = Orange, 3 = Green, 4 = Blue, 5 = Pink, 6 = Turquoise, 7 = Purple
   */
  flags: FlagType;
  /**
   * Additional data. This is usually an empty string, but can be used by add-ons to store additional information.
   */
  data: string;
}

/**
 * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/rslib/src/card/mod.rs#L40
 */
export enum CardType {
  /** New card, not yet studied */
  NEW = 0,
  /** Learning card, in the learning phase */
  LEARN = 1,
  /** Review card, in the review phase */
  REVIEW = 2,
  /** Relearning card, in the relearning phase */
  RELEARN = 3,
}

/**
 * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/rslib/src/card/mod.rs#L49
 */
export enum QueueType {
  /** New card, not yet studied */
  NEW = 0,
  /** Learning card, in the learning phase */
  LEARN = 1,
  /** Review card, in the review phase */
  REVIEW = 2,
  /** Daylearn card */
  DAYLEARN = 3,
  /** Previewrepeat card */
  PREVIEWREPEAT = 4,
  /** Suspended card */
  SUSPENDED = -1,
  /** Buried by scheduler */
  BURIED_BY_SCHEDULER = -2,
  /** Buried by user */
  BURIED_BY_USER = -3,
}

/**
 * @see https://github.com/ankitects/anki/blob/f927aa5788aef7c5a1595b2dc4879db82725f8c6/rslib/src/browser_table.rs#L667
 */
export enum FlagType {
  /** No flag */
  NONE = 0,
  /** Red flag */
  RED = 1,
  /** Orange flag */
  ORANGE = 2,
  /** Green flag */
  GREEN = 3,
  /** Blue flag */
  BLUE = 4,
  /** Pink flag */
  PINK = 5,
  /** Turquoise flag */
  TURQUOISE = 6,
  /** Purple flag */
  PURPLE = 7,
}

/**
 * Representation of the Anki `revlog` table (v11)
 *
 * Each row represents a review of a card.
 */
export interface RevlogTable {
  /**
   * When the review was done.
   *
   * Must be an integer, unix time in milliseconds.
   */
  id: number | null;
  /**
   * The id of the card that was reviewed. Reference to the `cards.id` column.
   */
  cid: number;
  /**
   * Update sequence number: Incremented when the review is changed.
   * Used for syncing.
   *
   * Must be an integer >= 0.
   */
  usn: number;
  /**
   * How the card was answered (1 = again, 2 = hard, 3 = good, 4 = easy).
   */
  ease: Ease;
  /**
   * Interval in days after which the card was due again.
   * Warning: Negative values instead describe the time in seconds (!) until the card was due again.
   */
  ivl: number;
  /**
   * Previous value of `ivl`. This is *not* the actual time since the last review.
   */
  lastIvl: number;
  /**
   * Ease factor of the card after answering.
   * For the Anki SM-2 algorithm, this is between 1300 and 2500.
   * For the Anki FSRS algorithm, this is between 100 and 1100, which represent the values "0 %" to "100 %"
   */
  factor: number;
  /**
   * The number of milliseconds the review took.
   * Capped at 60000 (1 minute) for scheduler v2, possibly uncappped for scheduler v3.
   */
  time: number;
  /**
   * Review type (0 = learning, 1 = review, 2 = relearning, 3 = filtered, 4 = manual, 5 = rescheduled).
   * 3 (filtered) was called "cram" or "early" in older versions.
   * It's assigned when cards are reviewed when they are not due, or when rescheduling is disabled.
   */
  type: ReviewType;
}

export enum Ease {
  /** The card was answered with "Again" */
  AGAIN = 1,
  /** The card was answered with "Hard" */
  HARD = 2,
  /** The card was answered with "Good" */
  GOOD = 3,
  /** The card was answered with "Easy" */
  EASY = 4,
}

export enum ReviewType {
  /** Learning review */
  LEARNING = 0,
  /** Regular review */
  REVIEW = 1,
  /** Relearning review */
  RELEARNING = 2,
  /**
   * Filtered review.
   * This was called "cram" or "early" in older versions.
   * Used when cards are reviewed when they are not due.
   */
  FILTERED = 3,
  /** Manual review */
  MANUAL = 4,
  /** Rescheduled review */
  RESCHEDULED = 5,
}

/**
 * Representation of the Anki `col` table (v11)
 *
 * This version is the raw representation, meaning it does not parse the JSON fields.
 *
 * See `ColTable` for the parsed version and comments on the fields.
 */
interface ColTableRaw {
  id: number;
  crt: number;
  mod: number;
  scm: number;
  ver: number;
  dty: number;
  usn: number;
  ls: number;
  conf: string;
  models: string;
  decks: string;
  dconf: string;
  tags: string;
}

/**
 * Representation of the Anki `col` table (v11)
 *
 * This table contains the collection information, which is the metadata of the deck.
 * It has exactly one row.
 */
export interface ColTable {
  /**
   * "1" as there is only one collection.
   *
   * Must be an integer >= 1.
   * @default 1
   */
  id: number;
  /**
   * When the collection was created.
   * Only takes the day into account and sets the time to 04:00 local time on creation.
   *
   * Must be an integer, unix time in seconds.
   */
  crt: number;
  /**
   * When the collection was last modified.
   *
   * Must be an integer, unix time in milliseconds.
   */
  mod: number;
  /**
   * When the schema was last modified.
   *
   * Must be an integer, unix time in milliseconds.
   */
  scm: number;
  /**
   * Schema version of the collection.
   *
   * This is always "11" for the "Legacy 2" format.
   * @default 11
   */
  ver: number;
  /**
   * Dirty flag. Not used anywhere.
   *
   * Must be 0 or 1.
   * @default 0
   */
  dty: number;
  /**
   * Update sequence number: Incremented when the collection is changed.
   * Used for syncing.
   *
   * Must be an integer >= 0.
   * @default 0
   */
  usn: number;
  /**
   * When the collection was last synced.
   *
   * Must be an integer, unix time in milliseconds.
   */
  ls: number;
  /**
   * JSON object containing configuration options.
   */
  conf: Config;
  /**
   * JSON object containing the models (note types) in the collection.
   */
  models: NoteTypes;
  /**
   * JSON object containing the decks in the collection.
   */
  decks: Decks;
  /**
   * JSON object containing the deck options in the collection.
   */
  dconf: DeckConfigs;
  /**
   * JSON object containing the tags in the collection.
   *
   * Note: The tags for the notes are stored in the `notes.tags` field.
   * I have never seen this with any value but an empty "{}".
   * Maybe it's not used.
   */
  tags: Record<string, never>;
}

export interface Config {
  /**
   * Also known as  "ShowRemainingDueCountsInStudy" in the Anki Rust codebase.
   *
   * Anki GUI: "Preferences > Review > Show remaining card count"
   * @default true
   */
  dueCounts: boolean;
  /**
   * Timezone offset in minutes from when the collection was created.
   * Used in the scheduler to decide when the day ends.
   *
   * Must be an integer, in minutes.
   * @default The timezone offset of the system at the time of collection creation.
   * @example -120 for UTC+2
   */
  creationOffset: number;
  /**
   * Also known as "ShowIntervalsAboveAnswerButtons" in the Anki Rust codebase.
   *
   * Anki GUI: "Preferences > Review > Show next review time above answer buttons"
   * @default true
   */
  estTimes: boolean;
  /**
   * Also known as "ShowAnswerTimeInReview" in the Anki Rust codebase.
   * @default false
   */
  dayLearnFirst: boolean;
  /**
   * In which order to view to review the cards.
   *
   * Also known as "NewReviewMix" in the Anki Rust codebase.
   *
   * Anki GUI: "Deck Options > Display Order > New/review order"
   * @default 0 (NewSpread.DISTRIBUTE)
   */
  newSpread: NewSpread;
  /**
   * Also known as "SchedulerVersion" in the Anki Rust codebase.
   *
   * Despite there being a "v3" scheduler, this stays on "v2" because the v3
   * scheduler uses the same database schema as the v2 scheduler. Instead for
   * v3, "sched2021" is set to true.
   * @default 2
   */
  schedVer: SchedulerVersion;
  /**
   * If there is no more card to review now, but the next card in learning is in
   * less than collapseTime seconds, show it now.
   *
   * Also known as "LearnAheadSecs" in the Anki Rust codebase.
   *
   * Anki GUI: "Preferences > Review > Scheduler > Learn ahead limit"
   * The value is seconds, despite the UI showing it in minutes.
   * @default 1200 (20 minutes)
   */
  collapseTime: number;
  /**
   * Id of the last note type ("model") used.
   * Updated either when creating a note, or changing the note type of a note.
   *
   * Must be an integer, unix time in milliseconds.
   *
   * Note: When Anki (tested with 25.02.7) exports the collection, some value
   * is set here that does not correspond to any note type, probably a bug. On
   * the plus side, it seems to not be important for the collection.
   */
  curModel: number;
  /**
   * Whether the 2021 scheduler ("v3") is used or not.
   * @default true
   */
  sched2021: boolean;
  /**
   * Also known as "AnswerTimeLimitSecs" in the Anki Rust codebase.
   *
   * Anki GUI: "Preferences > Review > Scheduler > Timebox time limit"
   *
   * The value is in seconds, despite the UI showing it in minutes.
   * @default 0 (meaning no time limit)
   * @example 300 for 5 minutes
   */
  timeLim: number;
  /**
   * List containing the current deck id and its descendant.
   *
   * Array of deck ids (integers).
   * @default [1]
   */
  activeDecks: number[];
  /**
   * A string representing how the browser is sorted.
   *
   * Hint: Typing may not be completely accurate as the Anki code base is
   * quite complex here and I might have misinterpreted some things.
   * @default "noteFld"
   */
  sortType:
    | "noteFld" // SortField
    | "noteCrt" // NoteCreation
    | "cardMod" // CardMod
    | "cardDue" // Due
    | "cardEase" // Ease
    | "cardLapses" // Lapses
    | "cardIvl" // Interval
    | "cardReps" // Reps
    | "noteTags" // Tags
    | "template"; // Cards
  /**
   * The id of the last deck selected (during review, adding cards, changing the
   * deck of a card).
   *
   * Also known as "CurrentDeckId" in the Anki Rust codebase.
   * @default 1
   */
  curDeck: number;
  /**
   * This is the next position a card will get (currently highest position + 1).
   * Starts with 1.
   * Used to ensure that cards are seen in order in which they are added.
   *
   * Also known as "NextNewCardPosition" in the Anki Rust codebase.
   * @default 1
   */
  nextPos: number;
  /**
   * Whether new cards are sorted backwards in the card browser.
   * @default false
   */
  sortBackwards: boolean;
  /**
   * Also known as "AddingDefaultsToCurrentDeck" in the Anki Rust codebase
   *
   * Anki GUI: "Preferences > Editing > Default deck: 'When adding, default to current deck' (true) or 'Change deck depending on note type' (false)"
   * @default true
   */
  addToCur: boolean;
}

enum NewSpread {
  /** Distribute new cards throughout the review session */
  DISTRIBUTE = 0,
  /** Show all review cards before new cards */
  REVIEWS_FIRST = 1,
  /** Show all new cards before review cards */
  NEW_FIRST = 2,
}

enum SchedulerVersion {
  /** Legacy v1 scheduler */
  V1 = 1,
  /** Modern v2 scheduler (also used for v3 together with the sched2021 flag) */
  V2 = 2,
}

/**
 * Representation of the Anki `graves` table (v11)
 *
 * This table is used to store the IDs of deleted cards and notes.
 */
interface GravesTable {
  /**
   * Update sequence number: Incremented when a card or note is deleted.
   * Used for syncing.
   *
   * Must be an integer >= 0.
   */
  usn: number;
  /**
   * Original ID of the deleted card or note.
   */
  oid: number;
  /**
   * Type of the deleted object.
   */
  type: ObjectType;
}

export enum ObjectType {
  /** Deleted card */
  CARD = 0,
  /** Deleted note */
  NOTE = 1,
  /** Deleted deck */
  DECK = 2,
}

export type Decks = Record<string, Deck>;

export interface Deck {
  /**
   * When the deck was created.
   *
   * Must be an integer >= 1.
   * Anki uses unix time in milliseconds when creating the note type.
   * The exception is the default deck, which has the id 1.
   */
  id: number;
  /**
   * When the deck was last modified.
   *
   * Must be an integer, unix time in seconds.
   */
  mod: number;
  /**
   * The name of the deck as shown in the Anki UI.
   */
  name: string;
  /**
   * Update sequence number: Incremented when the deck is changed.
   * Used for syncing.
   *
   * Must be an integer >= 0.
   */
  usn: number;
  /**
   * Cards in the "Learn" status.
   *
   * The first number is the number of days that have passed between creation of
   * the collection and the last update of the deck.
   *
   * The second number is the number of cards seen today in this deck minus the
   * number of new cards in custom study today.
   * @default [0, 0]
   */
  lrnToday: [number, number];
  /**
   * Cards in the "Due" status.
   *
   * The first number is the number of days that have passed between creation of
   * the collection and the last update of the deck.
   *
   * The second number is the number of cards seen today in this deck minus the
   * number of new cards in custom study today.
   * @default [0, 0]
   */
  revToday: [number, number];
  /**
   * Cards in the "New" status.
   *
   * The first number is the number of days that have passed between creation of
   * the collection and the last update of the deck.
   *
   * The second number is the number of cards seen today in this deck minus the
   * number of new cards in custom study today.
   * @default [0, 0]
   */
  newToday: [number, number];
  /**
   * Supposedly unused, but present in the database.
   *
   * The first number is the number of days that have passed between creation of
   * the collection and the last update of the deck.
   * @default [0, 0]
   */
  timeToday: [number, number];
  /**
   * UI state, whether the deck is collapsed in the main window.
   * @default true
   */
  collapsed: boolean;
  /**
   * UI state, whether the deck is collapsed in the browser.
   * @default true
   */
  browserCollapsed: boolean;
  /**
   * Description of the deck as shown in the UI.
   * The string is interpreted as HTML.
   */
  desc: string;
  /**
   * Whether the deck is static or dynamic.
   * @default 0 (DeckDynamicity.STATIC)
   */
  dyn: DeckDynamicity;
  /**
   * Id of the deck configuration entry (see DeckConfig).
   */
  conf: number;
  /**
   * Extended new card limit (per day) for custom study.
   * @default 0
   */
  extendNew: number;
  /**
   * Extended maximum reviews limit (per day) for custom study.
   * @default 0
   */
  extendRev: number;
  /**
   * Maximum reviews (per day)
   * @default null
   */
  reviewLimit: number | null;
  /**
   * New card limit (per day).
   * @default null
   */
  newLimit: number | null;
  /**
   * Seems to be unused and just set to reviewLimit.
   * @default null
   */
  reviewLimitToday: number | null;
  /**
   * Seems to be unused and just set to newLimit.
   * @default null
   */
  newLimitToday: number | null;
}

export enum DeckDynamicity {
  /** The deck is static. */
  STATIC = 0,
  /** The deck is dynamic (e.g. filtered decks). */
  DYNAMIC = 1,
}

export type DeckConfigs = Record<string, DeckConfig>;

/**
 * A Deck option.
 *
 * In the Anki UI, this is shown as "Options" in the deck context menu, but also
 * referred to as "Preset". Technically it's termed "Deck Configuration" so we'll
 * use that here.
 */
export interface DeckConfig {
  /**
   * When the deck configuration was created (in unix time, milliseconds).
   *
   * Must be an integer >= 1.
   * Anki uses unix time in milliseconds when creating the note type.
   * The exception is the default deck configuration, which has the id 1.
   */
  id: number;
  /**
   * When the deck configuration was last modified.
   *
   * Must be an integer, unix time in seconds.
   */
  mod: number;
  /**
   * The name of the deck configuration as shown in the Anki UI.
   */
  name: string;
  /**
   * Update sequence number: incremented when the deck configuration is changed.
   * Used for syncing.
   *
   * Must be an integer >= 0.
   * @default 0
   */
  usn: number;
  /**
   * The number of seconds after which to stop the timer.
   *
   * Anki GUI: "Deck Options > Timers > Maximum answer seconds"
   * @default 60 (1 minute)
   */
  maxTaken: number;
  /**
   * Whether the audio associated to a question should be played when the
   * question is shown.
   *
   * Inverse of Anki GUI: "Deck Options > Audio > Don't play automatically"
   * @default true
   */
  autoplay: boolean;
  /**
   * Whether the timer should be shown (1) or not (0).
   *
   * Anki GUI: "Deck Options > Timers > Show on-screen timer."
   *
   * Must be an integer, either 0 or 1.
   * @default 0
   */
  timer: number;
  /**
   * Whether the question audio should be included when the Replay action is
   * used while looking at the answer side of a card.
   * @default true
   */
  replayq: boolean;
  /**
   * Configuration for "new" cards.
   */
  new: {
    /**
     * Whether to bury cards related to new cards answered.
     * @default false
     */
    bury: boolean;
    /**
     * @default [1.0, 10.0]
     */
    delays: number[];
    /**
     * @default 2500
     */
    initialFactor: number;
    /**
     * @default [1, 4, 0]
     */
    ints: [number, number, number];
    /**
     * @default 1
     */
    order: number;
    /**
     * @default 20
     */
    perDay: number;
  };
  /**
   * Configuration for "review" cards.
   */
  rev: {
    /**
     * Whether to bury cards related to new cards answered.
     * @default false
     */
    bury: boolean;
    /**
     * An extra multiplier that is applied to a review card's interval when you rate it "Easy".
     * @default 1.3
     */
    ease4: number;
    /**
     * Multiplication factor applied to the intervals Anki generates.
     * @default 1.0
     */
    ivlFct: number;
    /**
     * The maximum number of days a review card will wait.
     * When reviews have reached the limit, Hard, Good and Easy will all give
     * the same delay. The shorter you set this, the greater your workload will be.
     * @default 36500
     */
    maxIvl: number;
    /**
     * Numbers of cards to review per day.
     * @default 200
     */
    perDay: number;
    /**
     * The multiplier applied to a review interval when answering "Hard".
     * @default 1.2
     */
    hardFactor: number;
  };
  /**
   * Configuration for "lapse" cards.
   */
  lapse: {
    /**
     * The list of successive delay between the learning steps of the new cards, as explained in the manual.
     * @default [10.0]
     */
    delays: number[];
    /**
     * What to do to leech cards.
     * @default 1 (LeechAction.MARK)
     */
    leechAction: LeechAction;
    /**
     * The number of times "Again" needs to be pressed on a review card before it is marked as a leech.
     * @default 8
     */
    leechFails: number;
    /**
     * The minimum interval given to a review card after answering "Again".
     * @default 1
     */
    minInt: number;
    /**
     * Percent by which to multiply the current interval when a card has lapsed.
     * @default 0.0
     */
    mult: number;
  };
  /**
   * Whether this deck is dynamic. Not clear if this takes precedence over the "dyn" property of the deck.
   * @default false
   */
  dyn: boolean;
  /**
   * When to show new cards in relation to review cards.
   *
   * Anki GUI: "Deck Options > Display Order > New/review order"
   *
   * Enum values unknown.
   * @default 0
   */
  newMix: number;
  /**
   * @default 0
   */
  newPerDayMinimum: number;
  /**
   * When to show (re)learning cards that cross a day boundary.
   *
   * Anki GUI: "Deck Options > Display Order > Interday learning/review order"
   *
   * Enum values unknown.
   * @default 0
   */
  interdayLearningMix: number;
  /**
   * Anki GUI: "Deck Options > Display Order > Review sort order"
   *
   * Enum values unknown.
   * @default 0
   */
  reviewOrder: number;
  /**
   * New card sort order
   *
   * Anki GUI: "Deck Options > Display Order > New card sort order"
   *
   * Enum values unknown.
   * @default 0
   */
  newSortOrder: number;
  /**
   * New card gather order
   *
   * Anki GUI: "Deck Options > Display Order > New card gather order"
   *
   * Enum values unknown.
   * @default 0
   */
  newGatherPriority: number;
  /**
   * Whether other learning cards of the same note with intervals > 1 day will
   * be delayed until the next day.
   *
   * Anki GUI: "Deck Options > Burying > Bury interday learning siblings"
   * @default false
   */
  buryInterdayLearning: boolean;
  /**
   * The weights to use for the FSRS algorithm.
   *
   * Anki GUI: "Deck Options > FSRS > FSRS parameters"
   * @default []
   */
  fsrsWeights: number[];
  /**
   * The desired retention rate for the FSRS algorithm.
   *
   * Value between 0 and 1, where 0 means 0% and 1 means 100%.
   *
   * Anki GUI: "Deck Options > FSRS > Desired retention rate"
   * @default 0.9
   */
  desiredRetention: number;
  /**
   * Some option of the FSRS algorithm.
   * @default ""
   */
  ignoreRevlogsBeforeDate: string;
  /**
   * Whether to stop the on-screen timer when the answer is revealed.
   * This doesn't affect statistics.
   *
   * Anki GUI: "Deck Options > Timers > Stop on-screen timer on answer"
   * @default false
   */
  stopTimerOnAnswer: boolean;
  /**
   * When auto advance is activated, the number of seconds to wait before
   * applying the question action.
   *
   * Set to 0 to disable.
   *
   * Anki GUI: "Deck Options > Auto Advance > Seconds to show question for"
   * @default 0.0
   */
  secondsToShowQuestion: number;
  /**
   * When auto advance is activated, the number of seconds to wait before
   * applying the answer action.
   *
   * Set to 0 to disable.
   *
   * Anki GUI: "Deck Options > Auto Advance > Seconds to show answer for"
   * @default 0.0
   */
  secondsToShowAnswer: number;
  /**
   * The action to perform after the question is shown, and time has elapsed.
   *
   * Anki GUI: "Deck Options > Auto Advance > Question action"
   * @default 0 (QuestionAction.SHOW_ANSWER)
   */
  questionAction: QuestionAction;
  /**
   * The action to perform after the answer is shown, and time has elapsed.
   *
   * Anki GUI: "Deck Options > Auto Advance > Answer action"
   * @default 0 (AnswerAction.BURY_CARD)
   */
  answerAction: AnswerAction;
  /**
   * Wait for audio to finish before automatically applying the question action
   * or answer action.
   *
   * Anki GUI: "Deck Options > Auto Advance > Wait for audio"
   * @default true
   */
  waitForAudio: boolean;
  /**
   * Seems to be unused.
   * @default 0.9
   */
  sm2Retention: number;
  /**
   * Unknown
   * @default ""
   */
  weightSearch: string;
}

enum LeechAction {
  /** Suspend the card. */
  SUSPEND = 0,
  /** Mark the card. */
  MARK = 1,
}

enum QuestionAction {
  /** Show answer. */
  SHOW_ANSWER = 0,
  /** Show reminder. */
  SHOW_REMINDER = 1,
}

enum AnswerAction {
  /** Bury card. */
  BURY_CARD = 0,
  /** Answer again. */
  ANSWER_AGAIN = 1,
  /** Answer good. */
  ANSWER_GOOD = 2,
  /** Answer hard. */
  ANSWER_HARD = 3,
  /** Show reminder. */
  SHOW_REMINDER = 4,
}

/**
 * Representation of the Anki `models` column.
 *
 * This column contains the note types in the collection.
 * Each note type can have multiple templates and fields.
 *
 * Note: This is a JSON object where the keys are the note type IDs
 * (=unix time in milliseconds).
 */
export type NoteTypes = Record<string, NoteType>;

/**
 * Representation of a note type in Anki.
 */
export interface NoteType {
  /**
   * When the note type was created.
   * The value is also used as the key in the `models` JSON object.
   *
   * Must be an integer >=1.
   * Anki uses unix time in milliseconds when creating the note type.
   */
  id: number;
  /**
   * The name of the note type as shown in the Anki UI.
   * @example "Basic", "Cloze", "Basic (and reversed card)", ...
   */
  name: string;
  /**
   * The type of the note (standard or cloze).
   * @default 0 (NoteTypeKind.STANDARD)
   */
  type: NoteTypeKind;
  /**
   * When the note type was last modified.
   *
   * Must be an integer, unix time in seconds.
   */
  mod: number;
  /**
   * Update sequence number: Incremented when the note type is changed.
   * Used for syncing.
   *
   * Must be an integer >= 0.
   * @default 0
   */
  usn: number;
  /**
   * Specifies which field is used for sorting notes in the browser.
   * Seems to refer to the "ord" property of the Field.
   *
   * Must be an integer >= 0.
   * @default 0
   */
  sortf: number;
  /**
   * The corresponding deck id.
   * Reference to a JSON object key in the `col.decks` column.
   * Can also be `null` if the note type is not associated with a deck.
   * @default null
   */
  did: number | null;
  /**
   * Card templates for the note type.
   */
  tmpls: Template[];
  /**
   * Fields of the note type.
   */
  flds: Field[];
  /**
   * Custom CSS that is applied to all templates.
   *
   * Hint: In the Anki GUI, this is shown below "Note Types > Cards > Styling"
   * despite being applied to all templates.
   * @default ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n"
   */
  css: string;
  /**
   * This LaTeX code is put before each LaTeX content for this note type.
   *
   * Anki GUI: "Note Types > Options > LaTeX > Header"
   * @default "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n"
   */
  latexPre: string;
  /**
   * This LaTeX code is put after each LaTeX content for this note type.
   *
   * Anki GUI: "Note Types > Options > LaTeX > Footer"
   * @default "\\end{document}"
   */
  latexPost: string;
  /**
   * Whether to convert LaTeX to SVG images.
   *
   * Anki GUI: "Note Types > Options > LaTeX > Create scalable images with dvisvgm"
   * @default false
   */
  latexsvg: boolean | null;
  /**
   * Not in use since 2021 (https://forums.ankiweb.net/t/is-req-still-used-or-present/9977)
   */
  req: [number, "any" | "all", number[]][];
  /**
   * The original kind of the note type. Only set for the original Anki note types.
   */
  originalStockKind: OriginalStockKind | null;
}

export enum NoteTypeKind {
  /** Standard note type. */
  STANDARD = 0,
  /** Cloze deletion note type. */
  CLOZE = 1,
}

enum OriginalStockKind {
  /** Unknown note type, probably not used. */
  UNKNOWN = 0,
  /** Basic note type, with one card. */
  BASIC = 1,
  /** Basic note type, with one card and a reversed card. */
  BASIC_AND_REVERSED = 2,
  /** Basic note type, with one card and optional reversed card. */
  BASIC_OPTIONAL_REVERSED = 3,
  /** Basic note type, with one card, where the user can type the answer. */
  BASIC_TYPING = 4,
  /** Cloze deletion note type, with one card per cloze deletion. */
  CLOZE = 5,
  /** Cloze deletion note type, but with images instead of text. */
  IMAGE_OCCLUSION = 6,
}

interface Template {
  /**
   * A randomly generated ID, probably between
   * -9999999999999999999n and 9999999999999999999n
   *
   * Warning: This is problematic, because the JSON parser might not be able to
   * handle such large integers and might convert them to the nearest safe
   * integer, losing precision and thus making the ID unusable.
   */
  id: number | bigint | null;
  /**
   * The name of the template as shown in the Anki UI.
   * @example "Card 1", "Card 2", "Cloze", ...
   */
  name: string;
  /**
   * Number of the template in the note type.
   * 0 is the first template, 1 the second, and so on.
   *
   * Must be an integer >= 0.
   */
  ord: number;
  /**
   * Question format.
   *
   * Anki GUI: "Note Types > Cards > Template > Front Template"
   * @example `{{Front}}`
   */
  qfmt: string;
  /**
   * Answer format.
   *
   * Anki GUI: "Note Types > Cards > Template > Back Template"
   * @example `{{Back}}`
   */
  afmt: string;
  /**
   * Browser question format.
   * This is used in the "Browse" view in Anki.
   *
   * Anki GUI: "Note Types > Cards > Options > Browser Appearance > Override front template"
   * @default ""
   */
  bqfmt: string;
  /**
   * Browser answer format.
   * This is used in the "Browse" view in Anki.
   *
   * Anki GUI: "Note Types > Cards > Options > Browser Appearance > Override back template"
   * @default ""
   */
  bafmt: string;
  /**
   * Id of the deck where cards with this template are created.
   * If this is `null`, the template is not associated with a deck.
   *
   * Anki GUI: "Note Types > Cards > Options > Deck Override"
   * @default null
   */
  did: number | null;
  /**
   * Name of the font to use in the Anki Browser.
   * When empty, the default font is used.
   *
   * Anki GUI: "Note Types > Cards > Options > Browser Appearance > Override font > Name"
   * @default ""
   */
  bfont: string;
  /**
   * Size of the font to use in the Anki Browser.
   * When 0, the default font size is used.
   *
   * Anki GUI: "Note Types > Cards > Options > Browser Appearance > Override font > Size"
   *
   * Must be an integer >= 0.
   * @default 0
   * @example 20
   */
  bsize: number;
}

export interface Field {
  /**
   * A randomly generated ID, probably between
   * -9999999999999999999n and 9999999999999999999n
   *
   * Warning: This is problematic, because the JSON parser might not be able to
   * handle such large integers and might convert them to the nearest safe
   * integer, losing precision and thus making the ID unusable.
   */
  id: number | bigint | null;
  /**
   * The name of the field as shown in the Anki UI.
   * @example "Front", "Back", "Extra", ...
   */
  name: string;
  /**
   * The order of the field in the note type.
   * 0 is the first field, 1 the second, and so on.
   *
   * Must be an integer >= 0.
   */
  ord: number;
  /**
   * Whether the field retains the value that was last added when adding new notes.
   * @default false
   */
  sticky: boolean;
  /**
   * Whether the field uses RTL script.
   *
   * Anki GUI: "Note Types > Fields > Reverse text direction (RTL)"
   * @default false
   */
  rtl: boolean;
  /**
   * The font used for editing the field in the Anki UI.
   *
   * Anki GUI: "Note Types > Fields > Editing Font > Name"
   * @default "Arial"
   */
  font: string;
  /**
   * The font size used for editing the field in the Anki UI.
   *
   * Anki GUI: "Note Types > Fields > Editing Font > Size"
   * @default 20
   */
  size: number;
  /**
   * Description of the field as shown in the Anki UI.
   *
   * Anki GUI: "Note Types > Fields > Description"
   * @example "This field contains the front side of the card."
   */
  description: string;
  /**
   * Whether the field is plain text (i.e., no HTML).
   *
   * Inverse of Anki GUI: "Note Types > Fields > Use HTML editor by default"
   * @default false
   */
  plainText: boolean;
  /**
   * Whether the field is collapsed in the Anki UI.
   *
   * Anki GUI: "Note Types > Fields > Collapsed by default"
   * @default false
   */
  collapsed: boolean;
  /**
   * Whether the field is excluded from search.
   *
   * Anki GUI: "Note Types > Fields > Exclude from unqualified searched (slower)"
   * @default false
   */
  excludeFromSearch: boolean;
  /**
   * Seems to have the same value as `ord` for the default note types.
   * Not sure what it does.
   * @default null
   */
  tag: number | null;
  /**
   * When this is set, the field can not be deleted from the UI.
   * There seems to be no way to set this in the UI.
   * It is used for the most important parts of the default note types only.
   * @default false
   */
  preventDeletion: boolean;
}

type MediaFileId = number;
type MediaFileName = string;
export type MediaFileMapping = Record<MediaFileId, MediaFileName>;

export enum ExportVersion {
  Legacy_V1 = 1,
  Legacy_V2 = 2,
  Latest = 3,
}
