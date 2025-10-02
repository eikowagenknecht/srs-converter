import fs from "node:fs";
import path from "node:path";
import archiver, { type ZipEntryData } from "archiver";
import { v7 as uuidv7 } from "uuid";

const NUMERIC_STRING_PATTERN = /^\d+$/;

/**
 * Converts a number to a base91 string representation.
 * @param num - The number to convert
 * @returns The encoded string
 */
function base91(num: bigint): string {
  const encodingTable =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";

  if (num === 0n) {
    // Return first char for 0
    return encodingTable.charAt(0);
  }

  let currentNum = num;
  let buf = "";

  while (currentNum) {
    const mod = currentNum % BigInt(encodingTable.length);
    currentNum = currentNum / BigInt(encodingTable.length);
    const char = encodingTable.charAt(Number(mod));
    buf = char + buf;
  }

  return buf;
}

/**
 * Generates a base91-encoded 64-bit random number
 * @returns A base91 encoded string representing a random 64-bit number
 */
export function guid64(): string {
  return base91(getRandomInt());
}

/**
 * Gets a random 64-bit integer (0 to 2^64 - 1)
 * @returns A random 64-bit integer
 */
function getRandomInt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const bytesAsBigInt = new DataView(bytes.buffer).getBigUint64(0, false);
  return bytesAsBigInt;
}

export function generateUnixTimeInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function generateUnixTimeInMilliseconds(): number {
  return Date.now();
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9.-]/gi, "_");
}

export function omitFields<T extends object, K extends keyof T>(
  obj: T,
  ...keys: K[]
): Omit<T, K> {
  const result = Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
  return result;
}

export function generateUuid(): `${string}-${string}-${string}-${string}-${string}` {
  const uuid = uuidv7() as `${string}-${string}-${string}-${string}-${string}`;
  return uuid;
}

/**
 * Extracts the timestamp from a UUID v7 in milliseconds.
 *
 * The UUID is expected to be in the format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where the first 48 bits represent the timestamp.
 *
 * Warning: For UUIDs generated in the same millisecond, the result will not be unique.
 * @param uuid - The UUID string
 * @returns The timestamp in milliseconds
 */
export function extractTimestampFromUuid(uuid: string): number {
  // Remove hyphens and convert to binary
  const hex = uuid.replace(/-/g, "");

  // Extract the timestamp portion (first 48 bits)
  const timestampHex = hex.slice(0, 12);
  const timestampMs = Number.parseInt(timestampHex, 16);
  return timestampMs;
}

/**
 * Generates a unique ID from a UUID using a hash function.
 * This makes sure that even UUIDs generated in the same millisecond are unique.
 * @param uuid - The UUID string
 * @returns A unique integer derived from the UUID
 */
export function generateUniqueIdFromUuid(uuid: string): number {
  let hash = 0;
  const str = uuid.replace(/-/g, ""); // Remove hyphens

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Ensure positive number and reasonable size for Anki
  return Math.abs(hash);
}

interface FileConfig {
  path: string;
  compress: boolean;
}

/**
 * Creates a ZIP file with selective compression for individual files.
 *
 * Allows fine-grained control over compression on a per-file basis.
 * @param outputPath - Path where the ZIP file should be created (parent directories will be created if needed)
 * @param files - Array of file configurations, each specifying the file path and whether to compress it
 * @returns Promise that resolves when ZIP creation is complete
 * @throws {Error} if file operations fail or archive creation encounters errors
 */
export async function createSelectiveZip(
  outputPath: string,
  files: FileConfig[],
): Promise<void> {
  // Create the output directory if it doesn't exist
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip");

  // Set up event handling using a separate promise
  const closePromise = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject); // Catch output stream errors
    archive.on("error", reject);
    archive.on("warning", (err: archiver.ArchiverError) => {
      if (err.code === "ENOENT") {
        console.warn("Warning:", err);
      } else {
        reject(err);
      }
    });
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add each file with appropriate compression
  for (const file of files) {
    const filename = path.basename(file.path);
    const opts: ZipEntryData = {
      name: filename,
      store: !file.compress,
    };
    archive.file(file.path, opts);
  }

  try {
    // Finalize the archive and wait for completion
    await archive.finalize();
    await closePromise;

    // console.log(`ZIP created successfully: ${archive.pointer()} total bytes`);
  } catch (error) {
    // Clean up the output stream if there's an error
    output.destroy();
    throw error; // Re-throw the error for handling by the caller
  }
}

export function joinAnkiFields(fields: string[]): string {
  return fields.join("\u001f");
}

export function splitAnkiFields(fieldString: string): string[] {
  return fieldString.split("\u001f");
}

/**
 * Serializes an object to JSON with BigInt values converted to unquoted numbers.
 *
 * This makes sure that no precision is lost when storing BigInt values.
 *
 * Warning: The JSON spec does not specify the precision with which numbers are
 * stored. Not all parsers (including JSON.parse()) handle large numbers correctly.
 * This may lead to data loss!
 * @param obj - The object to serialize (can contain BigInt values)
 * @param space - Optional formatting parameter (same as JSON.stringify space parameter)
 * @returns JSON string with BigInt values as unquoted numbers
 * @example
 * const data = { id: 123n, balance: 9007199254740993n };
 * const json = serializeWithBigInts(data);
 * // Result: '{"id":123,"balance":9007199254740993}'
 */
export function serializeWithBigInts(
  obj: unknown,
  space?: string | number,
): string {
  return JSON.stringify(
    obj,
    (_key, value: unknown) =>
      typeof value === "bigint"
        ? `__BIGINT__${String(value)}__BIGINT__`
        : value,
    space,
  ).replace(/"__BIGINT__(\d+)__BIGINT__"/g, "$1");
}

/**
 * Parses JSON with selective BigInt conversion based on field paths.
 *
 * This function solves the problem of JavaScript losing precision when parsing
 * large numbers from JSON.
 *
 * To specify which fields should be parsed as BigInt, provide a list of field
 * paths. Paths support nesting and arrays and are case sensitive.
 *
 * **Supported Path Formats:**
 * - Simple: `"id"`, `"timestamp"`, `"version"`
 * - Nested: `"user.id"`, `"profile.settings.apiKey"`
 * - Arrays: `"users[].id"`, `"posts[].comments[].authorId"`
 * - Complex: `"data.records[].metadata.timestamps[].value"`
 * @param jsonString - The JSON string to parse
 * @param bigintFieldPaths - Array of field paths that should become BigInt values
 * @returns Parsed object with selective BigInt conversion applied
 * @throws {SyntaxError} When jsonString is not valid JSON
 * @throws {Error} When target fields contain non-numeric values (strings, booleans, null, etc.)
 * @example
 * // Basic usage
 * const result = parseWithBigInts('{"balance":999999999999999}', ["balance"]);
 * @example
 * // Complex nested structure
 * const json = '{"users":[{"profile":{"id":123,"timestamp":1699123456789}}]}';
 * const result = parseWithBigInts(json, ["users[].profile.timestamp"]);
 * @example
 * // Multiple fields
 * const json = '{"id":100,"user":{"id":9007199254740993},"users":[{"id":200}]}';
 * const result = parseWithBigInts(json, ["user.id", "users[].id"]);
 * // Result
 * // {
 * //   id: 100,                    // Regular number (not targeted)
 * //   user: { id: 123n },         // BigInt (targeted by "user.id")
 * //   users: [{ id: 456n }]       // BigInt (targeted by "users[].id")
 * // }
 */
export function parseWithBigInts(
  jsonString: string,
  bigintFieldPaths: string[],
): unknown {
  // Phase 1: Validation - Parse JSON and validate target fields are numeric
  const parsedForValidation = JSON.parse(jsonString) as unknown;
  validateTargetFieldsAreNumeric(parsedForValidation, bigintFieldPaths);

  // Phase 2: Preprocessing - Quote numeric values based on field names to prevent precision loss
  let preprocessedJson = jsonString;
  for (const path of bigintFieldPaths) {
    preprocessedJson = quoteNumbersForFieldName(preprocessedJson, path);
  }

  // Phase 3: Processing - Parse and convert only target paths to BigInt using precise matching
  const parsed = JSON.parse(preprocessedJson) as unknown;
  return processValueWithPrecisePaths(parsed, "", bigintFieldPaths);
}

/**
 * Validates that target fields contain only numeric values.
 *
 * This function ensures data integrity by rejecting values where target fields
 * contain any non-numeric values (strings, booleans, null, etc.), which might indicate:
 * - Upstream processing errors
 * - Data corruption
 * - Incorrect serialization
 * - Wrong data types
 * @param parsedValue - The parsed JSON object to validate
 * @param targetPaths - Array of field paths that should contain numeric values (may include [] notation)
 * @throws {Error} When target fields contain any non-numeric values
 */
function validateTargetFieldsAreNumeric(
  parsedValue: unknown,
  targetPaths: string[],
): void {
  for (const path of targetPaths) {
    const values = getValuesAtPath(parsedValue, path);
    for (const value of values) {
      if (typeof value !== "number") {
        const pathParts = path.replace(/\[\]/g, "").split(".");
        const fieldName = pathParts[pathParts.length - 1] ?? "unknown";
        const valueStr =
          typeof value === "string" ? `"${value}"` : String(value);
        throw new Error(
          `Field '${fieldName}' (from path '${path}') contains non-numeric value ${valueStr}. Expected unquoted numeric value.`,
        );
      }
    }
  }
}

/**
 * Gets all values at a specific path in an object, handling arrays with [] notation.
 * @param obj - The object to traverse
 * @param path - The path to get values from (may include [] notation like "users[].id")
 * @returns Array of values found at the path
 */
function getValuesAtPath(obj: unknown, path: string): unknown[] {
  const results: unknown[] = [];

  function traverse(current: unknown, pathParts: string[]) {
    if (pathParts.length === 0) {
      results.push(current);
      return;
    }

    const [currentPart, ...remainingParts] = pathParts;
    if (!currentPart) return;

    // Check if this part indicates array traversal
    if (currentPart.endsWith("[]")) {
      const fieldName = currentPart.slice(0, -2); // Remove "[]"
      if (current && typeof current === "object" && !Array.isArray(current)) {
        const arrayValue = (current as Record<string, unknown>)[fieldName];
        if (Array.isArray(arrayValue)) {
          // Traverse each array item with remaining path
          for (const item of arrayValue) {
            traverse(item, remainingParts);
          }
        }
      }
    } else {
      // Regular field access
      if (current && typeof current === "object" && !Array.isArray(current)) {
        const value = (current as Record<string, unknown>)[currentPart];
        if (value !== undefined) {
          traverse(value, remainingParts);
        }
      }
    }
  }

  const pathParts = path.split(".");
  traverse(obj, pathParts);
  return results;
}

/**
 * Quotes unquoted integer values for a specific field name to prevent precision loss.
 *
 * This uses field name matching (not precise path matching) for simplicity in phase 2.
 * Precise targeting happens in phase 3 where non-target paths are unquoted back to numbers.
 *
 * **What gets quoted:**
 * - `"id": 123` → `"id": "123"` (unquoted integers)
 * - `"id": 999999999999999` → `"id": "999999999999999"` (large integers)
 *
 * **What does NOT get quoted:**
 * - `"id": "hello"` → stays `"id": "hello"` (already quoted strings)
 * - `"id": true` → stays `"id": true` (booleans)
 * - `"id": null` → stays `"id": null` (null values)
 * - `"id": 123.45` → stays `"id": 123.45` (decimal numbers)
 * @param jsonString - The JSON string to process
 * @param path - The field path (e.g., "user.id", "users.id")
 * @returns The JSON string with unquoted integer values quoted for the target field name
 */
function quoteNumbersForFieldName(jsonString: string, path: string): string {
  const pathParts = path.split(".");
  const lastField = pathParts[pathParts.length - 1];

  if (!lastField) {
    return jsonString;
  }

  // Quote all occurrences of this field name with numeric values
  // Pattern matches: "fieldName": 123 -> "fieldName": "123"
  return jsonString.replace(
    new RegExp(`"${lastField}"\\s*:\\s*(\\d+)`, "g"),
    `"${lastField}":"$1"`,
  );
}

/**
 * Recursively processes parsed JSON values with precise path-aware BigInt conversion.
 * @param value - The current value being processed
 * @param currentPath - The current path in dot notation
 * @param targetPaths - Array of target paths that should become BigInt (may include [] notation)
 * @returns The processed value with appropriate type conversions applied
 */
function processValueWithPrecisePaths(
  value: unknown,
  currentPath: string,
  targetPaths: string[],
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Check if current path matches any target path
  const shouldConvert = targetPaths.some(
    (targetPath) => currentPath === targetPath,
  );

  // Check for string values that should be converted to BigInt (quoted numbers)
  if (
    typeof value === "string" &&
    NUMERIC_STRING_PATTERN.test(value) &&
    shouldConvert
  ) {
    return BigInt(value);
  }

  // Convert quoted numeric strings back to regular numbers if they're NOT target paths
  if (
    typeof value === "string" &&
    NUMERIC_STRING_PATTERN.test(value) &&
    !shouldConvert
  ) {
    return Number(value);
  }

  // For arrays, we need to check if any target path wants to traverse this array
  if (Array.isArray(value)) {
    return value.map((item) => {
      const arrayPath = currentPath ? `${currentPath}[]` : "[]";
      return processValueWithPrecisePaths(item, arrayPath, targetPaths);
    });
  }

  // For objects, we need to check if any target path wants to traverse this object
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      const processedValue = processValueWithPrecisePaths(
        val,
        newPath,
        targetPaths,
      );
      result[key] = processedValue;
    }
    return result;
  }

  return value;
}
