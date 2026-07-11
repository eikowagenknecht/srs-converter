/**
 * Typed codecs for the protobuf messages stored in modern Anki collections
 * (ADR-0013). Field numbers and semantics come from the pinned wire spec in
 * `docs/formats/anki.md` (Anki 26.05); the wire layer lives in
 * `protobuf-wire.ts`.
 *
 * Decoded objects use the snake_case proto field names (they are the
 * ADR-0016 storage dialect for modern-sourced blobs), `bigint` for 64-bit
 * integers, `Uint8Array` for bytes, and `$unparsed` for unknown fields.
 */

import type { MessageDescriptor } from "./protobuf-wire";
import { decodeMessage, encodeMessage } from "./protobuf-wire";

/** Raw wire bytes of fields the codec does not model; round-trips verbatim. */
interface UnparsedCarrier {
  $unparsed?: Uint8Array;
}

// #region Notetype messages (stored in notetypes/fields/templates.config)

/** `Notetype.Config.CardRequirement` — card-generation requirement (schema-11 `req`). */
export interface CardRequirement extends UnparsedCarrier {
  card_ord: number;
  /** 0 none, 1 any, 2 all */
  kind: number;
  field_ords: number[];
}

/** `Notetype.Config` — stored in `notetypes.config`. */
export interface NotetypeConfig extends UnparsedCarrier {
  /** 0 normal, 1 cloze */
  kind: number;
  sort_field_idx: number;
  css: string;
  target_deck_id_unused: bigint;
  latex_pre: string;
  latex_post: string;
  latex_svg: boolean;
  reqs: CardRequirement[];
  /** StockNotetype.OriginalStockKind (0 unknown … 6 image occlusion) */
  original_stock_kind: number;
  original_id?: bigint;
  /** Opaque add-on data (JSON map of unknown schema-11 keys). */
  other: Uint8Array;
}

const CARD_REQUIREMENT: MessageDescriptor = {
  name: "Notetype.Config.CardRequirement",
  fields: [
    { no: 1, name: "card_ord", type: "uint32" },
    { no: 2, name: "kind", type: "enum" },
    { no: 3, name: "field_ords", type: "uint32", repeated: true },
  ],
};

const NOTETYPE_CONFIG: MessageDescriptor = {
  name: "Notetype.Config",
  fields: [
    { no: 1, name: "kind", type: "enum" },
    { no: 2, name: "sort_field_idx", type: "uint32" },
    { no: 3, name: "css", type: "string" },
    { no: 4, name: "target_deck_id_unused", type: "int64" },
    { no: 5, name: "latex_pre", type: "string" },
    { no: 6, name: "latex_post", type: "string" },
    { no: 7, name: "latex_svg", type: "bool" },
    { no: 8, name: "reqs", type: CARD_REQUIREMENT, repeated: true },
    { no: 9, name: "original_stock_kind", type: "enum" },
    { no: 10, name: "original_id", type: "int64", optional: true },
    { no: 255, name: "other", type: "bytes" },
  ],
};

/** `Notetype.Field.Config` — stored in `fields.config`. */
export interface FieldConfig extends UnparsedCarrier {
  sticky: boolean;
  rtl: boolean;
  font_name: string;
  font_size: number;
  description: string;
  plain_text: boolean;
  collapsed: boolean;
  exclude_from_search: boolean;
  /** Stable id for import merging (23.10+). */
  id?: bigint;
  tag?: number;
  prevent_deletion: boolean;
  other: Uint8Array;
}

const FIELD_CONFIG: MessageDescriptor = {
  name: "Notetype.Field.Config",
  fields: [
    { no: 1, name: "sticky", type: "bool" },
    { no: 2, name: "rtl", type: "bool" },
    { no: 3, name: "font_name", type: "string" },
    { no: 4, name: "font_size", type: "uint32" },
    { no: 5, name: "description", type: "string" },
    { no: 6, name: "plain_text", type: "bool" },
    { no: 7, name: "collapsed", type: "bool" },
    { no: 8, name: "exclude_from_search", type: "bool" },
    { no: 9, name: "id", type: "int64", optional: true },
    { no: 10, name: "tag", type: "uint32", optional: true },
    { no: 11, name: "prevent_deletion", type: "bool" },
    { no: 255, name: "other", type: "bytes" },
  ],
};

/** `Notetype.Template.Config` — stored in `templates.config`. */
export interface TemplateConfig extends UnparsedCarrier {
  q_format: string;
  a_format: string;
  q_format_browser: string;
  a_format_browser: string;
  target_deck_id: bigint;
  browser_font_name: string;
  browser_font_size: number;
  /** Stable id for import merging (23.10+). */
  id?: bigint;
  other: Uint8Array;
}

const TEMPLATE_CONFIG: MessageDescriptor = {
  name: "Notetype.Template.Config",
  fields: [
    { no: 1, name: "q_format", type: "string" },
    { no: 2, name: "a_format", type: "string" },
    { no: 3, name: "q_format_browser", type: "string" },
    { no: 4, name: "a_format_browser", type: "string" },
    { no: 5, name: "target_deck_id", type: "int64" },
    { no: 6, name: "browser_font_name", type: "string" },
    { no: 7, name: "browser_font_size", type: "uint32" },
    { no: 8, name: "id", type: "int64", optional: true },
    { no: 255, name: "other", type: "bytes" },
  ],
};

// #endregion

// #region Deck messages (stored in decks.common / decks.kind)

/** `Deck.Common` — stored in `decks.common`. */
export interface DeckCommon extends UnparsedCarrier {
  study_collapsed: boolean;
  browser_collapsed: boolean;
  last_day_studied: number;
  new_studied: number;
  review_studied: number;
  learning_studied: number;
  milliseconds_studied: number;
  other: Uint8Array;
}

const DECK_COMMON: MessageDescriptor = {
  name: "Deck.Common",
  fields: [
    { no: 1, name: "study_collapsed", type: "bool" },
    { no: 2, name: "browser_collapsed", type: "bool" },
    { no: 3, name: "last_day_studied", type: "uint32" },
    { no: 4, name: "new_studied", type: "int32" },
    { no: 5, name: "review_studied", type: "int32" },
    { no: 6, name: "learning_studied", type: "int32" },
    { no: 7, name: "milliseconds_studied", type: "int32" },
    { no: 255, name: "other", type: "bytes" },
  ],
};

/** `Deck.Normal.DayLimit` */
export interface DayLimit extends UnparsedCarrier {
  limit: number;
  today: number;
}

const DAY_LIMIT: MessageDescriptor = {
  name: "Deck.Normal.DayLimit",
  fields: [
    { no: 1, name: "limit", type: "uint32" },
    { no: 2, name: "today", type: "uint32" },
  ],
};

/** `Deck.Normal` */
export interface DeckNormal extends UnparsedCarrier {
  config_id: bigint;
  extend_new: number;
  extend_review: number;
  description: string;
  markdown_description: boolean;
  review_limit?: number;
  new_limit?: number;
  review_limit_today?: DayLimit;
  new_limit_today?: DayLimit;
  /** Per-deck FSRS desired-retention override. */
  desired_retention?: number;
}

const DECK_NORMAL: MessageDescriptor = {
  name: "Deck.Normal",
  fields: [
    { no: 1, name: "config_id", type: "int64" },
    { no: 2, name: "extend_new", type: "uint32" },
    { no: 3, name: "extend_review", type: "uint32" },
    { no: 4, name: "description", type: "string" },
    { no: 5, name: "markdown_description", type: "bool" },
    { no: 6, name: "review_limit", type: "uint32", optional: true },
    { no: 7, name: "new_limit", type: "uint32", optional: true },
    { no: 8, name: "review_limit_today", type: DAY_LIMIT },
    { no: 9, name: "new_limit_today", type: DAY_LIMIT },
    { no: 10, name: "desired_retention", type: "float", optional: true },
  ],
};

/** `Deck.Filtered.SearchTerm` */
export interface FilteredSearchTerm extends UnparsedCarrier {
  search: string;
  limit: number;
  /** Order enum: 0 oldest-reviewed-first … 10 relative-overdueness. */
  order: number;
}

const FILTERED_SEARCH_TERM: MessageDescriptor = {
  name: "Deck.Filtered.SearchTerm",
  fields: [
    { no: 1, name: "search", type: "string" },
    { no: 2, name: "limit", type: "uint32" },
    { no: 3, name: "order", type: "enum" },
  ],
};

/** `Deck.Filtered` */
export interface DeckFiltered extends UnparsedCarrier {
  reschedule: boolean;
  search_terms: FilteredSearchTerm[];
  /** v1-scheduler steps; unused since scheduler v2. */
  delays: number[];
  preview_delay: number;
  preview_hard_secs: number;
  preview_good_secs: number;
  preview_again_secs: number;
}

const DECK_FILTERED: MessageDescriptor = {
  name: "Deck.Filtered",
  fields: [
    { no: 1, name: "reschedule", type: "bool" },
    { no: 2, name: "search_terms", type: FILTERED_SEARCH_TERM, repeated: true },
    { no: 3, name: "delays", type: "float", repeated: true },
    { no: 4, name: "preview_delay", type: "uint32" },
    { no: 5, name: "preview_hard_secs", type: "uint32" },
    { no: 6, name: "preview_good_secs", type: "uint32" },
    { no: 7, name: "preview_again_secs", type: "uint32" },
  ],
};

/**
 * `Deck.KindContainer` — stored in `decks.kind`.
 * Exactly one of `normal`/`filtered` is set (protobuf oneof).
 */
export interface DeckKindContainer extends UnparsedCarrier {
  normal?: DeckNormal;
  filtered?: DeckFiltered;
}

const DECK_KIND_CONTAINER: MessageDescriptor = {
  name: "Deck.KindContainer",
  fields: [
    { no: 1, name: "normal", type: DECK_NORMAL },
    { no: 2, name: "filtered", type: DECK_FILTERED },
  ],
};

// #endregion

// #region Deck preset (stored in deck_config.config)

/** `DeckConfig.Config` — stored in `deck_config.config`. */
export interface DeckConfigInner extends UnparsedCarrier {
  learn_steps: number[];
  relearn_steps: number[];
  /** FSRS-4.5 parameters (17 weights). Schema-11 key: `fsrsWeights`. */
  fsrs_params_4: number[];
  easy_days_percentages: number[];
  /** FSRS-5 parameters (19 weights). */
  fsrs_params_5: number[];
  /** FSRS-6 parameters (21 weights). */
  fsrs_params_6: number[];
  new_per_day: number;
  reviews_per_day: number;
  initial_ease: number;
  easy_multiplier: number;
  hard_multiplier: number;
  lapse_multiplier: number;
  interval_multiplier: number;
  maximum_review_interval: number;
  minimum_lapse_interval: number;
  graduating_interval_good: number;
  graduating_interval_easy: number;
  /** ⚠ 0 due, 1 random — the schema-11 `new.order` values are swapped. */
  new_card_insert_order: number;
  leech_action: number;
  leech_threshold: number;
  disable_autoplay: boolean;
  cap_answer_time_to_secs: number;
  show_timer: boolean;
  skip_question_when_replaying_answer: boolean;
  bury_new: boolean;
  bury_reviews: boolean;
  bury_interday_learning: boolean;
  new_mix: number;
  interday_learning_mix: number;
  new_card_sort_order: number;
  review_order: number;
  new_card_gather_priority: number;
  new_per_day_minimum: number;
  question_action: number;
  /** FSRS desired retention (default 0.9). Schema-11: float, unlike decks. */
  desired_retention: number;
  stop_timer_on_answer: boolean;
  /** Schema-11 key: `sm2Retention`. */
  historical_retention: number;
  seconds_to_show_question: number;
  seconds_to_show_answer: number;
  answer_action: number;
  wait_for_audio: boolean;
  /** Schema-11 key: `weightSearch`. */
  param_search: string;
  ignore_revlogs_before_date: string;
  other: Uint8Array;
}

const DECK_CONFIG_INNER: MessageDescriptor = {
  name: "DeckConfig.Config",
  fields: [
    { no: 1, name: "learn_steps", type: "float", repeated: true },
    { no: 2, name: "relearn_steps", type: "float", repeated: true },
    { no: 3, name: "fsrs_params_4", type: "float", repeated: true },
    { no: 4, name: "easy_days_percentages", type: "float", repeated: true },
    { no: 5, name: "fsrs_params_5", type: "float", repeated: true },
    { no: 6, name: "fsrs_params_6", type: "float", repeated: true },
    { no: 9, name: "new_per_day", type: "uint32" },
    { no: 10, name: "reviews_per_day", type: "uint32" },
    { no: 11, name: "initial_ease", type: "float" },
    { no: 12, name: "easy_multiplier", type: "float" },
    { no: 13, name: "hard_multiplier", type: "float" },
    { no: 14, name: "lapse_multiplier", type: "float" },
    { no: 15, name: "interval_multiplier", type: "float" },
    { no: 16, name: "maximum_review_interval", type: "uint32" },
    { no: 17, name: "minimum_lapse_interval", type: "uint32" },
    { no: 18, name: "graduating_interval_good", type: "uint32" },
    { no: 19, name: "graduating_interval_easy", type: "uint32" },
    { no: 20, name: "new_card_insert_order", type: "enum" },
    { no: 21, name: "leech_action", type: "enum" },
    { no: 22, name: "leech_threshold", type: "uint32" },
    { no: 23, name: "disable_autoplay", type: "bool" },
    { no: 24, name: "cap_answer_time_to_secs", type: "uint32" },
    { no: 25, name: "show_timer", type: "bool" },
    { no: 26, name: "skip_question_when_replaying_answer", type: "bool" },
    { no: 27, name: "bury_new", type: "bool" },
    { no: 28, name: "bury_reviews", type: "bool" },
    { no: 29, name: "bury_interday_learning", type: "bool" },
    { no: 30, name: "new_mix", type: "enum" },
    { no: 31, name: "interday_learning_mix", type: "enum" },
    { no: 32, name: "new_card_sort_order", type: "enum" },
    { no: 33, name: "review_order", type: "enum" },
    { no: 34, name: "new_card_gather_priority", type: "enum" },
    { no: 35, name: "new_per_day_minimum", type: "uint32" },
    { no: 36, name: "question_action", type: "enum" },
    { no: 37, name: "desired_retention", type: "float" },
    { no: 38, name: "stop_timer_on_answer", type: "bool" },
    { no: 40, name: "historical_retention", type: "float" },
    { no: 41, name: "seconds_to_show_question", type: "float" },
    { no: 42, name: "seconds_to_show_answer", type: "float" },
    { no: 43, name: "answer_action", type: "enum" },
    { no: 44, name: "wait_for_audio", type: "bool" },
    { no: 45, name: "param_search", type: "string" },
    { no: 46, name: "ignore_revlogs_before_date", type: "string" },
    { no: 255, name: "other", type: "bytes" },
  ],
};

// #endregion

// #region Media manifest (zip entry `media` in package v3)

/** `MediaEntries.MediaEntry` */
export interface MediaEntry extends UnparsedCarrier {
  name: string;
  /** Uncompressed size. */
  size: number;
  /** SHA-1 of the uncompressed data; must be exactly 20 bytes on import. */
  sha1: Uint8Array;
  legacy_zip_filename?: number;
}

const MEDIA_ENTRY: MessageDescriptor = {
  name: "MediaEntries.MediaEntry",
  fields: [
    { no: 1, name: "name", type: "string" },
    { no: 2, name: "size", type: "uint32" },
    { no: 3, name: "sha1", type: "bytes" },
    { no: 255, name: "legacy_zip_filename", type: "uint32", optional: true },
  ],
};

/** `MediaEntries` — entry position in the list = zip entry name. */
export interface MediaEntries extends UnparsedCarrier {
  entries: MediaEntry[];
}

const MEDIA_ENTRIES: MessageDescriptor = {
  name: "MediaEntries",
  fields: [{ no: 1, name: "entries", type: MEDIA_ENTRY, repeated: true }],
};

// #endregion

// #region Typed codec functions

function codec<T extends Record<string, unknown>>(descriptor: MessageDescriptor) {
  return {
    decode: (buffer: Uint8Array): T => decodeMessage(buffer, descriptor) as T,
    encode: (value: T): Uint8Array => encodeMessage(value, descriptor),
  };
}

export const notetypeConfigCodec = codec<NotetypeConfig & Record<string, unknown>>(NOTETYPE_CONFIG);
export const fieldConfigCodec = codec<FieldConfig & Record<string, unknown>>(FIELD_CONFIG);
export const templateConfigCodec = codec<TemplateConfig & Record<string, unknown>>(TEMPLATE_CONFIG);
export const deckCommonCodec = codec<DeckCommon & Record<string, unknown>>(DECK_COMMON);
export const deckKindCodec = codec<DeckKindContainer & Record<string, unknown>>(
  DECK_KIND_CONTAINER,
);
export const deckConfigCodec = codec<DeckConfigInner & Record<string, unknown>>(DECK_CONFIG_INNER);
export const mediaEntriesCodec = codec<MediaEntries & Record<string, unknown>>(MEDIA_ENTRIES);

// #endregion
