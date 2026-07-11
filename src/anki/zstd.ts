/**
 * zstd (de)compression for modern Anki packages (ADR-0014).
 *
 * Uses Node's built-in zstd support (`node:zlib`, available since 22.15 —
 * the package's engine floor). Anki writes standard zstd frames at the
 * library default level; the importer accepts any valid frame, so no level
 * tuning is needed for compatibility.
 */

import { Buffer } from "node:buffer";
import { promisify } from "node:util";
import { zstdCompress as zstdCompressCb, zstdDecompress as zstdDecompressCb } from "node:zlib";

const zstdCompressAsync = promisify(zstdCompressCb);
const zstdDecompressAsync = promisify(zstdDecompressCb);

/**
 * Decompresses a zstd frame (e.g. `collection.anki21b`, the modern media
 * manifest, or an individual media file).
 *
 * @returns The decompressed bytes.
 */
export async function zstdDecompress(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await zstdDecompressAsync(Buffer.from(data)));
}

/**
 * Compresses data into a standard zstd frame (default level, matching what
 * Anki's importer accepts).
 *
 * @returns The compressed bytes.
 */
export async function zstdCompress(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await zstdCompressAsync(Buffer.from(data)));
}
