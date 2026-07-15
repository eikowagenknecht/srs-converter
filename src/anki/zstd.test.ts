import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { platform as browserPlatform } from "@/platform/browser";
import { platform as nodePlatform } from "@/platform/node";

import { mediaEntriesCodec } from "./anki-proto";

/**
 * Both platform adapters (ADR-0019) run under Node, so the node and browser
 * zstd implementations are tested side by side, including cross-implementation
 * frame compatibility (node-compressed → wasm-decompressed and vice versa).
 */
const IMPLEMENTATIONS = [
  ["node (node:zlib)", nodePlatform],
  ["browser (@hpcc-js/wasm-zstd)", browserPlatform],
] as const;

describe.each(IMPLEMENTATIONS)("zstd via %s (ADR-0014/0019)", (_name, impl) => {
  it("round-trips data through compress and decompress", async () => {
    const data = new TextEncoder().encode("srs-converter ".repeat(1000));
    const compressed = await impl.zstdCompress(data);
    expect(compressed.length).toBeLessThan(data.length);
    expect(await impl.zstdDecompress(compressed)).toEqual(data);
  });

  it("round-trips empty input", async () => {
    const compressed = await impl.zstdCompress(new Uint8Array(0));
    expect(await impl.zstdDecompress(compressed)).toEqual(new Uint8Array(0));
  });

  it("rejects data that is not a zstd frame", async () => {
    await expect(impl.zstdDecompress(Uint8Array.from([1, 2, 3, 4]))).rejects.toThrow();
  });

  it("decompresses frames written by real Anki", async () => {
    // The raw media manifest dumped from the fixture corpus is a frame Anki
    // itself compressed — cross-validates our decompression against theirs.
    const raw = new Uint8Array(
      await readFile("tests/fixtures/anki/corpus/artifacts/media-manifest.zst"),
    );
    const manifest = mediaEntriesCodec.decode(await impl.zstdDecompress(raw));
    const names = manifest.entries.map((entry) => entry.name).sort();
    expect(names).toEqual(["beep.mp3", "pixel.png"]);
    for (const entry of manifest.entries) {
      expect(entry.sha1).toHaveLength(20);
    }
  });
});

describe("zstd cross-implementation compatibility (ADR-0019)", () => {
  const data = new TextEncoder().encode("frame compatibility ".repeat(500));

  it("wasm decompresses node-compressed frames", async () => {
    const compressed = await nodePlatform.zstdCompress(data);
    expect(await browserPlatform.zstdDecompress(compressed)).toEqual(data);
  });

  it("node decompresses wasm-compressed frames", async () => {
    const compressed = await browserPlatform.zstdCompress(data);
    expect(await nodePlatform.zstdDecompress(compressed)).toEqual(data);
  });
});
