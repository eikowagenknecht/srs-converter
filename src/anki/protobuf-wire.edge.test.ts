import { describe, expect, it } from "vitest";

import type { MessageDescriptor } from "./protobuf-wire";
import { ProtobufWireError, UNPARSED_KEY, decodeMessage, encodeMessage } from "./protobuf-wire";

const INNER: MessageDescriptor = {
  name: "Inner",
  fields: [{ no: 1, name: "x", type: "uint32" }],
};

const TEST_MESSAGE: MessageDescriptor = {
  name: "Test",
  fields: [
    { no: 1, name: "count", type: "uint32" },
    { no: 2, name: "signed", type: "int32" },
    { no: 3, name: "big", type: "int64" },
    { no: 4, name: "ratio", type: "float" },
    { no: 5, name: "label", type: "string" },
    { no: 6, name: "blob", type: "bytes" },
    { no: 7, name: "flags", type: "uint32", repeated: true },
    { no: 8, name: "maybe", type: "uint32", optional: true },
    { no: 9, name: "nested", type: INNER },
    { no: 10, name: "kind", type: "enum" },
  ],
};

function roundTrip(value: Record<string, unknown>): Record<string, unknown> {
  return decodeMessage(encodeMessage(value, TEST_MESSAGE), TEST_MESSAGE);
}

describe("message codec edge cases (Story 1.3.3 hardening)", () => {
  it("round-trips negative int32 and int64 values (10-byte varints)", () => {
    const decoded = roundTrip({ signed: -42, big: -1_699_999_999_999n });
    expect(decoded["signed"]).toBe(-42);
    expect(decoded["big"]).toBe(-1_699_999_999_999n);
  });

  it("round-trips int64 values beyond Number.MAX_SAFE_INTEGER exactly", () => {
    const bigId = 6_134_417_914_424_963_362n;
    expect(roundTrip({ big: bigId })["big"]).toBe(bigId);
  });

  it("decodes unpacked repeated scalars (proto2-style encoders)", () => {
    // Field 7 as three separate varint entries: tag 0x38 = field 7, wire 0.
    const buffer = Uint8Array.from([0x38, 1, 0x38, 2, 0x38, 3]);
    expect(decodeMessage(buffer, TEST_MESSAGE)["flags"]).toEqual([1, 2, 3]);
  });

  it("encodes repeated scalars packed and decodes them back", () => {
    const encoded = encodeMessage({ flags: [1, 200, 3] }, TEST_MESSAGE);
    // One length-delimited entry: tag 0x3a = field 7, wire 2.
    expect(encoded[0]).toBe(0x3a);
    expect(decodeMessage(encoded, TEST_MESSAGE)["flags"]).toEqual([1, 200, 3]);
  });

  it("preserves unknown enum values as numbers", () => {
    expect(roundTrip({ kind: 99 })["kind"]).toBe(99);
  });

  it("emits optional fields even at their default value", () => {
    const withZero = encodeMessage({ maybe: 0 }, TEST_MESSAGE);
    expect(withZero.length).toBeGreaterThan(0);
    expect(decodeMessage(withZero, TEST_MESSAGE)["maybe"]).toBe(0);
    // Non-optional zero is omitted (proto3 default).
    expect(encodeMessage({ count: 0 }, TEST_MESSAGE)).toHaveLength(0);
    // Absent optional stays absent after decode.
    expect(decodeMessage(new Uint8Array(0), TEST_MESSAGE)["maybe"]).toBeUndefined();
  });

  it("emits present-but-empty nested messages (oneof presence)", () => {
    const encoded = encodeMessage({ nested: { x: 0 } }, TEST_MESSAGE);
    expect(encoded.length).toBeGreaterThan(0);
    const decoded = decodeMessage(encoded, TEST_MESSAGE);
    expect(decoded["nested"]).toEqual({ x: 0 });
  });

  it("re-emits unknown fields after known fields", () => {
    // Unknown field 15 (varint 7) followed by known field 1.
    const buffer = Uint8Array.from([0x78, 7, 0x08, 5]);
    const decoded = decodeMessage(buffer, TEST_MESSAGE);
    expect(decoded["count"]).toBe(5);
    expect(decoded[UNPARSED_KEY]).toEqual(Uint8Array.from([0x78, 7]));

    const reEncoded = encodeMessage(decoded, TEST_MESSAGE);
    // Known field first, unknown bytes appended verbatim.
    expect(reEncoded).toEqual(Uint8Array.from([0x08, 5, 0x78, 7]));
    expect(decodeMessage(reEncoded, TEST_MESSAGE)).toEqual(decoded);
  });

  it("throws on truncated floats", () => {
    // Field 4, wire 5 (fixed32) with only two payload bytes.
    const buffer = Uint8Array.from([0x25, 0x00, 0x00]);
    expect(() => decodeMessage(buffer, TEST_MESSAGE)).toThrow(ProtobufWireError);
  });

  it("throws when a string field arrives with the wrong wire type", () => {
    // Field 5 with varint wire type instead of length-delimited.
    const buffer = Uint8Array.from([0x28, 1]);
    expect(() => decodeMessage(buffer, TEST_MESSAGE)).toThrow(ProtobufWireError);
  });

  it("throws when a nested message is truncated", () => {
    // Field 9, wire 2, declared length 5 but only 1 payload byte.
    const buffer = Uint8Array.from([0x4a, 5, 0x08]);
    expect(() => decodeMessage(buffer, TEST_MESSAGE)).toThrow(ProtobufWireError);
  });

  it("round-trips float precision at f32 resolution", () => {
    const decoded = roundTrip({ ratio: Math.fround(0.85) });
    expect(decoded["ratio"]).toBe(Math.fround(0.85));
  });
});
