/**
 * In-memory ZIP reading and writing for Anki packages, built on fflate.
 *
 * Only fflate's synchronous APIs are used: its async variants spawn Web
 * Workers from strings, which strict Content-Security-Policy setups (Tauri,
 * Capacitor webviews) reject.
 *
 * fflate does not implement Zip64, so archives over 4 GiB or with more than
 * 65535 entries are not supported (callers surface this limit in their error
 * messages).
 */

import { Zip, ZipDeflate, ZipPassThrough, unzipSync } from "fflate";

export interface ZipOutEntry {
  name: string;
  data: Uint8Array;
  /** Deflate the entry; when false it is stored uncompressed. */
  compress: boolean;
}

/**
 * Reads every entry of a ZIP archive into memory.
 * @param data - The raw bytes of the ZIP archive
 * @returns A map from entry name to entry content
 * @throws {Error} when the data is not a valid ZIP archive (fflate error)
 */
export function readZipEntries(data: Uint8Array): Map<string, Uint8Array> {
  const unzipped = unzipSync(data);
  return new Map(Object.entries(unzipped));
}

/**
 * Assembles a ZIP archive with per-entry control over compression, mirroring
 * Anki's own packaging (database deflated in legacy exports, everything else
 * stored because the payloads are already zstd-compressed).
 *
 * Entries are pushed through fflate's streaming `Zip` one at a time, so peak
 * memory stays around the output size plus a single entry. Accepting an async
 * iterable lets callers materialize each entry lazily (e.g. reading media
 * from disk-backed staging) instead of holding all entry bytes at once.
 * @param entries - The entries to include, in order
 * @returns The bytes of the finished archive
 */
export async function buildZip(
  entries: Iterable<ZipOutEntry> | AsyncIterable<ZipOutEntry>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let failure: Error | undefined;

  // Definite assignment: the Promise executor runs synchronously.
  let markDone!: () => void;
  const done = new Promise<void>((resolve) => {
    markDone = resolve;
  });

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure ??= error;
      markDone();
      return;
    }
    chunks.push(chunk);
    totalLength += chunk.length;
    if (final) {
      markDone();
    }
  });

  try {
    for await (const entry of entries) {
      if (failure !== undefined) {
        break;
      }
      const file = entry.compress ? new ZipDeflate(entry.name) : new ZipPassThrough(entry.name);
      zip.add(file);
      file.push(entry.data, true);
    }
    zip.end();
  } catch (error) {
    failure ??= error instanceof Error ? error : new Error(String(error));
    markDone();
  }

  await done;
  if (failure !== undefined) {
    throw new Error(`ZIP assembly failed: ${failure.message}`, { cause: failure });
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
