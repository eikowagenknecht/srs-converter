/**
 * Real-browser smoke test (ADR-0018): round-trips real .apkg fixtures in
 * Chromium through the full portable path — fflate zip reading/writing, WASM
 * zstd (ADR-0019), in-memory media storage, WebCrypto hashing, and sql.js
 * with browser wasm wiring via configureSqlJs.
 */

import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { expect, test } from "vitest";

import { AnkiPackage, configureSqlJs } from "@/index";

import modernUrl from "../fixtures/anki/corpus/corpus-v3-single-deck.apkg?url";
import legacyUrl from "../fixtures/anki/empty-legacy-2.apkg?url";

configureSqlJs({ locateFile: () => sqlWasmUrl });

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch fixture ${url}: ${response.status.toFixed(0)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

test("round-trips a modern .apkg in the browser", async () => {
  const input = await fetchBytes(modernUrl);

  const read = await AnkiPackage.fromAnkiExport(input);
  expect(read.status).toBe("success");
  expect(read.data).toBeDefined();
  if (!read.data) {
    return;
  }

  const notes = read.data.getNotes().length;
  const media = read.data.listMediaFiles();
  expect(notes).toBeGreaterThan(0);
  expect(media.length).toBeGreaterThan(0);

  // Write (WASM zstd compress) and read back (WASM zstd decompress).
  const output = await read.data.toAnkiExport();
  const reread = await AnkiPackage.fromAnkiExport(output);
  expect(reread.status).toBe("success");
  expect(reread.data?.getNotes().length).toBe(notes);
  expect(reread.data?.listMediaFiles()).toEqual(media);

  // Media content survives byte-for-byte.
  const filename = media[0];
  if (filename !== undefined && reread.data) {
    expect(await reread.data.getMediaFile(filename)).toEqual(
      await read.data.getMediaFile(filename),
    );
  }

  await read.data.cleanup();
  await reread.data?.cleanup();
});

test("round-trips a legacy .apkg in the browser", async () => {
  const input = await fetchBytes(legacyUrl);

  const read = await AnkiPackage.fromAnkiExport(input);
  expect(read.status).toBe("success");
  expect(read.data).toBeDefined();
  if (!read.data) {
    return;
  }

  const output = await read.data.toAnkiExport({ legacy: true });
  const reread = await AnkiPackage.fromAnkiExport(output);
  expect(reread.status).toBe("success");

  await read.data.cleanup();
  await reread.data?.cleanup();
});
