/**
 * Typed model of Anki's `cards.data` JSON column (Story 1.3.11).
 *
 * The column exists unchanged in both legacy (schema 11) and modern
 * (schema 18) collections and carries per-card FSRS memory state plus
 * add-on data. Key facts are pinned in `docs/formats/anki.md`
 * (§`cards.data` JSON). Unknown keys are preserved so round trips stay
 * lossless.
 */

/** Typed view of one card's `data` JSON. All keys are optional in Anki. */
export interface CardData {
  /** Original position of the card in the new-card queue. */
  pos?: number;
  /** FSRS stability in days. */
  stability?: number;
  /** FSRS difficulty. */
  difficulty?: number;
  /** Per-card desired-retention override. */
  desiredRetention?: number;
  /** FSRS-6 decay parameter. */
  decay?: number;
  /** Last review time in epoch seconds. */
  lastReviewTime?: number;
  /**
   * Add-on custom data (`cd`): a JSON string Anki caps at
   * {@link CUSTOM_DATA_MAX_BYTES} bytes with keys of at most 8 bytes —
   * exceeding the limits makes Anki reject the card on import.
   */
  customData?: string;
  /** Keys this model does not know, preserved verbatim for round trips. */
  extra: Record<string, unknown>;
}

/** Anki's hard import limit for the `cd` (custom data) string. */
export const CUSTOM_DATA_MAX_BYTES = 100;

/** Mapping between Anki's terse JSON keys and the typed field names. */
const KNOWN_KEYS = {
  pos: "pos",
  s: "stability",
  d: "difficulty",
  dr: "desiredRetention",
  decay: "decay",
  lrt: "lastReviewTime",
  cd: "customData",
} as const;

/**
 * Parses a `cards.data` column value. Empty and non-object values yield an
 * empty {@link CardData} (the column is `""` for most cards).
 *
 * @returns The typed card data.
 */
export function parseCardData(data: string): CardData {
  const result: CardData = { extra: {} };
  if (!data || data.trim() === "") {
    return result;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return result;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return result;
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "cd") {
      if (typeof value === "string") {
        result.customData = value;
      } else {
        result.extra[key] = value;
      }
    } else if (key in KNOWN_KEYS) {
      if (typeof value === "number" && Number.isFinite(value)) {
        result[
          KNOWN_KEYS[key as keyof typeof KNOWN_KEYS] as Exclude<
            (typeof KNOWN_KEYS)[keyof typeof KNOWN_KEYS],
            "customData"
          >
        ] = value;
      } else {
        result.extra[key] = value;
      }
    } else {
      result.extra[key] = value;
    }
  }
  return result;
}

/**
 * Serializes typed card data back to the `cards.data` column format.
 * Anki's terse keys are used; unknown keys are re-emitted; an empty state
 * serializes to `""` (Anki's convention for cards without FSRS data).
 *
 * @returns The column value.
 */
export function serializeCardData(cardData: CardData): string {
  const out: Record<string, unknown> = {};
  for (const [terse, verbose] of Object.entries(KNOWN_KEYS)) {
    const value = cardData[verbose];
    if (value !== undefined) {
      out[terse] = value;
    }
  }
  for (const [key, value] of Object.entries(cardData.extra)) {
    out[key] = value;
  }
  if (Object.keys(out).length === 0) {
    return "";
  }
  return JSON.stringify(out);
}

/**
 * Whether a custom-data (`cd`) string satisfies Anki's import limits:
 * valid JSON object, at most {@link CUSTOM_DATA_MAX_BYTES} bytes, keys at
 * most 8 bytes each.
 *
 * @returns True when Anki would accept the value.
 */
export function isValidCustomData(customData: string): boolean {
  if (customData === "") {
    return true;
  }
  if (new TextEncoder().encode(customData).length > CUSTOM_DATA_MAX_BYTES) {
    return false;
  }
  try {
    const parsed = JSON.parse(customData) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    return Object.keys(parsed).every((key) => new TextEncoder().encode(key).length <= 8);
  } catch {
    return false;
  }
}
