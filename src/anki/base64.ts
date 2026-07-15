/**
 * Base64 encoding/decoding on Uint8Array without Node's Buffer.
 *
 * Uses the `btoa`/`atob` globals, which exist in browsers and in Node ≥ 16.
 * (`Uint8Array.fromBase64` would be nicer but is not available on Node 22,
 * the package's engine floor.)
 */

/**
 * Encodes bytes as a base64 string.
 * @param bytes - The bytes to encode
 * @returns The base64 representation
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked to keep String.fromCharCode argument counts within engine limits.
  const chunkSize = 0x80_00;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCodePoint(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string into bytes.
 * @param base64 - The base64 string to decode
 * @returns The decoded bytes
 * @throws {Error} when the input is not valid base64
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    // atob output is latin-1 (0-255), so every position has a code point.
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return bytes;
}
