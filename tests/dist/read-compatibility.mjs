/**
 * Distribution test: Reading Anki .apkg files with the built package
 *
 * This test verifies that the built distribution package works correctly
 * when imported and used in a plain Node.js environment:
 * - Imports from the built dist/ directory (not TypeScript source)
 * - Runs with plain Node.js (not tsx/vitest)
 * - Tests reading Anki export files
 *
 * The browser bundle is probed under Node as well: its WASM zstd and
 * in-memory storage work in any runtime, so a passing read here is a cheap
 * portability check without a real browser (the vitest browser project does
 * the real-browser verification).
 */

import { readFile } from "node:fs/promises";
import { exit } from "node:process";

import { AnkiPackage as BrowserAnkiPackage } from "../../dist/index.browser.mjs";
import { AnkiPackage } from "../../dist/index.mjs";

const testFile = "./tests/fixtures/anki/empty-legacy-2.apkg";

try {
  const data = new Uint8Array(await readFile(testFile));

  for (const [label, Package] of [
    ["node bundle", AnkiPackage],
    ["browser bundle", BrowserAnkiPackage],
  ]) {
    const result = await Package.fromAnkiExport(data, {
      errorHandling: "best-effort",
    });

    if (result.status === "failure") {
      console.error(`FAILED: Could not read .apkg file with ${label}`);
      console.error("Issues:", result.issues);
      exit(1);
    }

    console.log(`SUCCESS: Read .apkg file successfully with ${label}`);
    console.log(`Status: ${result.status}`);

    if (result.issues && result.issues.length > 0) {
      console.log(`Warnings: ${result.issues.length}`);
    }
  }

  exit(0);
} catch (error) {
  console.error("FAILED: Unexpected error");
  console.error(error);
  exit(1);
}
