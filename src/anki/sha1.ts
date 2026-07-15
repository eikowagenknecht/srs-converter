/**
 * SHA-1 hashing without Node dependencies.
 *
 * Anki uses SHA-1 in two places this library must reproduce: the note field
 * checksum (`notes.csum`, sync call path) and the modern package's media
 * manifest checksums (async call paths). The sync path needs a pure-TS
 * implementation because WebCrypto is async-only; the async helper prefers
 * WebCrypto (native speed for large media files) and falls back to the pure
 * implementation where `crypto.subtle` is unavailable (non-secure browsing
 * contexts).
 *
 * SHA-1 is not used for security here — only for Anki-compatible checksums.
 */

/**
 * Computes the SHA-1 digest of the given bytes (pure TypeScript, RFC 3174).
 * @param data - The bytes to hash
 * @returns The 20-byte digest
 */
export function sha1Bytes(data: Uint8Array): Uint8Array {
  // Pad the message: append 0x80, zero-fill, and end with the 64-bit
  // big-endian bit length, so the total is a multiple of 64 bytes.
  const bitLength = data.length * 8;
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  // Bit length as two 32-bit words; inputs here are far below 2^53 bits.
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_00_00_00_00), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67_45_23_01;
  let h1 = 0xef_cd_ab_89;
  let h2 = 0x98_ba_dc_fe;
  let h3 = 0x10_32_54_76;
  let h4 = 0xc3_d2_e1_f0;

  const w = new Int32Array(80);

  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getInt32(block + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const value = (w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0);
      w[i] = (value << 1) | (value >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a_82_79_99;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6e_d9_eb_a1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f_1b_bc_dc;
      } else {
        f = b ^ c ^ d;
        k = 0xca_62_c1_d6;
      }

      // ">>> 0" truncates the sum to 32 bits (mod 2^32), as SHA-1 requires;
      // Math.trunc would not wrap the overflowing high bits.
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[i] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0, false);
  digestView.setUint32(4, h1, false);
  digestView.setUint32(8, h2, false);
  digestView.setUint32(12, h3, false);
  digestView.setUint32(16, h4, false);
  return digest;
}

/**
 * Computes the SHA-1 digest as a lowercase hex string.
 * @param input - A string (hashed as UTF-8) or raw bytes
 * @returns The 40-character hex digest
 */
export function sha1Hex(input: string | Uint8Array): string {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return Array.from(sha1Bytes(data), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes the SHA-1 digest, using WebCrypto when available.
 * @param data - The bytes to hash
 * @returns The 20-byte digest
 */
export async function sha1Async(data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle !== undefined) {
    return new Uint8Array(await subtle.digest("SHA-1", data as BufferSource));
  }
  return sha1Bytes(data);
}
