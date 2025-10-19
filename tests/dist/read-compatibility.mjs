/**
 * Distribution test: Reading Anki .apkg files with the built package
 *
 * This test verifies that the built distribution package works correctly
 * when imported and used in a plain Node.js environment:
 * - Imports from the built dist/ directory (not TypeScript source)
 * - Runs with plain Node.js (not tsx/vitest)
 * - Tests reading Anki export files
 */

import { exit } from "node:process";
import { AnkiPackage } from "../../dist/index.js";

const testFile = "./templates/anki/empty-legacy-2.apkg";

try {
  const result = await AnkiPackage.fromAnkiExport(testFile, {
    errorHandling: "best-effort",
  });

  if (result.status === "failure") {
    console.error("FAILED: Could not read .apkg file");
    console.error("Issues:", result.issues);
    exit(1);
  }

  console.log("SUCCESS: Read .apkg file successfully");
  console.log(`Status: ${result.status}`);

  if (result.issues && result.issues.length > 0) {
    console.log(`Warnings: ${result.issues.length}`);
  }

  exit(0);
} catch (error) {
  console.error("FAILED: Unexpected error");
  console.error(error);
  exit(1);
}
