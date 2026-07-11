import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { mediaEntriesCodec } from "./anki-proto";
import { zstdCompress, zstdDecompress } from "./zstd";

describe("zstd helpers (ADR-0014 hardening)", () => {
  it("round-trips data through compress and decompress", async () => {
    const data = new TextEncoder().encode("srs-converter ".repeat(1000));
    const compressed = await zstdCompress(data);
    expect(compressed.length).toBeLessThan(data.length);
    expect(await zstdDecompress(compressed)).toEqual(data);
  });

  it("round-trips empty input", async () => {
    expect(await zstdDecompress(await zstdCompress(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it("rejects data that is not a zstd frame", async () => {
    await expect(zstdDecompress(Uint8Array.from([1, 2, 3, 4]))).rejects.toThrow();
  });

  it("decompresses frames written by real Anki", async () => {
    // The raw media manifest dumped from the fixture corpus is a frame Anki
    // itself compressed — cross-validates our decompression against theirs.
    const raw = new Uint8Array(
      await readFile("tests/fixtures/anki/corpus/artifacts/media-manifest.zst"),
    );
    const manifest = mediaEntriesCodec.decode(await zstdDecompress(raw));
    const names = manifest.entries.map((entry) => entry.name).sort();
    expect(names).toEqual(["beep.mp3", "pixel.png"]);
    for (const entry of manifest.entries) {
      expect(entry.sha1).toHaveLength(20);
    }
  });
});
