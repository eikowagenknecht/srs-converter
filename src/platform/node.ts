/**
 * Node implementation of the `#platform` alias: native zstd via `node:zlib`
 * (ADR-0014/ADR-0019, available since Node 22.15 — the package's engine
 * floor) and disk-backed media staging.
 */

import { Buffer } from "node:buffer";
import { promisify } from "node:util";
import { zstdCompress as zstdCompressCb, zstdDecompress as zstdDecompressCb } from "node:zlib";

import type { PlatformAdapter } from "@/platform/types";

import { NodeFsMediaStorage } from "./node-fs-storage";

const zstdCompressAsync = promisify(zstdCompressCb);
const zstdDecompressAsync = promisify(zstdDecompressCb);

export const platform: PlatformAdapter = {
  createDefaultMediaStorage: () => new NodeFsMediaStorage(),

  async zstdCompress(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await zstdCompressAsync(Buffer.from(data)));
  },

  async zstdDecompress(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await zstdDecompressAsync(Buffer.from(data)));
  },
};
