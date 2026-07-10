import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSelectiveZip,
  extractTimestampFromUuid,
  fieldChecksum,
  generateUniqueIdFromUuid,
  generateUnixTimeInMilliseconds,
  generateUnixTimeInSeconds,
  generateUuid,
  guid64,
  omitFields,
  parseJsonWithBigInts,
  sanitizeFilename,
  serializeWithBigInts,
  stripHtml,
} from "./util";

describe("guid64", () => {
  it("should generate string with valid base91 characters", () => {
    const validChars = /^[a-zA-Z0-9!#$%&()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/u;
    const result = guid64();
    expect(result).toMatch(validChars);
  });

  it("should always generate strings of max. 10 characters", () => {
    const results = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const result = guid64();
      results.add(result.length);
      expect(result.length).toBeLessThanOrEqual(10);
    }
  });

  it("should generate different values on each call", () => {
    const results = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      results.add(guid64());
    }
    // Should generate unique values
    expect(results.size).toBe(1000);
  });

  it("should use crypto.getRandomValues", () => {
    const mockGetRandomValues = vi.spyOn(crypto, "getRandomValues");
    guid64();
    expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(mockGetRandomValues).toHaveBeenCalledTimes(1);
    mockGetRandomValues.mockRestore();
  });

  it("should handle maximum uint64 value", () => {
    const mockGetRandomValues = vi.spyOn(crypto, "getRandomValues");
    mockGetRandomValues.mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) {
        array.set(new Uint8Array(8).fill(255)); // All bits set to 1
      }
      return array;
    });
    const result = guid64();
    expect(result).toBe("Rj&Z5m[>Zp");
    mockGetRandomValues.mockRestore();
  });

  it("should encode known values correctly", () => {
    const mockGetRandomValues = vi.spyOn(crypto, "getRandomValues");

    const testCases: [Uint8Array, string, string][] = [
      [new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), "a", "zero"],
      [new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), "b", "one"],
      [new Uint8Array([0, 0, 0, 0, 0, 0, 0, 2]), "c", "two"],
      [new Uint8Array([0, 0, 0, 0, 0, 0, 0, 90]), "~", "last"],
      [new Uint8Array([0, 0, 0, 0, 0, 0, 0, 91]), "ba", "first overflow"],
      [new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]), "Rj&Z5m[>Zp", "max uint64"],
    ];

    for (const [input, expected, description] of testCases) {
      mockGetRandomValues.mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) {
          array.set(input);
        }
        return array;
      });
      const result = guid64();
      expect(result, `Failed for case: ${description}`).toBe(expected);
    }

    mockGetRandomValues.mockRestore();
  });
});

describe("generateUuid", () => {
  it("should generate a valid UUID", () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  });

  it("should generate unique UUIDs on multiple rapid calls", () => {
    const uuids = new Set();
    for (let i = 0; i < 1000; i++) {
      uuids.add(generateUuid());
    }
    expect(uuids.size).toBe(1000);
  });
});

describe("extractTimestampFromUUIDv7", () => {
  it("should extract the timestamp correctly", () => {
    const uuid = generateUuid();
    const timestampFromUuid = extractTimestampFromUuid(uuid);
    const currentTimestamp = Date.now();

    // Allow for a 100ms difference
    expect(timestampFromUuid).toBeGreaterThanOrEqual(currentTimestamp - 100);
    expect(timestampFromUuid).toBeLessThanOrEqual(currentTimestamp + 100);
  });
});

describe("generateUniqueIdFromUuid", () => {
  it("should generate consistent IDs for the same UUID", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const id1 = generateUniqueIdFromUuid(uuid);
    const id2 = generateUniqueIdFromUuid(uuid);
    expect(id1).toBe(id2);
  });

  it("should generate different IDs for different UUIDs", () => {
    const uuid1 = "123e4567-e89b-12d3-a456-426614174000";
    const uuid2 = "987fcdeb-51a2-43d6-b123-456789abcdef";
    const id1 = generateUniqueIdFromUuid(uuid1);
    const id2 = generateUniqueIdFromUuid(uuid2);
    expect(id1).not.toBe(id2);
  });

  it("should always return positive numbers", () => {
    const uuids = [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "123e4567-e89b-12d3-a456-426614174000",
      "deadbeef-dead-beef-dead-beefdeadbeef",
    ];

    for (const uuid of uuids) {
      const id = generateUniqueIdFromUuid(uuid);
      expect(id).toBeGreaterThanOrEqual(0);
    }
  });

  it("should handle edge case UUIDs correctly", () => {
    // Test with empty UUID (edge case that shouldn't normally happen)
    const emptyId = generateUniqueIdFromUuid("");
    expect(emptyId).toBe(0);

    // Test with UUID without hyphens (function should handle this)
    const noHyphens = "123e4567e89b12d3a456426614174000";
    const withHyphens = "123e4567-e89b-12d3-a456-426614174000";
    const id1 = generateUniqueIdFromUuid(noHyphens);
    const id2 = generateUniqueIdFromUuid(withHyphens);
    expect(id1).toBe(id2);
  });

  it("should return numbers that fit in 32-bit signed integer range", () => {
    const uuid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const id = generateUniqueIdFromUuid(uuid);
    expect(id).toBeLessThanOrEqual(2_147_483_647); // Max 32-bit signed int
    expect(id).toBeGreaterThanOrEqual(0);
  });
});

describe("createSelectiveZip archiver warning handling", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "zip-test-"));
    testFile = path.join(tempDir, "test.txt");
    await fs.promises.writeFile(testFile, "test content");
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { force: true, recursive: true });
  });

  it("should handle archiver ENOENT warning", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // Mock implementation to capture warning calls
    });

    const outputPath = path.join(tempDir, "test.zip");
    const nonExistentFile = path.join(tempDir, "nonexistent.txt");

    try {
      await createSelectiveZip(outputPath, [{ compress: true, path: nonExistentFile }]);
    } catch {
      // Expected to fail, but we want to test the warning handling
    }

    consoleSpy.mockRestore();
  });

  it("should cleanup output stream on error", async () => {
    // Create an invalid output path to trigger stream error
    // Use a Windows-compatible invalid path
    const invalidOutputPath =
      process.platform === "win32"
        ? String.raw`Z:\nonexistent\path\test.zip` // Invalid drive on Windows
        : "/root/cannot-write-here/test.zip"; // Invalid path on Unix

    // Verify error is thrown - this tests the error cleanup path
    await expect(
      createSelectiveZip(invalidOutputPath, [{ compress: true, path: testFile }]),
    ).rejects.toBeDefined();
  });

  it("should cleanup output stream when archive finalize fails", async () => {
    // Create a directory with the same name as our intended output file
    // This will cause createWriteStream to fail immediately
    const outputPath = path.join(tempDir, "conflict.zip");
    await fs.promises.mkdir(outputPath); // Create directory with same name as output file

    // WARNING: The archiver library creates internal promises during cleanup
    // that become unhandled rejections after our code properly catches the main error.
    // We need to catch these internal archiver cleanup rejections to prevent test failures.
    // This is a timing issue where archiver's internal lstat() fails during cleanup after
    // our error handling has already completed successfully.
    // Implementation taken from https://github.com/vitest-dev/vitest/pull/6016
    const fn = vi.fn();

    const promise = new Promise<void>((resolve) => {
      process.on("unhandledRejection", () => {
        fn();
        resolve();
      });
    });

    // Expect the function to reject due to file/directory conflict
    await expect(
      createSelectiveZip(outputPath, [{ compress: true, path: testFile }]),
    ).rejects.toThrow();

    // This tests the cleanup in the catch block
    await promise;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("generateUnixTimeInMilliseconds", () => {
  it("should return current time in milliseconds", () => {
    const before = Date.now();
    const result = generateUnixTimeInMilliseconds();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
    expect(typeof result).toBe("number");
  });
});

describe("generateUnixTimeInSeconds", () => {
  it("should return current time in seconds", () => {
    const beforeMs = Date.now();
    const beforeSec = Math.floor(beforeMs / 1000);
    const result = generateUnixTimeInSeconds();
    const afterMs = Date.now();
    const afterSec = Math.floor(afterMs / 1000);

    expect(result).toBeGreaterThanOrEqual(beforeSec);
    expect(result).toBeLessThanOrEqual(afterSec);
    expect(typeof result).toBe("number");
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("should replace invalid characters with underscores", () => {
    const result = sanitizeFilename("test*file<name>?.txt");
    expect(result).toBe("test_file_name__.txt");
  });

  it("should preserve valid characters", () => {
    const result = sanitizeFilename("valid-file.name123.txt");
    expect(result).toBe("valid-file.name123.txt");
  });
});

describe("omitFields", () => {
  it("should omit specified fields from object", () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = omitFields(obj, "b", "d");

    expect(result).toEqual({ a: 1, c: 3 });
    expect("b" in result).toBe(false);
    expect("d" in result).toBe(false);
  });

  it("should return original object when no keys specified", () => {
    const obj = { a: 1, b: 2 };
    const result = omitFields(obj);

    expect(result).toEqual({ a: 1, b: 2 });
  });
});

describe("serializeWithBigInts", () => {
  it("should serialize regular objects without BigInt", () => {
    const obj = { active: true, count: 42, name: "test" };
    const result = serializeWithBigInts(obj);

    expect(result).toBe('{"active":true,"count":42,"name":"test"}');
  });

  it("should serialize BigInt values as unquoted numbers", () => {
    const obj = { id: 123_456_789n, name: "test" };
    const result = serializeWithBigInts(obj);

    expect(result).toBe('{"id":123456789,"name":"test"}');
  });

  it("should handle really large BigInt numbers", () => {
    const largeNumber = 18_446_744_073_709_551_615n; // 2^64 - 1
    const veryLargeNumber = 340_282_366_920_938_463_463_374_607_431_768_211_455n; // 2^128 - 1

    const obj = {
      large: largeNumber,
      regular: 42,
      veryLarge: veryLargeNumber,
    };

    const result = serializeWithBigInts(obj);
    expect(result).toBe(
      '{"large":18446744073709551615,"regular":42,"veryLarge":340282366920938463463374607431768211455}',
    );
  });

  it("should handle nested objects with BigInt values", () => {
    const obj = {
      metadata: {
        version: 1n,
      },
      user: {
        id: 9_007_199_254_740_992n, // Beyond MAX_SAFE_INTEGER
        profile: {
          score: 100,
          timestamp: 1_699_123_456_789n,
        },
      },
    };

    const result = serializeWithBigInts(obj);
    const expected =
      '{"metadata":{"version":1},"user":{"id":9007199254740992,"profile":{"score":100,"timestamp":1699123456789}}}';
    expect(result).toBe(expected);
  });

  it("should handle arrays with BigInt values", () => {
    const obj = {
      ids: [1n, 2n, 9_007_199_254_740_992n],
      names: ["a", "b", "c"],
    };

    const result = serializeWithBigInts(obj);
    expect(result).toBe('{"ids":[1,2,9007199254740992],"names":["a","b","c"]}');
  });

  it("should handle mixed data types including null and undefined", () => {
    const obj = {
      bigIntValue: 123n,
      booleanValue: true,
      nullValue: null,
      numberValue: 42,
      stringValue: "test",
      undefinedValue: undefined,
    };

    const result = serializeWithBigInts(obj);
    expect(result).toBe(
      '{"bigIntValue":123,"booleanValue":true,"nullValue":null,"numberValue":42,"stringValue":"test"}',
    );
  });

  it("should format with indentation when space parameter is provided", () => {
    const obj = { id: 123n, name: "test" };
    const result = serializeWithBigInts(obj, 2);

    const expected = `{
  "id": 123,
  "name": "test"
}`;
    expect(result).toBe(expected);
  });

  it("should emit negative BigInt values as bare numbers", () => {
    const obj = { id: -8_113_853_199_325_282_904n, name: "test" };
    const result = serializeWithBigInts(obj);

    expect(result).toBe('{"id":-8113853199325282904,"name":"test"}');
  });

  it("should not corrupt a string value that collides with the BigInt marker", () => {
    // A genuine string value literally equal to the default marker pattern must
    // survive unchanged (audit S4): a nonce marker is chosen to avoid collision.
    const obj = { id: 123n, note: "__BIGINT__123__BIGINT__" };
    const result = serializeWithBigInts(obj);

    const parsed = JSON.parse(result) as { id: number; note: unknown };
    expect(parsed.note).toBe("__BIGINT__123__BIGINT__");
    expect(parsed.id).toBe(123);
  });
});

describe("parseJsonWithBigInts", () => {
  it("should convert 64-bit ids in a models-shaped dict to exact BigInt values", () => {
    // Shape mirrors col.models: keyed by note-type id, template/field ids are
    // random 64-bit values beyond Number.MAX_SAFE_INTEGER.
    const modelsJson =
      '{"1650000001000":{"id":1650000001000,"name":"Vocab",' +
      '"tmpls":[{"id":6134417914424963362,"name":"Card 1","ord":0}],' +
      '"flds":[{"id":-8113853199325282904,"name":"Front","ord":0},{"id":77,"name":"2024","ord":1}]}}';

    const parsed = parseJsonWithBigInts(modelsJson) as Record<
      string,
      {
        id: unknown;
        tmpls: { id: unknown }[];
        flds: { id: unknown; name: unknown }[];
      }
    >;
    const model = parsed["1650000001000"];
    if (!model) {
      throw new Error("model missing");
    }

    // Unsafe 64-bit ids become exact BigInt values (both signs).
    expect(model.tmpls[0]?.id).toBe(6_134_417_914_424_963_362n);
    expect(model.flds[0]?.id).toBe(-8_113_853_199_325_282_904n);

    // Safe integers stay as numbers.
    expect(model.id).toBe(1_650_000_001_000);
    expect(model.flds[1]?.id).toBe(77);

    // Digit-only STRING values are never coerced — the field named "2024"
    // stays a string (audit F7).
    expect(model.flds[1]?.name).toBe("2024");
    expect(typeof model.flds[1]?.name).toBe("string");
  });

  it("should preserve very large integers beyond MAX_SAFE_INTEGER", () => {
    const jsonString = '{"largeId":9007199254740993,"regular":42}';
    const result = parseJsonWithBigInts(jsonString) as { largeId: unknown; regular: unknown };

    expect(result.largeId).toBe(9_007_199_254_740_993n);
    expect(result.regular).toBe(42);
  });

  it("should leave safe integers, floats, and booleans unchanged", () => {
    const jsonString = '{"id":123,"ratio":1.5,"flag":true,"nothing":null}';
    const result = parseJsonWithBigInts(jsonString);

    expect(result).toEqual({
      id: 123,
      ratio: 1.5,
      flag: true,
      nothing: null,
    });
  });

  it("should never touch string values, even digit-only ones", () => {
    const jsonString = '{"name":"007","year":"2024","code":"ABC123"}';
    const result = parseJsonWithBigInts(jsonString);

    expect(result).toEqual({
      name: "007",
      year: "2024",
      code: "ABC123",
    });
  });

  it("should not convert exponent literals whose source is not a plain integer", () => {
    // Number.isSafeInteger(1e21) is false, but BigInt("1e21") throws — the
    // /^-?\d+$/ source guard keeps such literals as numbers.
    const jsonString = '{"value":1e21}';
    const result = parseJsonWithBigInts(jsonString) as { value: unknown };

    expect(typeof result.value).toBe("number");
    expect(result.value).toBe(1e21);
  });

  it("should round-trip through serializeWithBigInts without precision loss", () => {
    const original = {
      id: 6_134_417_914_424_963_362n,
      negative: -8_113_853_199_325_282_904n,
      small: 42,
      name: "test",
    };

    const serialized = serializeWithBigInts(original);
    const parsed = parseJsonWithBigInts(serialized);

    expect(parsed).toEqual(original);
  });
});

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("front<br>HTML")).toBe("frontHTML");
    expect(stripHtml("<b>Hello</b> <i>world</i>")).toBe("Hello world");
  });

  it("removes style and script bodies", () => {
    expect(stripHtml("a<style>.x{color:red}</style>b")).toBe("ab");
    expect(stripHtml("a<script>alert(1)</script>b")).toBe("ab");
  });

  it("leaves plain text untouched", () => {
    expect(stripHtml("no markup here")).toBe("no markup here");
  });
});

describe("fieldChecksum", () => {
  it("matches Anki's algorithm (first 8 hex digits of SHA1 as a 32-bit int)", () => {
    // sha1("test") = a94a8fe5cc... → first 8 hex "a94a8fe5" = 2840236005
    expect(fieldChecksum("test")).toBe(0xa9_4a_8f_e5);
    expect(fieldChecksum("test")).toBe(2_840_236_005);
  });

  it("strips HTML before hashing", () => {
    expect(fieldChecksum("<b>test</b>")).toBe(fieldChecksum("test"));
  });

  it("is content-dependent and non-zero", () => {
    expect(fieldChecksum("a")).not.toBe(fieldChecksum("b"));
    expect(fieldChecksum("anything")).not.toBe(0);
  });
});
