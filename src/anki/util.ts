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
 * This ensures uniqueness even for UUIDs generated in the same millisecond.
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
 * Creates a ZIP file with selective compression
 * @param outputPath - Path where the ZIP file should be created
 * @param files - Array of file configurations
 * @returns Promise that resolves when ZIP creation is complete
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
    output.on("error", reject); // Add this to catch output stream errors
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
