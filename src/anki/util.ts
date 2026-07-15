import { v7 as uuidv7 } from "uuid";

import { sha1Hex } from "./sha1";

/**
 * Converts a number to a base91 string representation.
 * @param num - The number to convert
 * @returns The encoded string
 */
function base91(num: bigint): string {
  const encodingTable =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";

  if (num === 0n) {
    // Return first char for 0
    return encodingTable.charAt(0);
  }

  let currentNum = num;
  let buf = "";

  while (currentNum) {
    const mod = currentNum % BigInt(encodingTable.length);
    currentNum /= BigInt(encodingTable.length);
    const char = encodingTable.charAt(Number(mod));
    buf = char + buf;
  }

  return buf;
}

/**
 * Generates a base91-encoded 64-bit random number
 * @returns A base91 encoded string representing a random 64-bit number
 */
export function guid64(): string {
  return base91(getRandomInt());
}

/**
 * Gets a random 64-bit integer (0 to 2^64 - 1)
 * @returns A random 64-bit integer
 */
function getRandomInt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const bytesAsBigInt = new DataView(bytes.buffer).getBigUint64(0, false);
  return bytesAsBigInt;
}

export function generateUnixTimeInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function generateUnixTimeInMilliseconds(): number {
  return Date.now();
}

export function sanitizeFilename(filename: string): string {
  return filename.replaceAll(/[^a-z0-9.-]/giu, "_");
}

export function omitFields<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const result = Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
  return result;
}

export function generateUuid(): `${string}-${string}-${string}-${string}-${string}` {
  const uuid = uuidv7() as `${string}-${string}-${string}-${string}-${string}`;
  return uuid;
}

/**
 * Extracts the timestamp from a UUID v7 in milliseconds.
 *
 * The UUID is expected to be in the format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where the first 48 bits represent the timestamp.
 *
 * Warning: For UUIDs generated in the same millisecond, the result will not be unique.
 * @param uuid - The UUID string
 * @returns The timestamp in milliseconds
 */
export function extractTimestampFromUuid(uuid: string): number {
  // Remove hyphens and convert to binary
  const hex = uuid.replaceAll("-", "");

  // Extract the timestamp portion (first 48 bits)
  const timestampHex = hex.slice(0, 12);
  const timestampMs = Number.parseInt(timestampHex, 16);
  return timestampMs;
}

/**
 * Generates a unique ID from a UUID using a hash function.
 * This makes sure that even UUIDs generated in the same millisecond are unique.
 * @param uuid - The UUID string
 * @returns A unique integer derived from the UUID
 */
export function generateUniqueIdFromUuid(uuid: string): number {
  let hash = 0;
  const str = uuid.replaceAll("-", ""); // Remove hyphens

  for (let i = 0; i < str.length; i++) {
    const char = str.codePointAt(i);
    if (char === undefined) {
      throw new Error(`Invalid index ${i} for string length ${str.length}`);
    }
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32-bit integer
  }

  // Ensure positive number and reasonable size for Anki
  return Math.abs(hash);
}

/**
 * Compares two byte arrays for equality.
 * @param a - First byte array
 * @param b - Second byte array
 * @returns Whether both arrays have identical length and content
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function joinAnkiFields(fields: string[]): string {
  return fields.join("\u001F");
}

export function splitAnkiFields(fieldString: string): string[] {
  return fieldString.split("\u001F");
}

/**
 * Matches Anki media references inside a note field.
 *
 * Two forms are recognized:
 * - image tags: `<img src="filename.ext">` (quotes optional)
 * - sound/video tags: `[sound:filename.ext]` (Anki uses `[sound:]` for both)
 *
 * Shared by media pruning ({@link extractMediaReferences} callers) and the
 * round-trip "missing media" warning so both agree on what counts as a
 * reference. Used only with {@link String.prototype.matchAll}, which iterates a
 * copy, so reusing this global-flagged constant is safe.
 */
export const ANKI_MEDIA_REFERENCE_PATTERN =
  /<img[^>]+src=["']?(?<imgSrc>[^"'>\s]+)["']?|\[sound:(?<soundFile>[^\]]+)\]/giu;

/**
 * Extracts the media filenames referenced by a set of note fields.
 * @param fields - The note field values to scan
 * @returns The set of referenced media filenames
 */
export function extractMediaReferences(fields: Iterable<string>): Set<string> {
  const referenced = new Set<string>();
  for (const field of fields) {
    for (const match of field.matchAll(ANKI_MEDIA_REFERENCE_PATTERN)) {
      const filename = match.groups?.["imgSrc"] ?? match.groups?.["soundFile"];
      if (filename !== undefined && filename !== "") {
        referenced.add(filename);
      }
    }
  }
  return referenced;
}

/**
 * Serializes an object to JSON with BigInt values converted to unquoted numbers.
 *
 * This makes sure that no precision is lost when storing BigInt values.
 *
 * Warning: The JSON spec does not specify the precision with which numbers are
 * stored. Not all parsers (including JSON.parse()) handle large numbers correctly.
 * This may lead to data loss!
 * @param obj - The object to serialize (can contain BigInt values)
 * @param space - Optional formatting parameter (same as JSON.stringify space parameter)
 * @returns JSON string with BigInt values as unquoted numbers
 * @example
 * const data = { id: 123n, balance: 9007199254740993n };
 * const json = serializeWithBigInts(data);
 * // Result: '{"id":123,"balance":9007199254740993}'
 */
export function serializeWithBigInts(obj: unknown, space?: string | number): string {
  const marker = chooseBigIntMarker(obj);
  const serialized = JSON.stringify(
    obj,
    (_key, value: unknown) =>
      typeof value === "bigint" ? `${marker}${String(value)}${marker}` : value,
    space,
  );

  // Strip the quotes and markers so BigInt values become bare JSON number
  // literals. The value group allows a leading "-" so negative BigInts survive.
  const pattern = new RegExp(`"${marker}(?<value>-?\\d+)${marker}"`, "gu");
  return serialized.replaceAll(pattern, "$<value>");
}

/**
 * Picks a marker for {@link serializeWithBigInts} that is guaranteed not to
 * collide with genuine string content.
 *
 * Normally the fixed `__BIGINT__` marker is used. If a string value (or key) in
 * the object already contains that literal, stripping the markers afterwards
 * would corrupt it into a bare number, so a random nonce-based marker is
 * generated and re-rolled until it is absent from the content.
 * @param obj - The object about to be serialized
 * @returns A marker string that does not appear in the object's string content
 */
function chooseBigIntMarker(obj: unknown): string {
  const defaultMarker = "__BIGINT__";

  // Neutralize BigInt values so that any remaining occurrence of the marker in
  // the probe must come from genuine string content — i.e. a real collision.
  const probe = JSON.stringify(obj, (_key, value: unknown) =>
    typeof value === "bigint" ? 0 : value,
  );

  if (probe === undefined || !probe.includes(defaultMarker)) {
    return defaultMarker;
  }

  let marker: string;
  do {
    marker = `__BIGINT_${Math.random().toString(36).slice(2)}__`;
  } while (probe.includes(marker));
  return marker;
}

/**
 * Context object passed as the third argument to a {@link JSON.parse} reviver on
 * V8 ≥ 11.8 (Node ≥ 21). For primitive values, `source` holds the exact source
 * text of the literal being revived, which lets us recover the full precision of
 * integers that would otherwise be rounded when parsed into a `number`.
 *
 * TypeScript's lib does not yet declare this third parameter, so we model it
 * locally and cast the reviver when handing it to `JSON.parse`.
 */
interface JsonReviverContext {
  source?: string;
}

type JsonReviver = (this: unknown, key: string, value: unknown) => unknown;

/**
 * Parses a JSON string, converting any integer literal that cannot be
 * represented exactly as a `number` into a `bigint` without losing precision.
 *
 * Uses V8's `context.source` reviver argument (Node ≥ 21, guaranteed by the
 * package's engines floor) to read the original literal text, so 64-bit ids in
 * Anki's `col.models` JSON survive a read → write round-trip byte-for-byte.
 *
 * Only unquoted plain-integer number literals are converted:
 * - Strings are never touched, so digit-only string values (e.g. a field named
 *   `"2024"` or a note type named `"007"`) keep their type.
 * - The `/^-?\d+$/` guard on the source text is load-bearing: `1e21` is an
 *   unsafe integer whose `source` is `"1e21"`, and `BigInt("1e21")` throws — so
 *   such literals are left as `number`.
 * - Safe integers and non-integers are returned unchanged.
 * @param jsonString - The JSON string to parse
 * @returns The parsed value with unsafe integer literals as `bigint`
 * @throws {SyntaxError} When jsonString is not valid JSON
 * @example
 * const parsed = parseJsonWithBigInts('{"id":6134417914424963362}') as { id: bigint };
 * // parsed.id === 6134417914424963362n (exact)
 */
export function parseJsonWithBigInts(jsonString: string): unknown {
  const reviver = (_key: string, value: unknown, context?: JsonReviverContext): unknown => {
    if (
      typeof value === "number" &&
      !Number.isSafeInteger(value) &&
      context?.source !== undefined &&
      /^-?\d+$/u.test(context.source)
    ) {
      return BigInt(context.source);
    }
    return value;
  };

  // The third reviver argument is not yet part of TypeScript's JSON.parse
  // signature, so cast to the declared two-argument reviver shape.
  return JSON.parse(jsonString, reviver as JsonReviver);
}

/**
 * Removes HTML tags from a string, mirroring how Anki derives the sort field
 * and note checksum from a field's rendered text.
 *
 * Known simplification: this only strips tags (and `<style>`/`<script>`
 * bodies). Unlike Anki's `strip_html_media`, it does not decode HTML entities
 * (`&amp;` → `&`) or remove media references (`[sound:...]`, `<img>` sources).
 * That keeps the implementation dependency-free and is sufficient for the
 * plain-text and lightly-formatted fields this library targets.
 * @param html - The field content to strip
 * @returns The content with HTML tags removed
 */
export function stripHtml(html: string): string {
  return html
    .replaceAll(/<style[^>]*>[\s\S]*?<\/style>/giu, "")
    .replaceAll(/<script[^>]*>[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<[^>]*>/gu, "");
}

/**
 * Computes an Anki note checksum for a field value.
 *
 * Anki stores `notes.csum` as the first 8 hex digits of the SHA1 of the
 * HTML-stripped first field, interpreted as a 32-bit unsigned integer.
 * @see https://github.com/ankitects/anki/blob/edf59c2bb2a3dad36115af7518cdcbb3ee397089/pylib/anki/utils.py#L151
 * @param field - The (raw, un-stripped) field value to checksum
 * @returns The 32-bit unsigned checksum
 */
export function fieldChecksum(field: string): number {
  const stripped = stripHtml(field);
  return Number.parseInt(sha1Hex(stripped).slice(0, 8), 16);
}
