import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64 } from "./base64";

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    const data = new Uint8Array(256).map((_, i) => i);
    expect(base64ToBytes(bytesToBase64(data))).toEqual(data);
  });

  it("round-trips the empty array", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToBytes("")).toEqual(new Uint8Array(0));
  });

  it("matches Node's Buffer base64 encoding", () => {
    const data = new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x7f, 0x01, 0xfe]);
    expect(bytesToBase64(data)).toBe(Buffer.from(data).toString("base64"));
    const encoded = Buffer.from("any carnal pleasure.", "utf8").toString("base64");
    expect(base64ToBytes(encoded)).toEqual(new Uint8Array(Buffer.from(encoded, "base64")));
  });

  it("handles payloads larger than the encoding chunk size", () => {
    const data = new Uint8Array(100_000).map((_, i) => (i * 13 + 5) % 256);
    expect(bytesToBase64(data)).toBe(Buffer.from(data).toString("base64"));
    expect(base64ToBytes(bytesToBase64(data))).toEqual(data);
  });

  it("throws on invalid base64 input", () => {
    expect(() => base64ToBytes("not base64!!!")).toThrow();
  });
});
