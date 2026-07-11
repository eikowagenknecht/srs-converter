import { describe, expect, it } from "vitest";

import { fromStorable, toStorable } from "./native-blobs";
import { parseJsonWithBigInts, serializeWithBigInts } from "./util";

describe("native blob storage shaping (ADR-0016 hardening)", () => {
  it("round-trips nested structures with byte fields through JSON", () => {
    const source = {
      config: {
        other: Uint8Array.from([1, 2, 255, 0]),
        $unparsed: Uint8Array.from([0x78, 7]),
        css: ".card {}",
        id: 6_134_417_914_424_963_362n,
        empty: new Uint8Array(0),
      },
      entries: [{ sha1: Uint8Array.from({ length: 20 }, (_, i) => i), size: 7 }],
      flag: true,
      nothing: null,
    };

    const json = serializeWithBigInts(toStorable(source));
    const restored = fromStorable(parseJsonWithBigInts(json));
    expect(restored).toEqual(source);
  });

  it("leaves plain values untouched", () => {
    for (const value of [42, "text", true, null, [1, 2], { a: 1 }]) {
      expect(fromStorable(toStorable(value))).toEqual(value);
    }
  });

  it("documents the $b64 wrapper ambiguity", () => {
    // A genuine user object shaped exactly like the wrapper cannot be
    // distinguished from encoded bytes: it comes back as a Uint8Array. This
    // is a known, accepted limitation of the storage dialect — the wrapper
    // key is reserved.
    const ambiguous = { $b64: "AQI=" };
    expect(fromStorable(toStorable(ambiguous))).toEqual(Uint8Array.from([1, 2]));
  });
});
