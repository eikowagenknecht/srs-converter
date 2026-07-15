/**
 * Browser implementation of the `#platform` alias: WASM zstd via
 * `@hpcc-js/wasm-zstd` (ADR-0019; the wasm binary is embedded in the
 * package's ESM bundle, so consumers need no asset wiring) and in-memory
 * media staging.
 */

import { Zstd } from "@hpcc-js/wasm-zstd";

import type { PlatformAdapter } from "@/platform/types";
import { InMemoryMediaStorage } from "@/storage";

// Zstd.load() memoizes the compiled instance internally, but keep our own
// promise so concurrent first calls share one compilation.
let zstdInstance: Promise<Zstd> | undefined;

function loadZstd(): Promise<Zstd> {
  zstdInstance ??= Zstd.load();
  return zstdInstance;
}

export const platform: PlatformAdapter = {
  createDefaultMediaStorage: () => new InMemoryMediaStorage(),

  async zstdCompress(data: Uint8Array): Promise<Uint8Array> {
    const zstd = await loadZstd();
    // Default level 3 — the same default Anki uses (ADR-0014/0019).
    return zstd.compress(data);
  },

  async zstdDecompress(data: Uint8Array): Promise<Uint8Array> {
    const zstd = await loadZstd();
    return zstd.decompress(data);
  },
};
