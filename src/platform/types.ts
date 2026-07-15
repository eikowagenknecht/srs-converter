import type { MediaStorage } from "@/storage";

/**
 * The per-platform capabilities behind the `#platform` alias (ADR-0018,
 * ADR-0019). Two implementations exist — `platform/node.ts` (native zstd,
 * disk-backed storage) and `platform/browser.ts` (WASM zstd, in-memory
 * storage) — selected at build time; the package.json `exports` conditions
 * pick the matching bundle at install time.
 */
export interface PlatformAdapter {
  /**
   * Compresses data into a standard zstd frame (default level, matching what
   * Anki's importer accepts).
   * @param data - The bytes to compress
   * @returns The compressed frame
   */
  zstdCompress: (data: Uint8Array) => Promise<Uint8Array>;

  /**
   * Decompresses a zstd frame (e.g. `collection.anki21b`, the modern media
   * manifest, or an individual media file).
   * @param data - The zstd frame to decompress
   * @returns The decompressed bytes
   */
  zstdDecompress: (data: Uint8Array) => Promise<Uint8Array>;

  /**
   * Creates the platform's default media storage backing a single package.
   * @returns A fresh storage instance
   */
  createDefaultMediaStorage: () => MediaStorage;
}
