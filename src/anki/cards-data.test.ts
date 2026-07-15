import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import { loadFixture } from "./anki-package.fixtures";
import { isValidCustomData, parseCardData, serializeCardData } from "./cards-data";

describe("cards.data FSRS state (Story 1.3.11)", () => {
  it("parses the FSRS state from the fixture corpus", async () => {
    const result = await AnkiPackage.fromAnkiExport(
      await loadFixture("anki/corpus/corpus-v3.apkg"),
    );
    const anki = result.data;
    expect(anki).toBeDefined();
    if (!anki) {
      return;
    }
    try {
      const withData = anki.getCards().filter((card) => card.data && card.data !== "{}");
      expect(withData.length).toBeGreaterThanOrEqual(1);
      const first = withData[0];
      if (!first) {
        return;
      }
      const parsed = parseCardData(first.data);
      expect(parsed.stability).toBeCloseTo(3.42, 5);
      expect(parsed.difficulty).toBeCloseTo(5.17, 5);
      expect(parsed.desiredRetention).toBeCloseTo(0.88, 5);
      expect(parsed.decay).toBeCloseTo(0.19, 5);
      expect(parsed.lastReviewTime).toBe(1_700_000_500);
      expect(parsed.pos).toBe(1);
      expect(JSON.parse(parsed.customData ?? "")).toEqual({ k: 1 });
      // Round trip: re-serializing yields semantically equal JSON.
      expect(JSON.parse(serializeCardData(parsed))).toEqual(JSON.parse(first.data));
    } finally {
      await anki.cleanup();
    }
  });

  it("treats empty and invalid values as empty state", () => {
    expect(parseCardData("")).toEqual({ extra: {} });
    expect(parseCardData("{}")).toEqual({ extra: {} });
    expect(parseCardData("not json")).toEqual({ extra: {} });
    expect(parseCardData("[1,2]")).toEqual({ extra: {} });
    expect(serializeCardData({ extra: {} })).toBe("");
  });

  it("preserves unknown keys and mistyped known keys through round trips", () => {
    const source = JSON.stringify({ s: 2.5, futureKey: { a: 1 }, pos: "not-a-number" });
    const parsed = parseCardData(source);
    expect(parsed.stability).toBe(2.5);
    expect(parsed.pos).toBeUndefined();
    expect(parsed.extra["futureKey"]).toEqual({ a: 1 });
    expect(parsed.extra["pos"]).toBe("not-a-number");
    expect(JSON.parse(serializeCardData(parsed))).toEqual(JSON.parse(source));
  });

  it("validates custom data against Anki's import limits", () => {
    expect(isValidCustomData("")).toBe(true);
    expect(isValidCustomData(JSON.stringify({ k: 1 }))).toBe(true);
    expect(isValidCustomData(JSON.stringify({ tooLongKey123: 1 }))).toBe(false);
    const longValue = "x".repeat(200);
    expect(isValidCustomData(JSON.stringify({ k: longValue }))).toBe(false);
    expect(isValidCustomData("not json")).toBe(false);
    expect(isValidCustomData("[1]")).toBe(false);
  });
});
