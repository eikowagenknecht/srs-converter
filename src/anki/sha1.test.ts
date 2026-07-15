import { describe, expect, it } from "vitest";

import { sha1Async, sha1Bytes, sha1Hex } from "./sha1";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("sha1", () => {
  // RFC 3174 / FIPS 180 test vectors
  it("hashes the empty string", () => {
    expect(sha1Hex("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
  });

  it('hashes "abc"', () => {
    expect(sha1Hex("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it('hashes "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"', () => {
    expect(sha1Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "84983e441c3bd26ebaae4aa1f95129e5e54670f1",
    );
  });

  it("hashes one million 'a' characters", () => {
    const million = new Uint8Array(1_000_000).fill(0x61);
    expect(sha1Hex(million)).toBe("34aa973cd4c4daa4f61eeb2bdbad27316534016f");
  });

  it("hashes multi-byte UTF-8 strings by their encoded bytes", () => {
    // sha1Hex(string) must equal sha1Hex(TextEncoder bytes of that string)
    const text = "ünïcode 文字 🎴";
    expect(sha1Hex(text)).toBe(sha1Hex(new TextEncoder().encode(text)));
  });

  it("matches WebCrypto across block-boundary and larger payloads", async () => {
    // 55/56/63/64/65 exercise the padding logic's one-vs-two-block switch.
    for (const length of [0, 1, 20, 55, 56, 63, 64, 65, 100, 4096, 70_000]) {
      const data = new Uint8Array(length).map((_, i) => (i * 31 + 7) % 256);
      const subtle = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
      expect(hex(sha1Bytes(data))).toBe(hex(subtle));
    }
  });

  it("sha1Async returns the same digest as sha1Bytes", async () => {
    const data = new TextEncoder().encode("media file content");
    expect(hex(await sha1Async(data))).toBe(hex(sha1Bytes(data)));
  });
});
