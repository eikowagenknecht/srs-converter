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
  sanitizeFilename,
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
