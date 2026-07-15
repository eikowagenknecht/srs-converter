/**
 * Storage shaping for modern-sourced entity blobs (ADR-0016).
 *
 * Modern entities are stored in `applicationSpecificData` in their native
 * decoded-proto form (snake_case keys, bigints as bare number literals via
 * `serializeWithBigInts`). Byte fields (`other`, `$unparsed`, `sha1`, …)
 * cannot live in JSON directly, so they are wrapped as `{ "$b64": "…" }`
 * markers on the way in and restored to `Uint8Array` on the way out.
 *
 * The schema marker key `ankiSchema` (value `"18"`) next to a blob declares
 * it is in this dialect; its absence means the legacy schema-11 JSON dialect.
 */

import { base64ToBytes, bytesToBase64 } from "./base64";

/** Marker key holding the source schema of an entity blob. */
export const ANKI_SCHEMA_KEY = "ankiSchema";

/** Marker value for blobs stored in the modern decoded-proto dialect. */
export const ANKI_SCHEMA_MODERN = "18";

const BYTES_KEY = "$b64";

/**
 * Recursively replaces `Uint8Array` values with `{ $b64 }` wrappers so the
 * structure survives JSON serialization losslessly.
 *
 * @returns A JSON-safe deep copy (bigints are left in place for
 * `serializeWithBigInts`).
 */
export function toStorable(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { [BYTES_KEY]: bytesToBase64(value) };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toStorable(entry));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toStorable(entry);
    }
    return result;
  }
  return value;
}

/**
 * Reverses {@link toStorable}: `{ $b64 }` wrappers become `Uint8Array`s.
 *
 * @returns The runtime form with byte fields restored.
 */
export function fromStorable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => fromStorable(entry));
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (
      entries.length === 1 &&
      entries[0]?.[0] === BYTES_KEY &&
      typeof entries[0][1] === "string"
    ) {
      return base64ToBytes(entries[0][1]);
    }
    const result: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      result[key] = fromStorable(entry);
    }
    return result;
  }
  return value;
}
