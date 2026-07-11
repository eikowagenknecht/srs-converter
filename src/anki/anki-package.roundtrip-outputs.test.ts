import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";

/**
 * Produces the ADR-0016 four-direction round-trip outputs under
 * `out/roundtrip/` so CI can import them with real Anki
 * (`scripts/anki-fixtures/compare.py`, Story 1.3.10). The assertions here
 * only cover what our own reader can check; the real-Anki verification
 * happens in the CI step.
 */

const CORPUS = "tests/fixtures/anki/corpus";
const OUT = "out/roundtrip";

const DIRECTIONS = [
  { source: "corpus-legacy2-single-deck.apkg", legacy: true, output: "legacy-to-legacy.apkg" },
  { source: "corpus-legacy2-single-deck.apkg", legacy: false, output: "legacy-to-modern.apkg" },
  { source: "corpus-v3-single-deck.apkg", legacy: true, output: "modern-to-legacy.apkg" },
  { source: "corpus-v3-single-deck.apkg", legacy: false, output: "modern-to-modern.apkg" },
] as const;

describe("round-trip output matrix (Story 1.3.10)", () => {
  it.each(DIRECTIONS)("produces $output from $source", async ({ source, legacy, output }) => {
    await mkdir(OUT, { recursive: true });

    const sourceResult = await AnkiPackage.fromAnkiExport(join(CORPUS, source));
    const sourcePackage = sourceResult.data;
    expect(sourcePackage, `reading ${source}`).toBeDefined();
    if (!sourcePackage) {
      return;
    }
    let written: AnkiPackage | undefined;
    let reread: AnkiPackage | undefined;
    try {
      const srsResult = await sourcePackage.toSrsPackage();
      expect(srsResult.data).toBeDefined();
      if (!srsResult.data) {
        return;
      }
      const writeResult = await AnkiPackage.fromSrsPackage(srsResult.data);
      written = writeResult.data;
      expect(written).toBeDefined();
      if (!written) {
        return;
      }
      const outPath = join(OUT, output);
      await written.toAnkiExport(outPath, { legacy });

      // Sanity: our own reader accepts the output without critical issues.
      const rereadResult = await AnkiPackage.fromAnkiExport(outPath);
      expect(
        rereadResult.issues.filter((issue) => issue.severity === "critical"),
        `re-reading ${output}`,
      ).toHaveLength(0);
      reread = rereadResult.data;
      expect(reread?.getNotes()).toHaveLength(sourcePackage.getNotes().length);
    } finally {
      await sourcePackage.cleanup();
      await written?.cleanup();
      await reread?.cleanup();
    }
  });
});
