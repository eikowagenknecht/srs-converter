import fs from "node:fs";
import path from "node:path";
import archiver, { type ZipEntryData } from "archiver";
import { v7 as uuidv7 } from "uuid";

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
 * @throws Error if file operations fail or archive creation encounters errors
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
  // Phase 1: Validation - Make sure target fields contain only numeric values
  validateTargetFieldsAreNumeric(jsonString, bigintFieldPaths);

  // Phase 2: Preprocessing - Quote all numeric values to prevent precision
  // loss
  let preprocessedJson = jsonString;

  // For each target path, find and quote the numbers to preserve precision
  // Uses field name matching (not precise path matching) for efficiency
  for (const path of bigintFieldPaths) {
    preprocessedJson = quoteNumbersAtPath(preprocessedJson, path);
  }

  // Parse the preprocessed JSON (target numbers are now strings)
  const parsed = JSON.parse(preprocessedJson) as unknown;

  // Phase 3: Processing - Recursively traverse and selectively convert to BigInt
  // Converts quoted numeric strings back to regular numbers for non-target paths
  return processValue(parsed, "", bigintFieldPaths);
}

/**
 * Validates that target fields contain only unquoted numeric values.
 *
 * This function ensures data integrity by rejecting JSON where target fields
 * contain any non-numeric values (strings, booleans, null, etc.), which might indicate:
 * - Upstream processing errors
 * - Data corruption
 * - Incorrect serialization
 * - Wrong data types
 * @param jsonString - The JSON string to validate
 * @param bigintFieldPaths - Array of field paths that should contain numeric values
 * @throws {Error} When target fields contain any non-numeric values
 */
function validateTargetFieldsAreNumeric(
  jsonString: string,
  bigintFieldPaths: string[],
): void {
  for (const path of bigintFieldPaths) {
    const normalizedPath = path.replace(/\[\]/g, "");
    const pathParts = normalizedPath.split(".");
    const lastField = pathParts[pathParts.length - 1];

    if (!lastField) continue;

    // Check for ANY non-numeric values in target fields
    // Pattern matches: "fieldName": <any-non-numeric-value>
    const fieldPattern = new RegExp(`"${lastField}"\\s*:\\s*([^,}\\]]+)`, "g");
    const matches = [...jsonString.matchAll(fieldPattern)];

    for (const match of matches) {
      const value = match[1]?.trim();
      if (!value) continue;

      // Check if it's a valid unquoted number
      if (!/^\d+$/.test(value)) {
        throw new Error(
          `Field '${lastField}' (from path '${path}') contains non-numeric value ${value}. Expected unquoted numeric value.`,
        );
      }
    }
  }
}

/**
 * Quotes numeric values for fields matching the last segment of a path to prevent precision loss.
 *
 * This function performs string preprocessing on JSON to quote large numbers before JSON.parse(),
 * which prevents JavaScript from losing precision on numbers larger than MAX_SAFE_INTEGER.
 *
 * **How it works:**
 * - Extracts the final field name from the path (e.g., "id" from "user.profile.id")
 * - Uses regex to find ALL occurrences of that field name with numeric values
 * - Converts unquoted numbers to quoted strings (e.g., "id":123 -> "id":"123")
 *
 * **Supported Path Formats:**
 * - Simple fields: `"id"`, `"timestamp"`
 * - Nested fields: `"user.id"`, `"profile.settings.version"`
 * - Array fields: `"users[].id"`, `"departments[].employees[].managerId"`
 * - Deep nesting: `"level1.level2.level3.fieldName"`
 *
 * **Important Limitations:**
 * 1. **Field Name Collision**: Quotes ALL fields with the same name as the target field.
 * - Path `"user.id"` will quote ALL `id` fields in the JSON, not just `user.id`
 * - This is acceptable because the later `processValue` function provides precise path targeting
 *
 * 2. **Regex-Based Approach**: Uses simple regex matching, not a full JSON parser
 * - Works well for standard JSON formatting
 * - May not handle extremely malformed or unusual JSON structures
 *
 * 3. **Array Notation**: `[]` is stripped and ignored during preprocessing
 * - `"users[].id"` becomes `"users.id"` for field name extraction
 * - Array processing happens later in the `processValue` phase
 *
 * **When This Approach Works:**
 * - Standard JSON formatting with consistent spacing
 * - Numeric values that need precision preservation
 * - Field names that don't contain special regex characters
 *
 * **When This Approach May Not Work:**
 * - JSON with irregular formatting or embedded quotes in field names
 * - Field names containing regex special characters (., *, +, ?, etc.)
 * - Non-standard JSON structures or heavily nested dynamic keys
 *
 * **Example Transformations:**
 * ```
 * Input:  {"id":9007199254740993,"user":{"id":123}}
 * Path:   "user.id"
 * Result: {"id":"9007199254740993","user":{"id":"123"}}
 * Note:   Both "id" fields are quoted (field name collision)
 * ```
 * @param jsonString - The JSON string to process
 * @param path - The field path (e.g., "user.id", "items[].price")
 * @returns The JSON string with numeric values quoted for the target field name
 */
function quoteNumbersAtPath(jsonString: string, path: string): string {
  // Normalize path by removing array notation - we only need the final field name
  const normalizedPath = path.replace(/\[\]/g, "");
  const pathParts = normalizedPath.split(".");
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
 * Recursively processes parsed JSON values with path-aware BigInt conversion.
 *
 * This function traverses the object structure while maintaining the current path context,
 * enabling precise targeting of which fields should become BigInt values.
 * @param value - The current value being processed
 * @param currentPath - The current path in dot notation (e.g., "user.profile.id")
 * @param targetPaths - Array of paths that should be converted to BigInt
 * @returns The processed value with appropriate type conversions applied
 */
function processValue(
  value: unknown,
  currentPath: string,
  targetPaths: string[],
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Check for string values that should be converted to BigInt (quoted numbers)
  if (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    shouldConvertToBigInt(currentPath, targetPaths)
  ) {
    return BigInt(value);
  }

  // Convert quoted numeric strings back to regular numbers if they're NOT target paths
  if (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    !shouldConvertToBigInt(currentPath, targetPaths)
  ) {
    return Number(value);
  }

  // Also handle regular numbers (for cases where precision wasn't lost)
  if (
    typeof value === "number" &&
    shouldConvertToBigInt(currentPath, targetPaths)
  ) {
    return BigInt(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      // For arrays, we process each item with the current path context
      return processValue(item, currentPath, targetPaths);
    });
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      const processedValue = processValue(val, newPath, targetPaths);
      result[key] = processedValue;
    }
    return result;
  }

  return value;
}

/**
 * Determines whether a value at the current path should be converted to BigInt.
 * @param currentPath - The current path in dot notation
 * @param targetPaths - Array of target paths that should become BigInt
 * @returns True if the current path matches any target path
 */
function shouldConvertToBigInt(
  currentPath: string,
  targetPaths: string[],
): boolean {
  return targetPaths.some((targetPath) => pathMatches(currentPath, targetPath));
}

/**
 * Checks if the current path matches a target path, handling array notation.
 *
 * Array notation `[]` in paths is treated as a wildcard that matches any array processing.
 * Both paths are normalized by removing `[]` before comparison.
 * @param currentPath - The current path being processed
 * @param targetPath - The target path to match against
 * @returns True if paths match after normalization
 */
function pathMatches(currentPath: string, targetPath: string): boolean {
  // Handle array notation by normalizing both paths
  const normalizedCurrent = normalizePathForMatching(currentPath);
  const normalizedTarget = normalizePathForMatching(targetPath);

  return normalizedCurrent === normalizedTarget;
}

/**
 * Normalizes a path for matching by removing array notation.
 *
 * Converts paths like "users[].profile.id" to "users.profile.id" since
 * array processing is handled uniformly for all items in an array.
 * @param path - The path to normalize
 * @returns The normalized path with array notation removed
 */
function normalizePathForMatching(path: string): string {
  // Convert array notation like "users[]" to just "users" for matching
  // Since we process all array items uniformly
  return path.replace(/\[\]/g, "");
}
