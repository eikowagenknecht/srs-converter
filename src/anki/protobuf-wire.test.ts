import { describe, expect, it } from "vitest";

import {
  ProtobufWireError,
  WIRE_TYPE,
  decodePackageMeta,
  decodeTag,
  decodeVarint,
  encodePackageMeta,
  encodeVarint,
  skipField,
} from "./protobuf-wire";

describe("protobuf wire primitives", () => {
  describe("decodeVarint", () => {
    it("decodes single-byte values", () => {
      expect(decodeVarint(Uint8Array.from([0x00]), 0)).toEqual({ value: 0n, offset: 1 });
      expect(decodeVarint(Uint8Array.from([0x02]), 0)).toEqual({ value: 2n, offset: 1 });
      expect(decodeVarint(Uint8Array.from([0x7f]), 0)).toEqual({ value: 127n, offset: 1 });
    });

    it("decodes multi-byte values", () => {
      // 300 = 0b10101100 0b00000010
      expect(decodeVarint(Uint8Array.from([0xac, 0x02]), 0)).toEqual({ value: 300n, offset: 2 });
    });

    it("decodes the maximum 64-bit value", () => {
      const max = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
      expect(decodeVarint(max, 0).value).toBe(0xff_ff_ff_ff_ff_ff_ff_ffn);
    });

    it("starts at the given offset", () => {
      expect(decodeVarint(Uint8Array.from([0x08, 0x03]), 1)).toEqual({ value: 3n, offset: 2 });
    });

    it("throws on truncated input", () => {
      expect(() => decodeVarint(Uint8Array.from([0x80]), 0)).toThrow(ProtobufWireError);
      expect(() => decodeVarint(new Uint8Array(0), 0)).toThrow(ProtobufWireError);
    });

    it("throws on over-long varints", () => {
      const tooLong = Uint8Array.from(Array.from({ length: 11 }, () => 0x80));
      expect(() => decodeVarint(tooLong, 0)).toThrow(ProtobufWireError);
    });
  });

  describe("encodeVarint", () => {
    it("round-trips values through decodeVarint", () => {
      for (const value of [0n, 1n, 127n, 128n, 300n, 2n ** 32n, 2n ** 63n]) {
        const encoded = encodeVarint(value);
        expect(decodeVarint(encoded, 0)).toEqual({ value, offset: encoded.length });
      }
    });

    it("encodes negative values as 64-bit two's complement", () => {
      const encoded = encodeVarint(-1);
      expect(encoded).toHaveLength(10);
      expect(decodeVarint(encoded, 0).value).toBe(0xff_ff_ff_ff_ff_ff_ff_ffn);
    });
  });

  describe("decodeTag", () => {
    it("splits field number and wire type", () => {
      // 0x08 = field 1, wire type 0
      expect(decodeTag(Uint8Array.from([0x08]), 0)).toEqual({
        fieldNumber: 1,
        wireType: WIRE_TYPE.varint,
        offset: 1,
      });
      // 0x12 = field 2, wire type 2
      expect(decodeTag(Uint8Array.from([0x12]), 0)).toEqual({
        fieldNumber: 2,
        wireType: WIRE_TYPE.lengthDelimited,
        offset: 1,
      });
    });

    it("rejects the obsolete group wire types and field number 0", () => {
      // wire type 3 (start group)
      expect(() => decodeTag(Uint8Array.from([0x0b]), 0)).toThrow(ProtobufWireError);
      // field number 0, wire type 0
      expect(() => decodeTag(Uint8Array.from([0x00]), 0)).toThrow(ProtobufWireError);
    });
  });

  describe("skipField", () => {
    it("skips each supported wire type", () => {
      expect(skipField(Uint8Array.from([0xac, 0x02]), 0, WIRE_TYPE.varint)).toBe(2);
      expect(skipField(new Uint8Array(8), 0, WIRE_TYPE.fixed64)).toBe(8);
      expect(skipField(new Uint8Array(4), 0, WIRE_TYPE.fixed32)).toBe(4);
      // length-delimited: length prefix 3, then 3 bytes of payload
      expect(
        skipField(Uint8Array.from([0x03, 0x61, 0x62, 0x63]), 0, WIRE_TYPE.lengthDelimited),
      ).toBe(4);
    });

    it("throws when the payload extends past the buffer", () => {
      expect(() => skipField(Uint8Array.from([0x05, 0x61]), 0, WIRE_TYPE.lengthDelimited)).toThrow(
        ProtobufWireError,
      );
      expect(() => skipField(new Uint8Array(3), 0, WIRE_TYPE.fixed32)).toThrow(ProtobufWireError);
    });
  });
});

describe("package meta codec", () => {
  it("decodes the version field", () => {
    expect(decodePackageMeta(Uint8Array.from([0x08, 0x02]))).toEqual({ version: 2 });
    expect(decodePackageMeta(Uint8Array.from([0x08, 0x03]))).toEqual({ version: 3 });
  });

  it("returns version 0 for an empty buffer (proto3 default)", () => {
    expect(decodePackageMeta(new Uint8Array(0))).toEqual({ version: 0 });
  });

  it("skips unknown fields", () => {
    // field 1 = 2, then unknown field 2 (length-delimited, "abc")
    const buffer = Uint8Array.from([0x08, 0x02, 0x12, 0x03, 0x61, 0x62, 0x63]);
    expect(decodePackageMeta(buffer)).toEqual({ version: 2 });
    // unknown field first, then version
    const reversed = Uint8Array.from([0x12, 0x03, 0x61, 0x62, 0x63, 0x08, 0x02]);
    expect(decodePackageMeta(reversed)).toEqual({ version: 2 });
  });

  it("throws on malformed wire data", () => {
    expect(() => decodePackageMeta(Uint8Array.from([0xff, 0xff, 0xff]))).toThrow(ProtobufWireError);
  });

  it("encodes byte-identically to Anki's own meta files", () => {
    // Anki's Legacy 2 meta is exactly [0x08, 0x02]
    expect(encodePackageMeta({ version: 2 })).toEqual(Uint8Array.from([0x08, 0x02]));
    expect(encodePackageMeta({ version: 3 })).toEqual(Uint8Array.from([0x08, 0x03]));
  });

  it("round-trips through decode", () => {
    for (const version of [1, 2, 3, 99]) {
      expect(decodePackageMeta(encodePackageMeta({ version }))).toEqual({ version });
    }
  });
});
