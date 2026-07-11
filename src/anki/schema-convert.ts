/**
 * Schema 11 ↔ schema 18 entity conversions (ADR-0016, Story 1.3.6).
 *
 * Implements the field mapping documented in
 * `docs/formats/anki-schema-mapping.md`, mirroring Anki's own
 * upgrade/downgrade code so entities we convert behave like entities Anki
 * converted. proto→11 is used by the Legacy 2 writer for modern-sourced
 * blobs; 11→proto by the schema-18 writer for legacy-sourced blobs.
 *
 * The schema-11 side uses the exact JSON dialect modern Anki writes
 * (including post-11 keys and `null` conventions); the proto side uses the
 * decoded message objects from `anki-proto.ts`.
 */

import type {
  CardRequirement,
  DayLimit,
  DeckCommon,
  DeckConfigInner,
  DeckFiltered,
  DeckKindContainer,
  DeckNormal,
  FieldConfig,
  FilteredSearchTerm,
  NotetypeConfig,
  TemplateConfig,
} from "./anki-proto";

type Json = Record<string, unknown>;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

// #region Shared helpers

/**
 * Shortens an f32-exact double to the shortest decimal that round-trips to
 * the same f32 — matching how Anki's serde prints `f32` values in schema-11
 * JSON (e.g. 0.4000000059604645 → 0.4).
 *
 * @returns The numerically f32-equivalent shortest representation.
 */
export function shortestF32(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) {
    return value;
  }
  const target = Math.fround(value);
  for (let precision = 1; precision <= 9; precision++) {
    const candidate = Number(value.toPrecision(precision));
    if (Math.fround(candidate) === target) {
      return candidate;
    }
  }
  return value;
}

/** The level separator schema-18 deck names use instead of `::`. */
const NATIVE_NAME_SEPARATOR = "\u001F";

/**
 * Converts a schema-18 native deck name (`\x1f`-separated) to the human
 * `::`-separated form used by schema 11.
 *
 * @returns The human-readable deck name.
 */
export function nativeDeckNameToHuman(name: string): string {
  return name.split(NATIVE_NAME_SEPARATOR).join("::");
}

/**
 * Converts a human `::`-separated deck name to the schema-18 native form.
 *
 * @returns The native deck name.
 */
export function humanDeckNameToNative(name: string): string {
  return name.split("::").join(NATIVE_NAME_SEPARATOR);
}

/**
 * Parses proto `other` bytes (JSON object of add-on keys) into a map.
 *
 * @returns The add-on key map (empty on missing/unparsable data).
 */
function otherBytesToJson(other: Uint8Array | undefined): Json {
  if (!other || other.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(textDecoder.decode(other)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Json;
    }
  } catch {
    // Unparsable add-on data is dropped, matching Anki's lenient reader.
  }
  return {};
}

/**
 * Serializes an add-on key map to proto `other` bytes.
 *
 * @returns The encoded bytes (empty for an empty map).
 */
function jsonToOtherBytes(map: Json): Uint8Array {
  if (Object.keys(map).length === 0) {
    return new Uint8Array(0);
  }
  return textEncoder.encode(JSON.stringify(map));
}

/** Splats `other` keys into `target`, skipping each scope's reserved keys. */
function splatOther(
  target: Json,
  other: Uint8Array | undefined,
  reserved: ReadonlySet<string>,
): void {
  for (const [key, value] of Object.entries(otherBytesToJson(other))) {
    if (!reserved.has(key)) {
      target[key] = value;
    }
  }
}

/**
 * Collects all keys of `source` not in `known` into a map.
 *
 * @returns The unknown-key map.
 */
function collectUnknown(source: Json, known: ReadonlySet<string>): Json {
  const unknown: Json = {};
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key)) {
      unknown[key] = value;
    }
  }
  return unknown;
}

/**
 * Tolerant number parsing: schema-11 ids/timestamps may arrive as strings.
 *
 * @returns The parsed number, or the fallback.
 */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Tolerant bigint parsing for 64-bit ids.
 *
 * @returns The parsed bigint, or the fallback.
 */
function toBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Represents a 64-bit integer in schema-11 JSON: a plain number when safe,
 * a bigint (serialized as a bare number literal by `serializeWithBigInts`)
 * when it would lose precision as a double — 64-bit field/template ids are
 * precision-critical (audit F6).
 *
 * @returns The JSON-safe representation.
 */
function int64ToJson(value: bigint): number | bigint {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value;
}

/**
 * Anki's bool-from-anything: accepts booleans, numbers, and numeric strings.
 *
 * @returns The parsed boolean, or the fallback.
 */
function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value !== "" && value !== "0" && value.toLowerCase() !== "false";
  }
  return fallback;
}

function toStr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// #endregion

// #region Notetypes

const RESERVED_NOTETYPE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "name",
  "type",
  "mod",
  "usn",
  "sortf",
  "did",
  "tmpls",
  "flds",
  "css",
  "latexPre",
  "latexPost",
  "latexsvg",
  "req",
  "originalStockKind",
  "originalId",
]);

const RESERVED_FIELD_KEYS: ReadonlySet<string> = new Set([
  "name",
  "ord",
  "sticky",
  "rtl",
  "plainText",
  "font",
  "size",
  "collapsed",
  "description",
  "excludeFromSearch",
  "id",
  "tag",
  "preventDeletion",
]);

const RESERVED_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  "name",
  "ord",
  "did",
  "afmt",
  "bafmt",
  "qfmt",
  "bqfmt",
  "bfont",
  "bsize",
  "id",
]);

const REQ_KIND_TO_STRING = ["none", "any", "all"] as const;

/** Schema-18 notetype: table columns plus decoded config blobs. */
export interface NotetypeProtoBundle {
  row: { id: number; name: string; mtimeSecs: number; usn: number };
  config: NotetypeConfig;
  fields: { ord: number; name: string; config: FieldConfig }[];
  templates: { ord: number; name: string; config: TemplateConfig }[];
}

/**
 * Converts a schema-18 notetype to its schema-11 JSON form (a `models` map
 * entry), mirroring Anki's downgrade.
 *
 * @returns The schema-11 notetype JSON object.
 */
export function notetypeProtoToSchema11(bundle: NotetypeProtoBundle): Json {
  const { row, config } = bundle;
  const result: Json = {
    id: row.id,
    name: row.name,
    type: config.kind,
    mod: row.mtimeSecs,
    usn: row.usn,
    sortf: config.sort_field_idx,
    did:
      toBigInt(config.target_deck_id_unused) === 0n
        ? null
        : int64ToJson(toBigInt(config.target_deck_id_unused)),
    tmpls: bundle.templates.map((template) => templateProtoToSchema11(template)),
    flds: bundle.fields.map((field) => fieldProtoToSchema11(field)),
    css: config.css,
    latexPre: config.latex_pre,
    latexPost: config.latex_post,
    latexsvg: config.latex_svg,
    req: config.reqs.map((req) => [
      req.card_ord,
      REQ_KIND_TO_STRING[req.kind] ?? "none",
      req.field_ords,
    ]),
  };
  // Matching Anki: omitted when at their proto defaults.
  if (config.original_stock_kind !== 0) {
    result["originalStockKind"] = config.original_stock_kind;
  }
  if (config.original_id !== undefined) {
    result["originalId"] = int64ToJson(toBigInt(config.original_id));
  }
  splatOther(result, config.other, RESERVED_NOTETYPE_KEYS);
  return result;
}

function fieldProtoToSchema11(field: { ord: number; name: string; config: FieldConfig }): Json {
  const config = field.config;
  const result: Json = {
    name: field.name,
    ord: field.ord,
    sticky: config.sticky,
    rtl: config.rtl,
    font: config.font_name,
    size: config.font_size,
    description: config.description,
    plainText: config.plain_text,
    collapsed: config.collapsed,
    excludeFromSearch: config.exclude_from_search,
    id: config.id === undefined ? null : int64ToJson(toBigInt(config.id)),
    tag: config.tag ?? null,
    preventDeletion: config.prevent_deletion,
  };
  splatOther(result, config.other, RESERVED_FIELD_KEYS);
  return result;
}

function templateProtoToSchema11(template: {
  ord: number;
  name: string;
  config: TemplateConfig;
}): Json {
  const config = template.config;
  const result: Json = {
    name: template.name,
    ord: template.ord,
    qfmt: config.q_format,
    afmt: config.a_format,
    bqfmt: config.q_format_browser,
    bafmt: config.a_format_browser,
    did: toBigInt(config.target_deck_id) > 0n ? int64ToJson(toBigInt(config.target_deck_id)) : null,
    bfont: config.browser_font_name,
    bsize: config.browser_font_size,
    id: config.id === undefined ? null : int64ToJson(toBigInt(config.id)),
  };
  splatOther(result, config.other, RESERVED_TEMPLATE_KEYS);
  return result;
}

const REQ_STRING_TO_KIND: Record<string, number> = { none: 0, any: 1, all: 2 };

/**
 * Converts a schema-11 notetype JSON object to its schema-18 form,
 * mirroring Anki's upgrade. Per-template `mtime_secs`/`usn` do not exist in
 * schema 11 and are zeroed (documented loss).
 *
 * @returns Table columns and config blobs for the split schema-18 tables.
 */
export function notetypeSchema11ToProto(model: Json): NotetypeProtoBundle {
  const reqSource = Array.isArray(model["req"]) ? (model["req"] as unknown[]) : [];
  const reqs: CardRequirement[] = reqSource
    .filter((entry): entry is unknown[] => Array.isArray(entry))
    .map((entry) => ({
      card_ord: toNumber(entry[0]),
      kind: REQ_STRING_TO_KIND[toStr(entry[1], "none")] ?? 0,
      field_ords: Array.isArray(entry[2])
        ? (entry[2] as unknown[]).map((ord) => toNumber(ord))
        : [],
    }));

  const config: NotetypeConfig = {
    kind: toNumber(model["type"]) === 1 ? 1 : 0,
    sort_field_idx: toNumber(model["sortf"]),
    css: toStr(model["css"]),
    target_deck_id_unused: toBigInt(model["did"] ?? 0n),
    latex_pre: toStr(model["latexPre"]),
    latex_post: toStr(model["latexPost"]),
    latex_svg: toBool(model["latexsvg"]),
    reqs,
    original_stock_kind: toNumber(model["originalStockKind"]),
    other: jsonToOtherBytes(collectUnknown(model, RESERVED_NOTETYPE_KEYS)),
  };
  if (model["originalId"] !== undefined && model["originalId"] !== null) {
    config.original_id = toBigInt(model["originalId"]);
  }

  const flds = Array.isArray(model["flds"]) ? (model["flds"] as Json[]) : [];
  const tmpls = Array.isArray(model["tmpls"]) ? (model["tmpls"] as Json[]) : [];

  return {
    row: {
      id: toNumber(model["id"]),
      name: toStr(model["name"]),
      mtimeSecs: toNumber(model["mod"]),
      usn: toNumber(model["usn"]),
    },
    config,
    fields: flds.map((field, index) => fieldSchema11ToProto(field, index)),
    templates: tmpls.map((template, index) => templateSchema11ToProto(template, index)),
  };
}

function fieldSchema11ToProto(
  field: Json,
  index: number,
): { ord: number; name: string; config: FieldConfig } {
  const config: FieldConfig = {
    sticky: toBool(field["sticky"]),
    rtl: toBool(field["rtl"]),
    font_name: toStr(field["font"], "Arial"),
    font_size: toNumber(field["size"], 20),
    description: toStr(field["description"]),
    plain_text: toBool(field["plainText"]),
    collapsed: toBool(field["collapsed"]),
    exclude_from_search: toBool(field["excludeFromSearch"]),
    prevent_deletion: toBool(field["preventDeletion"]),
    other: jsonToOtherBytes(collectUnknown(field, RESERVED_FIELD_KEYS)),
  };
  if (field["id"] !== undefined && field["id"] !== null) {
    config.id = toBigInt(field["id"]);
  }
  if (field["tag"] !== undefined && field["tag"] !== null) {
    config.tag = toNumber(field["tag"]);
  }
  return { ord: toNumber(field["ord"], index), name: toStr(field["name"]), config };
}

function templateSchema11ToProto(
  template: Json,
  index: number,
): { ord: number; name: string; config: TemplateConfig } {
  const config: TemplateConfig = {
    q_format: toStr(template["qfmt"]),
    a_format: toStr(template["afmt"]),
    q_format_browser: toStr(template["bqfmt"]),
    a_format_browser: toStr(template["bafmt"]),
    target_deck_id: toBigInt(template["did"] ?? 0n),
    browser_font_name: toStr(template["bfont"]),
    browser_font_size: toNumber(template["bsize"]),
    other: jsonToOtherBytes(collectUnknown(template, RESERVED_TEMPLATE_KEYS)),
  };
  if (template["id"] !== undefined && template["id"] !== null) {
    config.id = toBigInt(template["id"]);
  }
  return { ord: toNumber(template["ord"], index), name: toStr(template["name"]), config };
}

// #endregion

// #region Decks

const RESERVED_DECK_KEYS: ReadonlySet<string> = new Set([
  "id",
  "mod",
  "name",
  "usn",
  "lrnToday",
  "revToday",
  "newToday",
  "timeToday",
  "collapsed",
  "browserCollapsed",
  "desc",
  "dyn",
  "conf",
  "extendNew",
  "extendRev",
  "reviewLimit",
  "newLimit",
  "reviewLimitToday",
  "newLimitToday",
  "desiredRetention",
  // NOT reserved in Anki's list: "md" — kept for exactness with the pinned
  // source, see docs/formats/anki-schema-mapping.md.
]);

/** Keys of the filtered-deck variant that never live in `Common.other`. */
const FILTERED_DECK_KEYS: ReadonlySet<string> = new Set([
  "resched",
  "terms",
  "separate",
  "delays",
  "previewDelay",
  "previewAgainSecs",
  "previewHardSecs",
  "previewGoodSecs",
  "md",
]);

/** Schema-18 deck: table columns plus decoded blobs. */
export interface DeckProtoBundle {
  row: { id: number; name: string; mtimeSecs: number; usn: number };
  common: DeckCommon;
  kind: DeckKindContainer;
}

function dayLimitToSchema11(limit: DayLimit | undefined): Json | null {
  return limit ? { limit: limit.limit, today: limit.today } : null;
}

/**
 * Converts a schema-18 deck to its schema-11 JSON form (a `decks` map
 * entry), mirroring Anki's downgrade — including the `\x1f` → `::` name
 * conversion and giving all four today-counters the same day.
 *
 * @returns The schema-11 deck JSON object.
 */
export function deckProtoToSchema11(bundle: DeckProtoBundle): Json {
  const { row, common, kind } = bundle;
  const day = common.last_day_studied;
  const filtered = kind.filtered;
  const normal = kind.normal;

  const result: Json = {
    id: row.id,
    mod: row.mtimeSecs,
    name: nativeDeckNameToHuman(row.name),
    usn: row.usn,
    lrnToday: [day, common.learning_studied],
    revToday: [day, common.review_studied],
    newToday: [day, common.new_studied],
    timeToday: [day, common.milliseconds_studied],
    collapsed: common.study_collapsed,
    browserCollapsed: common.browser_collapsed,
    desc: normal ? normal.description : "",
    dyn: filtered ? 1 : 0,
  };
  // `md` is skipped when false, matching Anki's serializer.
  if (normal?.markdown_description) {
    result["md"] = true;
  }

  if (filtered) {
    result["resched"] = filtered.reschedule;
    result["terms"] = filtered.search_terms.map((term) => [term.search, term.limit, term.order]);
    // Unused, but older clients require the key's existence.
    result["separate"] = true;
    result["delays"] = filtered.delays.length > 0 ? filtered.delays.map(shortestF32) : null;
    result["previewDelay"] = filtered.preview_delay;
    result["previewAgainSecs"] = filtered.preview_again_secs;
    result["previewHardSecs"] = filtered.preview_hard_secs;
    result["previewGoodSecs"] = filtered.preview_good_secs;
  } else if (normal) {
    result["conf"] = Number(toBigInt(normal.config_id));
    result["extendNew"] = normal.extend_new;
    result["extendRev"] = normal.extend_review;
    result["reviewLimit"] = normal.review_limit ?? null;
    result["newLimit"] = normal.new_limit ?? null;
    result["reviewLimitToday"] = dayLimitToSchema11(normal.review_limit_today);
    result["newLimitToday"] = dayLimitToSchema11(normal.new_limit_today);
    // Anki computes `(v * 100.0) as u32` in f32 arithmetic, then truncates.
    result["desiredRetention"] =
      normal.desired_retention === undefined
        ? null
        : Math.trunc(Math.fround(Math.fround(normal.desired_retention) * 100));
  }

  splatOther(result, common.other, RESERVED_DECK_KEYS);
  return result;
}

function schema11ToDayLimit(value: unknown): DayLimit | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Json;
    return { limit: toNumber(record["limit"]), today: toNumber(record["today"]) };
  }
  return undefined;
}

function todayTuple(value: unknown): { day: number; amount: number } {
  if (Array.isArray(value)) {
    return { day: toNumber(value[0]), amount: toNumber(value[1]) };
  }
  return { day: 0, amount: 0 };
}

/**
 * Converts a schema-11 deck JSON object to its schema-18 form, mirroring
 * Anki's upgrade — including zeroing today-counters from earlier days than
 * the most recent one.
 *
 * @returns Table columns and blobs for the schema-18 `decks` table.
 */
export function deckSchema11ToProto(deck: Json): DeckProtoBundle {
  const isFiltered = toBool(deck["dyn"]);

  const lrn = todayTuple(deck["lrnToday"]);
  const rev = todayTuple(deck["revToday"]);
  const newToday = todayTuple(deck["newToday"]);
  const time = todayTuple(deck["timeToday"]);
  // Combining per-counter days into one: counters from earlier days reset,
  // exactly like Anki's upgrade (study always updates `time`, custom study
  // may only update `rev`/`new`).
  const maxDay = Math.max(time.day, newToday.day, rev.day);

  const common: DeckCommon = {
    study_collapsed: toBool(deck["collapsed"]),
    browser_collapsed: toBool(deck["browserCollapsed"]),
    last_day_studied: maxDay,
    new_studied: newToday.day === maxDay ? newToday.amount : 0,
    review_studied: rev.day === maxDay ? rev.amount : 0,
    learning_studied: lrn.day === maxDay ? lrn.amount : 0,
    milliseconds_studied: time.amount,
    other: jsonToOtherBytes(
      collectUnknown(deck, new Set([...RESERVED_DECK_KEYS, ...FILTERED_DECK_KEYS])),
    ),
  };

  let kind: DeckKindContainer;
  if (isFiltered) {
    const termsSource = Array.isArray(deck["terms"]) ? (deck["terms"] as unknown[]) : [];
    const searchTerms: FilteredSearchTerm[] = termsSource
      .filter((entry): entry is unknown[] => Array.isArray(entry))
      .map((entry) => ({
        search: toStr(entry[0]),
        limit: Math.max(0, toNumber(entry[1])),
        order: toNumber(entry[2]),
      }));
    const delays = Array.isArray(deck["delays"])
      ? (deck["delays"] as unknown[]).map((delay) => toNumber(delay))
      : [];
    const filtered: DeckFiltered = {
      reschedule: toBool(deck["resched"]),
      search_terms: searchTerms,
      delays,
      preview_delay: toNumber(deck["previewDelay"]),
      preview_hard_secs: toNumber(deck["previewHardSecs"]),
      preview_good_secs: toNumber(deck["previewGoodSecs"]),
      preview_again_secs: toNumber(deck["previewAgainSecs"]),
    };
    kind = { filtered };
  } else {
    const normal: DeckNormal = {
      config_id: toBigInt(deck["conf"] ?? 1n),
      extend_new: Math.max(0, toNumber(deck["extendNew"])),
      extend_review: Math.max(0, toNumber(deck["extendRev"])),
      description: toStr(deck["desc"]),
      markdown_description: toBool(deck["md"]),
    };
    if (deck["reviewLimit"] !== undefined && deck["reviewLimit"] !== null) {
      normal.review_limit = toNumber(deck["reviewLimit"]);
    }
    if (deck["newLimit"] !== undefined && deck["newLimit"] !== null) {
      normal.new_limit = toNumber(deck["newLimit"]);
    }
    const reviewLimitToday = schema11ToDayLimit(deck["reviewLimitToday"]);
    if (reviewLimitToday) {
      normal.review_limit_today = reviewLimitToday;
    }
    const newLimitToday = schema11ToDayLimit(deck["newLimitToday"]);
    if (newLimitToday) {
      normal.new_limit_today = newLimitToday;
    }
    if (deck["desiredRetention"] !== undefined && deck["desiredRetention"] !== null) {
      normal.desired_retention = Math.fround(toNumber(deck["desiredRetention"]) / 100);
    }
    kind = { normal };
  }

  return {
    row: {
      id: toNumber(deck["id"]),
      name: humanDeckNameToNative(toStr(deck["name"])),
      mtimeSecs: toNumber(deck["mod"]),
      usn: toNumber(deck["usn"]),
    },
    common,
    kind,
  };
}

// #endregion

// #region Deck presets

const RESERVED_DECKCONF_KEYS: ReadonlySet<string> = new Set([
  "id",
  "mod",
  "name",
  "usn",
  "maxTaken",
  "autoplay",
  "timer",
  "replayq",
  "new",
  "rev",
  "lapse",
  "dyn",
  "newMix",
  "newPerDayMinimum",
  "interdayLearningMix",
  "reviewOrder",
  "newSortOrder",
  "newGatherPriority",
  "buryInterdayLearning",
  "fsrsWeights",
  "fsrsParams5",
  "fsrsParams6",
  "desiredRetention",
  "ignoreRevlogsBeforeDate",
  "easyDaysPercentages",
  "stopTimerOnAnswer",
  "secondsToShowQuestion",
  "secondsToShowAnswer",
  "questionAction",
  "answerAction",
  "waitForAudio",
  "sm2Retention",
  "weightSearch",
]);

const RESERVED_DECKCONF_NEW_KEYS: ReadonlySet<string> = new Set([
  "order",
  "delays",
  "bury",
  "perDay",
  "initialFactor",
  "ints",
]);

const RESERVED_DECKCONF_REV_KEYS: ReadonlySet<string> = new Set([
  "maxIvl",
  "hardFactor",
  "ease4",
  "ivlFct",
  "perDay",
  "bury",
]);

const RESERVED_DECKCONF_LAPSE_KEYS: ReadonlySet<string> = new Set([
  "leechFails",
  "mult",
  "leechAction",
  "delays",
  "minInt",
]);

/** Schema-18 deck preset: table columns plus decoded config blob. */
export interface DeckConfigProtoBundle {
  row: { id: number; name: string; mtimeSecs: number; usn: number };
  config: DeckConfigInner;
}

/**
 * Converts a schema-18 deck preset to its schema-11 JSON form (a `dconf`
 * map entry), mirroring Anki's downgrade — flat proto fields nest back
 * under `new`/`rev`/`lapse`, and ⚠ `new.order` enum values are swapped
 * relative to the proto.
 *
 * @returns The schema-11 deck-config JSON object.
 */
export function deckConfigProtoToSchema11(bundle: DeckConfigProtoBundle): Json {
  const { row, config } = bundle;
  const other = otherBytesToJson(config.other);
  // "new"/"rev"/"lapse" are in RESERVED_DECKCONF_KEYS, so the final splat
  // below never re-emits them — no need to delete after reading.
  const nestedExtras = (scope: string, reserved: ReadonlySet<string>): Json => {
    const raw = other[scope];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const extras: Json = {};
      for (const [key, value] of Object.entries(raw as Json)) {
        if (!reserved.has(key)) {
          extras[key] = value;
        }
      }
      return extras;
    }
    return {};
  };
  const newExtras = nestedExtras("new", RESERVED_DECKCONF_NEW_KEYS);
  const revExtras = nestedExtras("rev", RESERVED_DECKCONF_REV_KEYS);
  const lapseExtras = nestedExtras("lapse", RESERVED_DECKCONF_LAPSE_KEYS);

  const result: Json = {
    id: row.id,
    mod: row.mtimeSecs,
    name: row.name,
    usn: row.usn,
    maxTaken: config.cap_answer_time_to_secs,
    autoplay: !config.disable_autoplay,
    timer: config.show_timer ? 1 : 0,
    stopTimerOnAnswer: config.stop_timer_on_answer,
    secondsToShowQuestion: shortestF32(config.seconds_to_show_question),
    secondsToShowAnswer: shortestF32(config.seconds_to_show_answer),
    questionAction: config.question_action,
    answerAction: config.answer_action,
    waitForAudio: config.wait_for_audio,
    replayq: !config.skip_question_when_replaying_answer,
    dyn: false,
    new: {
      bury: config.bury_new,
      delays: config.learn_steps.map(shortestF32),
      // Anki computes `(initial_ease * 1000.0) as u16` in f32, truncating.
      initialFactor: Math.trunc(Math.fround(Math.fround(config.initial_ease) * 1000)),
      ints: [config.graduating_interval_good, config.graduating_interval_easy, 0],
      // ⚠ Swapped between dialects: proto 0 = due, 1 = random;
      // schema 11: 0 = random, 1 = due.
      order: config.new_card_insert_order === 1 ? 0 : 1,
      perDay: config.new_per_day,
      ...newExtras,
    },
    rev: {
      bury: config.bury_reviews,
      ease4: shortestF32(config.easy_multiplier),
      ivlFct: shortestF32(config.interval_multiplier),
      maxIvl: config.maximum_review_interval,
      perDay: config.reviews_per_day,
      hardFactor: shortestF32(config.hard_multiplier),
      ...revExtras,
    },
    lapse: {
      delays: config.relearn_steps.map(shortestF32),
      leechAction: config.leech_action,
      leechFails: config.leech_threshold,
      minInt: config.minimum_lapse_interval,
      mult: shortestF32(config.lapse_multiplier),
      ...lapseExtras,
    },
    newMix: config.new_mix,
    newPerDayMinimum: config.new_per_day_minimum,
    interdayLearningMix: config.interday_learning_mix,
    reviewOrder: config.review_order,
    newSortOrder: config.new_card_sort_order,
    newGatherPriority: config.new_card_gather_priority,
    buryInterdayLearning: config.bury_interday_learning,
    fsrsWeights: config.fsrs_params_4.map(shortestF32),
    fsrsParams5: config.fsrs_params_5.map(shortestF32),
    fsrsParams6: config.fsrs_params_6.map(shortestF32),
    desiredRetention: shortestF32(config.desired_retention),
    ignoreRevlogsBeforeDate: config.ignore_revlogs_before_date,
    easyDaysPercentages: config.easy_days_percentages.map(shortestF32),
    sm2Retention: shortestF32(config.historical_retention),
    weightSearch: config.param_search,
  };

  for (const [key, value] of Object.entries(other)) {
    if (!RESERVED_DECKCONF_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function subObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

/**
 * Converts a schema-11 deck-config JSON object to its schema-18 form,
 * mirroring Anki's upgrade. Unknown keys inside `new`/`rev`/`lapse` are
 * preserved as nested objects inside the proto `other` bytes.
 *
 * @returns Table columns and config blob for the `deck_config` table.
 */
export function deckConfigSchema11ToProto(dconf: Json): DeckConfigProtoBundle {
  const newConf = subObject(dconf["new"]);
  const revConf = subObject(dconf["rev"]);
  const lapseConf = subObject(dconf["lapse"]);

  const other = collectUnknown(dconf, RESERVED_DECKCONF_KEYS);
  const newExtras = collectUnknown(newConf, RESERVED_DECKCONF_NEW_KEYS);
  const revExtras = collectUnknown(revConf, RESERVED_DECKCONF_REV_KEYS);
  const lapseExtras = collectUnknown(lapseConf, RESERVED_DECKCONF_LAPSE_KEYS);
  if (Object.keys(newExtras).length > 0) {
    other["new"] = newExtras;
  }
  if (Object.keys(revExtras).length > 0) {
    other["rev"] = revExtras;
  }
  if (Object.keys(lapseExtras).length > 0) {
    other["lapse"] = lapseExtras;
  }

  const ints = Array.isArray(newConf["ints"]) ? (newConf["ints"] as unknown[]) : [];
  const toFloats = (value: unknown): number[] =>
    Array.isArray(value) ? value.map((entry) => toNumber(entry)) : [];

  const config: DeckConfigInner = {
    learn_steps: toFloats(newConf["delays"] ?? [1, 10]),
    relearn_steps: toFloats(lapseConf["delays"] ?? [10]),
    fsrs_params_4: toFloats(dconf["fsrsWeights"]),
    easy_days_percentages: toFloats(dconf["easyDaysPercentages"]),
    fsrs_params_5: toFloats(dconf["fsrsParams5"]),
    fsrs_params_6: toFloats(dconf["fsrsParams6"]),
    new_per_day: toNumber(newConf["perDay"], 20),
    reviews_per_day: toNumber(revConf["perDay"], 200),
    initial_ease: Math.fround(toNumber(newConf["initialFactor"], 2500) / 1000),
    easy_multiplier: Math.fround(toNumber(revConf["ease4"], 1.3)),
    hard_multiplier: Math.fround(toNumber(revConf["hardFactor"], 1.2)),
    lapse_multiplier: Math.fround(toNumber(lapseConf["mult"])),
    interval_multiplier: Math.fround(toNumber(revConf["ivlFct"], 1)),
    maximum_review_interval: toNumber(revConf["maxIvl"], 36_500),
    minimum_lapse_interval: toNumber(lapseConf["minInt"], 1),
    graduating_interval_good: toNumber(ints[0], 1),
    graduating_interval_easy: toNumber(ints[1], 4),
    // ⚠ Swapped between dialects (see proto→11 direction above).
    new_card_insert_order: toNumber(newConf["order"], 1) === 0 ? 1 : 0,
    leech_action: toNumber(lapseConf["leechAction"], 1),
    leech_threshold: toNumber(lapseConf["leechFails"], 8),
    disable_autoplay: !toBool(dconf["autoplay"], true),
    cap_answer_time_to_secs: Math.max(0, toNumber(dconf["maxTaken"], 60)),
    show_timer: toNumber(dconf["timer"]) !== 0,
    skip_question_when_replaying_answer: !toBool(dconf["replayq"], true),
    bury_new: toBool(newConf["bury"]),
    bury_reviews: toBool(revConf["bury"]),
    bury_interday_learning: toBool(dconf["buryInterdayLearning"]),
    new_mix: toNumber(dconf["newMix"]),
    interday_learning_mix: toNumber(dconf["interdayLearningMix"]),
    new_card_sort_order: toNumber(dconf["newSortOrder"]),
    review_order: toNumber(dconf["reviewOrder"]),
    new_card_gather_priority: toNumber(dconf["newGatherPriority"]),
    new_per_day_minimum: toNumber(dconf["newPerDayMinimum"]),
    question_action: toNumber(dconf["questionAction"]),
    desired_retention: Math.fround(toNumber(dconf["desiredRetention"])),
    stop_timer_on_answer: toBool(dconf["stopTimerOnAnswer"]),
    historical_retention: Math.fround(toNumber(dconf["sm2Retention"])),
    seconds_to_show_question: Math.fround(toNumber(dconf["secondsToShowQuestion"])),
    seconds_to_show_answer: Math.fround(toNumber(dconf["secondsToShowAnswer"])),
    answer_action: toNumber(dconf["answerAction"]),
    wait_for_audio: toBool(dconf["waitForAudio"], true),
    param_search: toStr(dconf["weightSearch"]),
    ignore_revlogs_before_date: toStr(dconf["ignoreRevlogsBeforeDate"]),
    other: jsonToOtherBytes(other),
  };

  return {
    row: {
      id: toNumber(dconf["id"]),
      name: toStr(dconf["name"]),
      mtimeSecs: toNumber(dconf["mod"]),
      usn: toNumber(dconf["usn"]),
    },
    config,
  };
}

// #endregion

// #region Collection config and tags

/** One row of the schema-18 `config` table (`val` holds JSON bytes). */
export interface ConfigRow {
  key: string;
  usn: number;
  mtimeSecs: number;
  val: Uint8Array;
}

/**
 * Merges schema-18 `config` rows back into the schema-11 `col.conf` JSON
 * object, mirroring Anki's downgrade. Row-level `usn`/`mtime_secs` have no
 * schema-11 home (documented loss).
 *
 * @returns The `col.conf` object.
 */
export function configRowsToConfJson(rows: ConfigRow[]): Json {
  const conf: Json = {};
  for (const row of rows) {
    try {
      conf[row.key] = JSON.parse(textDecoder.decode(row.val)) as unknown;
    } catch {
      // Skip unparsable values, matching Anki's lenient reader.
    }
  }
  return conf;
}

/**
 * Splits a schema-11 `col.conf` JSON object into schema-18 `config` rows,
 * mirroring Anki's upgrade (fresh rows get `usn`/`mtime_secs` 0).
 *
 * @returns One row per top-level key.
 */
export function confJsonToConfigRows(conf: Json): ConfigRow[] {
  return Object.entries(conf).map(([key, value]) => ({
    key,
    usn: 0,
    mtimeSecs: 0,
    val: textEncoder.encode(JSON.stringify(value)),
  }));
}

/** One row of the schema-18 `tags` table (v17 shape). */
export interface TagRow {
  tag: string;
  usn: number;
  /** v17+; has no schema-11 home (documented loss). */
  collapsed: boolean;
  /** v17+; has no schema-11 home (documented loss). */
  config: Uint8Array | null;
}

/**
 * Merges schema-18 `tags` rows into the schema-11 `col.tags` map
 * (`{tag: usn}`), mirroring Anki's downgrade.
 *
 * @returns The `col.tags` object.
 */
export function tagRowsToTagsJson(rows: TagRow[]): Json {
  const tags: Json = {};
  for (const row of rows) {
    tags[row.tag] = row.usn;
  }
  return tags;
}

/**
 * Splits a schema-11 `col.tags` map into schema-18 `tags` rows, mirroring
 * Anki's upgrade (v17 columns get their defaults).
 *
 * @returns One row per tag.
 */
export function tagsJsonToTagRows(tags: Json): TagRow[] {
  return Object.entries(tags).map(([tag, usn]) => ({
    tag,
    usn: toNumber(usn),
    collapsed: false,
    config: null,
  }));
}

// #endregion
