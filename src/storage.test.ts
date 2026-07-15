import { stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { NodeFsMediaStorage } from "@/platform/node-fs-storage";
import type { MediaStorage } from "@/storage";
import { InMemoryMediaStorage } from "@/storage";

// Contract test run against every MediaStorage implementation (ADR-0018) so
// the in-memory and disk-backed stores stay behaviorally interchangeable.
const IMPLEMENTATIONS: [string, () => MediaStorage][] = [
  ["InMemoryMediaStorage", () => new InMemoryMediaStorage()],
  ["NodeFsMediaStorage", () => new NodeFsMediaStorage()],
];

describe.each(IMPLEMENTATIONS)("%s (MediaStorage contract)", (_name, create) => {
  it("round-trips content through write and read", async () => {
    const storage = create();
    const data = new TextEncoder().encode("media content");
    await storage.write("0", data);
    expect(await storage.read("0")).toEqual(data);
    await storage.dispose();
  });

  it("returns an independent copy that survives caller-side mutation", async () => {
    const storage = create();
    const data = Uint8Array.of(1, 2, 3);
    await storage.write("0", data);
    data[0] = 99;
    expect(await storage.read("0")).toEqual(Uint8Array.of(1, 2, 3));
    await storage.dispose();
  });

  it("overwrites content written under an existing key", async () => {
    const storage = create();
    await storage.write("0", Uint8Array.of(1));
    await storage.write("0", Uint8Array.of(2, 3));
    expect(await storage.read("0")).toEqual(Uint8Array.of(2, 3));
    await storage.dispose();
  });

  it("reports sizes without reading content", async () => {
    const storage = create();
    await storage.write("0", new Uint8Array(1234));
    expect(await storage.size("0")).toBe(1234);
    await storage.dispose();
  });

  it("deletes stored content", async () => {
    const storage = create();
    await storage.write("0", Uint8Array.of(1));
    await storage.delete("0");
    await expect(storage.read("0")).rejects.toThrow();
    await storage.dispose();
  });

  it("throws when reading, sizing, or deleting a missing key", async () => {
    const storage = create();
    await storage.write("present", Uint8Array.of(1));
    await expect(storage.read("missing")).rejects.toThrow();
    await expect(storage.size("missing")).rejects.toThrow();
    await expect(storage.delete("missing")).rejects.toThrow();
    await storage.dispose();
  });

  it("dispose is idempotent and safe without any writes", async () => {
    const storage = create();
    await storage.dispose();
    await storage.dispose();
  });

  it("handles unicode-adjacent binary content byte-for-byte", async () => {
    const storage = create();
    const data = new Uint8Array(512).map((_, i) => (i * 7 + 3) % 256);
    await storage.write("42", data);
    expect(await storage.read("42")).toEqual(data);
    await storage.dispose();
  });
});

describe("NodeFsMediaStorage specifics", () => {
  it("creates its temp directory lazily and removes it on dispose", async () => {
    const storage = new NodeFsMediaStorage();
    // No writes: nothing on disk to clean up, dispose is a no-op.
    await storage.dispose();

    const active = new NodeFsMediaStorage();
    await active.write("0", Uint8Array.of(1));
    // Reach into the private field only to verify disk behavior.
    const dir = (active as unknown as { tempDir: string | undefined }).tempDir;
    expect(dir).toBeDefined();
    await active.dispose();
    if (dir !== undefined) {
      await expect(stat(dir)).rejects.toThrow();
    }
  });

  it("rejects use after dispose", async () => {
    const storage = new NodeFsMediaStorage();
    await storage.write("0", Uint8Array.of(1));
    await storage.dispose();
    await expect(storage.write("1", Uint8Array.of(2))).rejects.toThrow(/disposed/u);
  });
});
