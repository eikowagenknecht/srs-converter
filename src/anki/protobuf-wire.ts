/**
 * Hand-rolled protobuf wire-format primitives (ADR-0013).
 *
 * Modern Anki packages store metadata and entity configuration as protobuf
 * messages. srs-converter decodes and encodes them without vendoring Anki's
 * AGPL-licensed .proto files: the message and field facts are documented in
 * `docs/formats/anki.md` (§Pinned wire-format spec) and the wire format
 * itself is specified at https://protobuf.dev/programming-guides/encoding/
 *
 * This module holds the low-level primitives plus the tiny package `meta`
 * message; the full entity codec is added by Story 1.3.3.
 */

/** Protobuf wire types (start/end-group are obsolete and unsupported). */
export const WIRE_TYPE = {
  varint: 0,
  fixed64: 1,
  lengthDelimited: 2,
  fixed32: 5,
} as const;

export type WireType = (typeof WIRE_TYPE)[keyof typeof WIRE_TYPE];

/** Error thrown when a buffer is not valid protobuf wire data. */
export class ProtobufWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtobufWireError";
  }
}

/** A varint never spans more than 10 bytes (64 bits in 7-bit groups). */
const MAX_VARINT_BYTES = 10;

/** Decoded varint plus the offset of the byte following it. */
export interface VarintResult {
  value: bigint;
  offset: number;
}

/**
 * Decodes a base-128 varint starting at `offset`.
 *
 * @returns The value as an unsigned 64-bit bigint (callers interpret
 * signedness per field type, e.g. via `BigInt.asIntN`) plus the offset of
 * the byte following it.
 */
export function decodeVarint(buffer: Uint8Array, offset: number): VarintResult {
  let value = 0n;
  let shift = 0n;
  let position = offset;

  for (let index = 0; index < MAX_VARINT_BYTES; index++) {
    if (position >= buffer.length) {
      throw new ProtobufWireError(
        `Truncated varint at byte ${position.toFixed(0)}: buffer ended mid-value.`,
      );
    }
    const byte = buffer[position] ?? 0;
    position += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: BigInt.asUintN(64, value), offset: position };
    }
    shift += 7n;
  }

  throw new ProtobufWireError(
    `Varint at byte ${offset.toFixed(0)} exceeds the maximum length of 10 bytes.`,
  );
}

/**
 * Encodes a value as a base-128 varint (negative values as 64-bit two's complement).
 *
 * @returns The encoded bytes.
 */
export function encodeVarint(value: bigint | number): Uint8Array {
  let remaining = BigInt.asUintN(64, typeof value === "bigint" ? value : BigInt(value));
  const bytes: number[] = [];
  do {
    const chunk = Number(remaining & 0x7fn);
    remaining >>= 7n;
    bytes.push(remaining === 0n ? chunk : chunk | 0x80);
  } while (remaining !== 0n);
  return Uint8Array.from(bytes);
}

/** Decoded field tag plus the offset of the byte following it. */
export interface TagResult {
  fieldNumber: number;
  wireType: WireType;
  offset: number;
}

/**
 * Decodes a field tag (field number + wire type) starting at `offset`.
 *
 * @returns The field number and wire type plus the offset of the byte following the tag.
 */
export function decodeTag(buffer: Uint8Array, offset: number): TagResult {
  const { value, offset: next } = decodeVarint(buffer, offset);
  const wireType = Number(value & 0x7n);
  const fieldNumber = Number(value >> 3n);
  if (
    wireType !== WIRE_TYPE.varint &&
    wireType !== WIRE_TYPE.fixed64 &&
    wireType !== WIRE_TYPE.lengthDelimited &&
    wireType !== WIRE_TYPE.fixed32
  ) {
    throw new ProtobufWireError(
      `Unsupported wire type ${wireType.toFixed(0)} at byte ${offset.toFixed(0)}.`,
    );
  }
  if (fieldNumber === 0) {
    throw new ProtobufWireError(`Invalid field number 0 at byte ${offset.toFixed(0)}.`);
  }
  return { fieldNumber, wireType, offset: next };
}

/**
 * Skips a field's payload without interpreting it.
 *
 * @returns The offset just past the payload.
 */
export function skipField(buffer: Uint8Array, offset: number, wireType: WireType): number {
  switch (wireType) {
    case WIRE_TYPE.varint: {
      return decodeVarint(buffer, offset).offset;
    }
    case WIRE_TYPE.fixed64: {
      return checkedEnd(buffer, offset, 8);
    }
    case WIRE_TYPE.fixed32: {
      return checkedEnd(buffer, offset, 4);
    }
    case WIRE_TYPE.lengthDelimited: {
      const { value, offset: dataStart } = decodeVarint(buffer, offset);
      return checkedEnd(buffer, dataStart, Number(value));
    }
  }
}

function checkedEnd(buffer: Uint8Array, offset: number, length: number): number {
  const end = offset + length;
  if (end > buffer.length) {
    throw new ProtobufWireError(
      `Field data at byte ${offset.toFixed(0)} extends past the end of the buffer.`,
    );
  }
  return end;
}

/** Scalar field types used by the pinned Anki messages. */
export type ScalarType =
  | "bool"
  | "bytes"
  | "enum"
  | "float"
  | "int32"
  | "int64"
  | "string"
  | "uint32";

/** Describes one field of a message: wire number, JSON name, and type. */
export interface FieldDescriptor {
  no: number;
  name: string;
  type: MessageDescriptor | ScalarType;
  /** Repeated field; scalars decode packed and unpacked, encode packed. */
  repeated?: boolean;
  /** proto3 explicit presence (`optional`): emitted whenever the key is set. */
  optional?: boolean;
}

/** Describes a message as the ordered list of its known fields. */
export interface MessageDescriptor {
  name: string;
  fields: FieldDescriptor[];
}

/**
 * Key holding the raw wire bytes of all fields a descriptor does not model
 * (ADR-0013 unknown-field passthrough). Re-emitted verbatim on encode.
 */
export const UNPARSED_KEY = "$unparsed";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function scalarDefault(type: ScalarType): unknown {
  switch (type) {
    case "bool": {
      return false;
    }
    case "bytes": {
      return new Uint8Array(0);
    }
    case "string": {
      return "";
    }
    case "int64": {
      return 0n;
    }
    default: {
      return 0;
    }
  }
}

function decodeScalarValue(
  type: ScalarType,
  buffer: Uint8Array,
  offset: number,
  wireType: WireType,
): { value: unknown; offset: number } {
  switch (type) {
    case "bool": {
      const result = decodeVarint(buffer, offset);
      return { value: result.value !== 0n, offset: result.offset };
    }
    case "enum":
    case "int32": {
      const result = decodeVarint(buffer, offset);
      return { value: Number(BigInt.asIntN(32, result.value)), offset: result.offset };
    }
    case "uint32": {
      const result = decodeVarint(buffer, offset);
      return { value: Number(BigInt.asUintN(32, result.value)), offset: result.offset };
    }
    case "int64": {
      const result = decodeVarint(buffer, offset);
      return { value: BigInt.asIntN(64, result.value), offset: result.offset };
    }
    case "float": {
      const end = offset + 4;
      if (end > buffer.length) {
        throw new ProtobufWireError(`Float at byte ${offset.toFixed(0)} is truncated.`);
      }
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
      return { value: view.getFloat32(0, true), offset: end };
    }
    case "string":
    case "bytes": {
      if (wireType !== WIRE_TYPE.lengthDelimited) {
        throw new ProtobufWireError(`Field of type ${type} must be length-delimited.`);
      }
      const length = decodeVarint(buffer, offset);
      const end = length.offset + Number(length.value);
      if (end > buffer.length) {
        throw new ProtobufWireError(`Field data at byte ${offset.toFixed(0)} is truncated.`);
      }
      const slice = buffer.slice(length.offset, end);
      return { value: type === "string" ? textDecoder.decode(slice) : slice, offset: end };
    }
  }
}

function scalarWireType(type: ScalarType): WireType {
  switch (type) {
    case "float": {
      return WIRE_TYPE.fixed32;
    }
    case "string":
    case "bytes": {
      return WIRE_TYPE.lengthDelimited;
    }
    default: {
      return WIRE_TYPE.varint;
    }
  }
}

/**
 * Decodes a message per its descriptor. Unknown fields land under
 * `$unparsed`; missing scalars get proto3 defaults, missing repeated fields
 * become empty arrays, missing `optional`/message fields stay absent.
 *
 * @returns The decoded message as a plain object keyed by field name.
 */
export function decodeMessage(
  buffer: Uint8Array,
  descriptor: MessageDescriptor,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const unparsed: Uint8Array[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const tagStart = offset;
    const tag = decodeTag(buffer, offset);
    const field = descriptor.fields.find((candidate) => candidate.no === tag.fieldNumber);

    if (!field) {
      const end = skipField(buffer, tag.offset, tag.wireType);
      unparsed.push(buffer.slice(tagStart, end));
      offset = end;
      continue;
    }

    if (typeof field.type !== "string") {
      // Nested message (always length-delimited).
      if (tag.wireType !== WIRE_TYPE.lengthDelimited) {
        throw new ProtobufWireError(`Message field '${field.name}' must be length-delimited.`);
      }
      const length = decodeVarint(buffer, tag.offset);
      const end = length.offset + Number(length.value);
      if (end > buffer.length) {
        throw new ProtobufWireError(`Message field '${field.name}' is truncated.`);
      }
      const nested = decodeMessage(buffer.slice(length.offset, end), field.type);
      if (field.repeated) {
        (result[field.name] ??= []) as unknown;
        (result[field.name] as unknown[]).push(nested);
      } else {
        result[field.name] = nested;
      }
      offset = end;
      continue;
    }

    if (
      field.repeated &&
      tag.wireType === WIRE_TYPE.lengthDelimited &&
      field.type !== "string" &&
      field.type !== "bytes"
    ) {
      // Packed repeated scalars.
      const length = decodeVarint(buffer, tag.offset);
      const end = length.offset + Number(length.value);
      if (end > buffer.length) {
        throw new ProtobufWireError(`Packed field '${field.name}' is truncated.`);
      }
      const values = (result[field.name] ??= []) as unknown[];
      let cursor = length.offset;
      while (cursor < end) {
        const item = decodeScalarValue(field.type, buffer, cursor, scalarWireType(field.type));
        values.push(item.value);
        cursor = item.offset;
      }
      offset = end;
      continue;
    }

    const decoded = decodeScalarValue(field.type, buffer, tag.offset, tag.wireType);
    if (field.repeated) {
      ((result[field.name] ??= []) as unknown[]).push(decoded.value);
    } else {
      result[field.name] = decoded.value;
    }
    offset = decoded.offset;
  }

  // Fill proto3 defaults so decoded shapes are stable for consumers.
  for (const field of descriptor.fields) {
    if (result[field.name] !== undefined) {
      continue;
    }
    if (field.repeated) {
      result[field.name] = [];
    } else if (typeof field.type === "string" && !field.optional) {
      result[field.name] = scalarDefault(field.type);
    }
  }

  if (unparsed.length > 0) {
    result[UNPARSED_KEY] = concatBytes(unparsed);
  }
  return result;
}

function isScalarDefault(type: ScalarType, value: unknown): boolean {
  switch (type) {
    case "bool": {
      return value === false;
    }
    case "string": {
      return value === "";
    }
    case "bytes": {
      return value instanceof Uint8Array && value.length === 0;
    }
    case "int64": {
      return value === 0n;
    }
    default: {
      return value === 0;
    }
  }
}

function encodeScalarValue(type: ScalarType, value: unknown): Uint8Array {
  switch (type) {
    case "bool": {
      return encodeVarint(value === true ? 1n : 0n);
    }
    case "enum":
    case "int32":
    case "uint32": {
      return encodeVarint(BigInt(value as number));
    }
    case "int64": {
      return encodeVarint(value as bigint);
    }
    case "float": {
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setFloat32(0, value as number, true);
      return bytes;
    }
    case "string": {
      return lengthDelimited(textEncoder.encode(value as string));
    }
    case "bytes": {
      return lengthDelimited(value as Uint8Array);
    }
  }
}

function lengthDelimited(payload: Uint8Array): Uint8Array {
  return concatBytes([encodeVarint(payload.length), payload]);
}

function encodeTag(fieldNumber: number, wireType: WireType): Uint8Array {
  return encodeVarint((BigInt(fieldNumber) << 3n) | BigInt(wireType));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

/**
 * Encodes a message per its descriptor, mirroring Anki's writer: fields in
 * ascending number order, proto3 defaults omitted (except `optional` fields,
 * which are emitted whenever their key is set), repeated scalars packed,
 * `$unparsed` bytes re-emitted verbatim at the end.
 *
 * @returns The encoded bytes.
 */
export function encodeMessage(
  value: Record<string, unknown>,
  descriptor: MessageDescriptor,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const fields = [...descriptor.fields].sort((left, right) => left.no - right.no);

  for (const field of fields) {
    const fieldValue = value[field.name];
    if (fieldValue === undefined || fieldValue === null) {
      continue;
    }

    if (typeof field.type !== "string") {
      const items = field.repeated
        ? (fieldValue as Record<string, unknown>[])
        : [fieldValue as Record<string, unknown>];
      for (const item of items) {
        chunks.push(
          encodeTag(field.no, WIRE_TYPE.lengthDelimited),
          lengthDelimited(encodeMessage(item, field.type)),
        );
      }
      continue;
    }

    if (field.repeated) {
      const items = fieldValue as unknown[];
      if (items.length === 0) {
        continue;
      }
      if (field.type === "string" || field.type === "bytes") {
        for (const item of items) {
          chunks.push(
            encodeTag(field.no, WIRE_TYPE.lengthDelimited),
            encodeScalarValue(field.type, item),
          );
        }
      } else {
        // Packed.
        const scalarType = field.type;
        const payload = concatBytes(items.map((item) => encodeScalarValue(scalarType, item)));
        chunks.push(encodeTag(field.no, WIRE_TYPE.lengthDelimited), lengthDelimited(payload));
      }
      continue;
    }

    if (!field.optional && isScalarDefault(field.type, fieldValue)) {
      continue;
    }
    chunks.push(
      encodeTag(field.no, scalarWireType(field.type)),
      encodeScalarValue(field.type, fieldValue),
    );
  }

  const unparsed = value[UNPARSED_KEY];
  if (unparsed instanceof Uint8Array && unparsed.length > 0) {
    chunks.push(unparsed);
  }
  return concatBytes(chunks);
}

/**
 * The `meta` file of an Anki package (`PackageMetadata` message):
 * a single enum field describing the package version.
 */
export interface AnkiPackageMeta {
  /** `ExportVersion`: 1 = legacy 1, 2 = legacy 2, 3 = modern; 0 = unknown. */
  version: number;
}

const META_VERSION_FIELD = 1;

/**
 * Decodes a package `meta` file. Unknown fields are skipped.
 *
 * @returns The package metadata; a missing version field yields 0 (proto3
 * default), which callers must treat as an unrecognized version.
 */
export function decodePackageMeta(buffer: Uint8Array): AnkiPackageMeta {
  let version = 0;
  let offset = 0;
  while (offset < buffer.length) {
    const tag = decodeTag(buffer, offset);
    if (tag.fieldNumber === META_VERSION_FIELD && tag.wireType === WIRE_TYPE.varint) {
      const decoded = decodeVarint(buffer, tag.offset);
      version = Number(BigInt.asIntN(32, decoded.value));
      offset = decoded.offset;
    } else {
      offset = skipField(buffer, tag.offset, tag.wireType);
    }
  }
  return { version };
}

/**
 * Encodes a package `meta` file (proto3: a zero version is omitted).
 *
 * @returns The encoded bytes.
 */
export function encodePackageMeta(meta: AnkiPackageMeta): Uint8Array {
  if (meta.version === 0) {
    return new Uint8Array(0);
  }
  const tag = encodeVarint((META_VERSION_FIELD << 3) | WIRE_TYPE.varint);
  const value = encodeVarint(meta.version);
  const out = new Uint8Array(tag.length + value.length);
  out.set(tag, 0);
  out.set(value, tag.length);
  return out;
}
