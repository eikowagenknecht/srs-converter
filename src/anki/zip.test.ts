import { describe, expect, it } from "vitest";

import { buildZip, readZipEntries } from "./zip";

describe("buildZip / readZipEntries", () => {
  it("round-trips entry names and content", async () => {
    const entries = [
      { name: "hello.txt", data: new TextEncoder().encode("hello world"), compress: true },
      { name: "raw.bin", data: Uint8Array.of(1, 2, 3, 4, 5), compress: false },
    ];

    const zip = await buildZip(entries);
    const read = readZipEntries(zip);

    expect([...read.keys()].sort()).toEqual(["hello.txt", "raw.bin"]);
    expect(new TextDecoder().decode(read.get("hello.txt"))).toBe("hello world");
    expect(read.get("raw.bin")).toEqual(Uint8Array.of(1, 2, 3, 4, 5));
  });

  it("deflates compressible entries smaller than stored ones, both round-tripping", async () => {
    // Highly compressible payload so deflate is unambiguously smaller.
    const compressible = new TextEncoder().encode("a".repeat(1000));

    const stored = await buildZip([{ name: "f", data: compressible, compress: false }]);
    const deflated = await buildZip([{ name: "f", data: compressible, compress: true }]);

    expect(deflated.length).toBeLessThan(stored.length);
    expect(readZipEntries(stored).get("f")).toEqual(compressible);
    expect(readZipEntries(deflated).get("f")).toEqual(compressible);
  });

  it("accepts an async iterable of entries", async () => {
    async function* entries() {
      yield { name: "a", data: new TextEncoder().encode("A"), compress: false };
      yield { name: "b", data: new TextEncoder().encode("B"), compress: true };
    }

    const read = readZipEntries(await buildZip(entries()));

    expect(new TextDecoder().decode(read.get("a"))).toBe("A");
    expect(new TextDecoder().decode(read.get("b"))).toBe("B");
  });

  it("throws when reading bytes that are not a ZIP archive", () => {
    expect(() => readZipEntries(Uint8Array.of(1, 2, 3))).toThrow();
  });
});
