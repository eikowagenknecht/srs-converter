import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSelectiveZip,
  extractTimestampFromUuid,
  generateUniqueIdFromUuid,
  generateUnixTimeInMilliseconds,
  generateUnixTimeInSeconds,
  generateUuid,
  guid64,
  omitFields,
  parseWithBigInts,
  sanitizeFilename,
  serializeWithBigInts,
} from "./util";

describe("guid64", () => {
  it("should generate string with valid base91 characters", () => {
    const validChars = /^[a-zA-Z0-9!#$%&()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/;
    const result = guid64();
    expect(result).toMatch(validChars);
  });

  it("should always generate strings of max. 10 characters", () => {
    const results = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const result = guid64();
      results.add(result.length);
      expect(result.length).lessThanOrEqual(10);
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
    mockGetRandomValues.mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) {
          array.set(new Uint8Array(8).fill(255)); // All bits set to 1
        }
        return array;
      },
    );
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
      [
        new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]),
        "Rj&Z5m[>Zp",
        "max uint64",
      ],
    ];

    for (const [input, expected, description] of testCases) {
      mockGetRandomValues.mockImplementation(
        <T extends ArrayBufferView | null>(array: T): T => {
          if (array instanceof Uint8Array) {
            array.set(input);
          }
          return array;
        },
      );
      const result = guid64();
      expect(result, `Failed for case: ${description}`).toBe(expected);
    }

    mockGetRandomValues.mockRestore();
  });
});

describe("generateUuid", () => {
  it("should generate a valid UUID", () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
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
    expect(id).toBeLessThanOrEqual(2147483647); // Max 32-bit signed int
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
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("should handle archiver ENOENT warning", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // Mock implementation to capture warning calls
    });

    const outputPath = path.join(tempDir, "test.zip");
    const nonExistentFile = path.join(tempDir, "nonexistent.txt");

    try {
      await createSelectiveZip(outputPath, [
        { path: nonExistentFile, compress: true },
      ]);
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
        ? "Z:\\nonexistent\\path\\test.zip" // Invalid drive on Windows
        : "/root/cannot-write-here/test.zip"; // Invalid path on Unix

    let error: unknown;
    try {
      await createSelectiveZip(invalidOutputPath, [
        { path: testFile, compress: true },
      ]);
    } catch (err) {
      error = err;
    }

    // Verify error was thrown - this tests the error cleanup path (lines 174-176)
    expect(error).toBeDefined();
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
      createSelectiveZip(outputPath, [{ path: testFile, compress: true }]),
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
    const obj = { name: "test", count: 42, active: true };
    const result = serializeWithBigInts(obj);

    expect(result).toBe('{"name":"test","count":42,"active":true}');
  });

  it("should serialize BigInt values as unquoted numbers", () => {
    const obj = { id: BigInt(123456789), name: "test" };
    const result = serializeWithBigInts(obj);

    expect(result).toBe('{"id":123456789,"name":"test"}');
  });

  it("should handle really large BigInt numbers", () => {
    const largeNumber = BigInt("18446744073709551615"); // 2^64 - 1
    const veryLargeNumber = BigInt("340282366920938463463374607431768211455"); // 2^128 - 1

    const obj = {
      large: largeNumber,
      veryLarge: veryLargeNumber,
      regular: 42,
    };

    const result = serializeWithBigInts(obj);
    expect(result).toBe(
      '{"large":18446744073709551615,"veryLarge":340282366920938463463374607431768211455,"regular":42}',
    );
  });

  it("should handle nested objects with BigInt values", () => {
    const obj = {
      user: {
        id: BigInt(9007199254740992), // Beyond MAX_SAFE_INTEGER
        profile: {
          timestamp: BigInt(1699123456789),
          score: 100,
        },
      },
      metadata: {
        version: BigInt(1),
      },
    };

    const result = serializeWithBigInts(obj);
    const expected =
      '{"user":{"id":9007199254740992,"profile":{"timestamp":1699123456789,"score":100}},"metadata":{"version":1}}';
    expect(result).toBe(expected);
  });

  it("should handle arrays with BigInt values", () => {
    const obj = {
      ids: [BigInt(1), BigInt(2), BigInt(9007199254740992)],
      names: ["a", "b", "c"],
    };

    const result = serializeWithBigInts(obj);
    expect(result).toBe('{"ids":[1,2,9007199254740992],"names":["a","b","c"]}');
  });

  it("should handle mixed data types including null and undefined", () => {
    const obj = {
      bigIntValue: BigInt(123),
      nullValue: null,
      stringValue: "test",
      numberValue: 42,
      booleanValue: true,
      undefinedValue: undefined,
    };

    const result = serializeWithBigInts(obj);
    expect(result).toBe(
      '{"bigIntValue":123,"nullValue":null,"stringValue":"test","numberValue":42,"booleanValue":true}',
    );
  });

  it("should format with indentation when space parameter is provided", () => {
    const obj = { id: BigInt(123), name: "test" };
    const result = serializeWithBigInts(obj, 2);

    const expected = `{
  "id": 123,
  "name": "test"
}`;
    expect(result).toBe(expected);
  });
});

describe("parseWithBigInts", () => {
  it("should parse simple JSON with BigInt field paths", () => {
    const jsonString = '{"id":123456789,"name":"test"}';
    const result = parseWithBigInts(jsonString, ["id"]);

    expect(result).toEqual({
      id: BigInt(123456789),
      name: "test",
    });
  });

  it("should handle really large numbers beyond MAX_SAFE_INTEGER", () => {
    const jsonString =
      '{"largeId":9007199254740993,"veryLargeId":340282366920938463463374607431768211455}';
    const result = parseWithBigInts(jsonString, ["largeId", "veryLargeId"]);

    expect(result).toEqual({
      largeId: BigInt("9007199254740993"),
      veryLargeId: BigInt("340282366920938463463374607431768211455"),
    });
  });

  it("should only convert specified fields to BigInt", () => {
    const jsonString = '{"id":123,"otherId":456,"name":"test"}';
    const result = parseWithBigInts(jsonString, ["id"]);

    expect(result).toEqual({
      id: BigInt(123),
      otherId: 456, // Should remain as number
      name: "test",
    });
  });

  it("should handle nested objects with dot notation field paths", () => {
    const jsonString =
      '{"user":{"id":123456,"profile":{"timestamp":1699123456789}},"metadata":{"version":1}}';
    const result = parseWithBigInts(jsonString, [
      "user.id",
      "user.profile.timestamp",
    ]);

    expect(result).toEqual({
      user: {
        id: BigInt(123456),
        profile: {
          timestamp: BigInt(1699123456789),
        },
      },
      metadata: {
        version: 1, // Should remain as number
      },
    });
  });

  it("should handle arrays with field paths using bracket notation", () => {
    const jsonString =
      '{"users":[{"id":123,"name":"Alice"},{"id":456,"name":"Bob"}],"count":2}';
    const result = parseWithBigInts(jsonString, ["users[].id"]);

    expect(result).toEqual({
      users: [
        { id: BigInt(123), name: "Alice" },
        { id: BigInt(456), name: "Bob" },
      ],
      count: 2, // Should remain as number
    });
  });

  it("should precisely target fields using path context to avoid conflicts", () => {
    const jsonString = '{"id":100,"user":{"id":200},"admin":{"id":300}}';

    // DESIRED BEHAVIOR: Only convert user.id to BigInt, leave other id fields as numbers
    const result = parseWithBigInts(jsonString, ["user.id"]);

    expect(result).toEqual({
      id: 100, // Should remain as number - not targeted by path
      user: {
        id: BigInt(200), // Should be BigInt - specifically targeted by "user.id"
      },
      admin: {
        id: 300, // Should remain as number - not targeted by path
      },
    });
  });

  it("should handle multiple levels of nesting", () => {
    const jsonString = `{
      "level1": {
        "level2": {
          "level3": {
            "id": 123456789,
            "timestamp": 1699123456789
          },
          "otherId": 999
        },
        "id": 111
      },
      "topId": 222
    }`;

    const result = parseWithBigInts(jsonString, [
      "level1.level2.level3.id",
      "level1.level2.level3.timestamp",
    ]);

    expect(result).toEqual({
      level1: {
        level2: {
          level3: {
            id: BigInt(123456789),
            timestamp: BigInt(1699123456789),
          },
          otherId: 999, // Should remain as number
        },
        id: 111, // Should remain as number
      },
      topId: 222, // Should remain as number
    });
  });

  it("should handle complex arrays with nested objects consistently", () => {
    const jsonString = `{
      "records": [
        {"id": 123, "data": {"timestamp": 1699123456789}},
        {"id": 456, "data": {"timestamp": 1699123456790}}
      ],
      "meta": {"totalCount": 2}
    }`;

    const result = parseWithBigInts(jsonString, [
      "records[].id",
      "records[].data.timestamp",
    ]);

    // All matching fields in array should be converted consistently
    expect(result).toEqual({
      records: [
        { id: BigInt(123), data: { timestamp: BigInt(1699123456789) } },
        { id: BigInt(456), data: { timestamp: BigInt(1699123456790) } }, // Should convert ALL instances
      ],
      meta: { totalCount: 2 }, // Should remain as number
    });
  });

  it("should handle edge cases with empty arrays and null values", () => {
    const jsonString = '{"users":[],"admin":null,"id":123}';
    const result = parseWithBigInts(jsonString, ["id"]);

    expect(result).toEqual({
      users: [],
      admin: null,
      id: BigInt(123),
    });
  });

  it("should preserve non-numeric string values", () => {
    const jsonString = '{"id":123,"code":"ABC123","timestamp":1699123456789}';
    const result = parseWithBigInts(jsonString, ["id", "timestamp"]);

    expect(result).toEqual({
      id: BigInt(123),
      code: "ABC123", // Should remain as string
      timestamp: BigInt(1699123456789),
    });
  });

  it("should handle serialization and parsing round-trip", () => {
    const originalData = {
      user: {
        id: BigInt("9007199254740992"),
        profile: {
          timestamp: BigInt("1699123456789"),
          score: 100,
        },
      },
      metadata: {
        version: BigInt(1),
        created: BigInt("1699000000000"),
      },
      tags: ["important", "user-data"],
    };

    const serialized = serializeWithBigInts(originalData);

    // Parse back with appropriate field paths
    const parsed = parseWithBigInts(serialized, [
      "user.id",
      "user.profile.timestamp",
      "metadata.version",
      "metadata.created",
    ]);

    expect(parsed).toEqual(originalData);
  });

  it("should handle multiple fields with same name in different contexts", () => {
    const jsonString = `{
      "id": 100,
      "users": [
        {"id": 200, "profile": {"id": 300}},
        {"id": 400, "profile": {"id": 500}}
      ],
      "admin": {
        "id": 600,
        "settings": {"id": 700}
      }
    }`;

    // Only convert specific paths, not all fields named "id"
    const result = parseWithBigInts(jsonString, [
      "users[].id", // Convert user IDs in array
      "admin.settings.id", // Convert admin settings ID only
    ]);

    expect(result).toEqual({
      id: 100, // Should remain as number
      users: [
        { id: BigInt(200), profile: { id: 300 } }, // Only user.id converted, not profile.id
        { id: BigInt(400), profile: { id: 500 } }, // Only user.id converted, not profile.id
      ],
      admin: {
        id: 600, // Should remain as number
        settings: { id: BigInt(700) }, // Only this specific path converted
      },
    });
  });

  it("should handle deeply nested arrays with precise targeting", () => {
    const jsonString = `{
      "departments": [
        {
          "id": 1,
          "employees": [
            {"id": 100, "managerId": 50},
            {"id": 101, "managerId": 51}
          ]
        },
        {
          "id": 2, 
          "employees": [
            {"id": 200, "managerId": 52},
            {"id": 201, "managerId": 53}
          ]
        }
      ]
    }`;

    // Only convert employee IDs, not department IDs or manager IDs
    const result = parseWithBigInts(jsonString, [
      "departments[].employees[].id",
    ]);

    expect(result).toEqual({
      departments: [
        {
          id: 1, // Should remain as number
          employees: [
            { id: BigInt(100), managerId: 50 }, // Only employee.id converted
            { id: BigInt(101), managerId: 51 }, // Only employee.id converted
          ],
        },
        {
          id: 2, // Should remain as number
          employees: [
            { id: BigInt(200), managerId: 52 }, // Only employee.id converted
            { id: BigInt(201), managerId: 53 }, // Only employee.id converted
          ],
        },
      ],
    });
  });

  it("should reject fields that are already string-quoted numbers", () => {
    const jsonString =
      '{"id":"123","balance":"9007199254740993","name":"test","code":"456"}';

    // Should throw an error when target fields contain pre-quoted numeric strings
    expect(() => parseWithBigInts(jsonString, ["id", "balance"])).toThrow(
      "Field 'id' (from path 'id') contains non-numeric value",
    );
  });

  it("should reject non-numeric string values in target fields", () => {
    const jsonString =
      '{"id":"five","timestamp":"not-a-number","score":100,"message":"hello"}';

    // Should throw an error when target fields contain non-numeric strings
    expect(() => parseWithBigInts(jsonString, ["id", "timestamp"])).toThrow(
      "Field 'id' (from path 'id') contains non-numeric value \"five\". Expected unquoted numeric value.",
    );
  });

  it("should reject boolean values in target fields", () => {
    const jsonString = '{"id":123,"isActive":true,"count":false,"score":456}';

    // Should throw an error when target fields contain boolean values
    expect(() =>
      parseWithBigInts(jsonString, ["id", "isActive", "count"]),
    ).toThrow(
      "Field 'isActive' (from path 'isActive') contains non-numeric value true",
    );
  });

  it("should reject null values in target fields", () => {
    const jsonString = '{"id":123,"userId":null,"score":456}';

    // Should throw an error when target fields contain null values
    expect(() => parseWithBigInts(jsonString, ["userId"])).toThrow(
      "Field 'userId' (from path 'userId') contains non-numeric value null",
    );
  });
});
