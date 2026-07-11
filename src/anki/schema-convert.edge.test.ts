import { describe, expect, it } from "vitest";

import {
  confJsonToConfigRows,
  configRowsToConfJson,
  deckConfigProtoToSchema11,
  deckConfigSchema11ToProto,
  deckProtoToSchema11,
  deckSchema11ToProto,
  humanDeckNameToNative,
  nativeDeckNameToHuman,
  notetypeSchema11ToProto,
} from "./schema-convert";

type Json = Record<string, unknown>;

describe("schema-convert tolerant parsing (Story 1.3.6 hardening)", () => {
  it("fills Anki's deserialization defaults for a sparse deck config", () => {
    const { config } = deckConfigSchema11ToProto({});

    expect(config.learn_steps).toEqual([1, 10]);
    expect(config.relearn_steps).toEqual([10]);
    expect(config.new_per_day).toBe(20);
    expect(config.reviews_per_day).toBe(200);
    expect(config.initial_ease).toBeCloseTo(2.5, 5);
    expect(config.easy_multiplier).toBeCloseTo(1.3, 5);
    expect(config.hard_multiplier).toBeCloseTo(1.2, 5);
    expect(config.interval_multiplier).toBeCloseTo(1, 5);
    expect(config.maximum_review_interval).toBe(36_500);
    expect(config.leech_threshold).toBe(8);
    expect(config.leech_action).toBe(1); // tag-only is the schema-11 default
    expect(config.wait_for_audio).toBe(true);
    expect(config.cap_answer_time_to_secs).toBe(60);
    // JSON default order is 1 (due) → proto 0 (due): the swapped enum.
    expect(config.new_card_insert_order).toBe(0);
    expect(config.graduating_interval_good).toBe(1);
    expect(config.graduating_interval_easy).toBe(4);
  });

  it("splits and re-merges nested new/rev/lapse add-on extras", () => {
    const source: Json = {
      id: 7,
      name: "P",
      new: { perDay: 5, myNewAddon: true },
      rev: { perDay: 9, myRevAddon: { x: 1 } },
      lapse: { mult: 0.5, myLapseAddon: [1, 2] },
      topLevelAddon: "keep-me",
    };
    const bundle = deckConfigSchema11ToProto(source);

    // Extras live inside the proto `other` bytes, keyed by scope.
    const other = JSON.parse(new TextDecoder().decode(bundle.config.other)) as Json;
    expect((other["new"] as Json)["myNewAddon"]).toBe(true);
    expect((other["rev"] as Json)["myRevAddon"]).toEqual({ x: 1 });
    expect((other["lapse"] as Json)["myLapseAddon"]).toEqual([1, 2]);
    expect(other["topLevelAddon"]).toBe("keep-me");

    // Converting back re-splats them into their scopes.
    const back = deckConfigProtoToSchema11(bundle);
    expect((back["new"] as Json)["myNewAddon"]).toBe(true);
    expect((back["new"] as Json)["perDay"]).toBe(5);
    expect((back["rev"] as Json)["myRevAddon"]).toEqual({ x: 1 });
    expect((back["lapse"] as Json)["myLapseAddon"]).toEqual([1, 2]);
    expect(back["topLevelAddon"]).toBe("keep-me");
  });

  it("never lets add-on data shadow real preset values on the way back", () => {
    const bundle = deckConfigSchema11ToProto({ new: { perDay: 5 }, rev: {}, lapse: {} });
    // Craft hostile add-on data that collides with reserved keys.
    bundle.config.other = new TextEncoder().encode(
      JSON.stringify({ new: { perDay: 999 }, maxTaken: 999 }),
    );
    const back = deckConfigProtoToSchema11(bundle);
    expect((back["new"] as Json)["perDay"]).toBe(5);
    expect(back["maxTaken"]).toBe(60);
  });

  it("accepts numeric strings for ids and timestamps", () => {
    const bundle = notetypeSchema11ToProto({
      id: "1699000000123",
      mod: "1700000000",
      usn: "-1",
      name: "N",
      type: 0,
      flds: [],
      tmpls: [],
    });
    expect(bundle.row.id).toBe(1_699_000_000_123);
    expect(bundle.row.mtimeSecs).toBe(1_700_000_000);
    expect(bundle.row.usn).toBe(-1);
  });

  it("accepts bool-from-anything for legacy boolean fields", () => {
    const bundle = notetypeSchema11ToProto({
      flds: [
        { name: "F", ord: 0, sticky: 1, rtl: "0", font: "Arial", size: 20 },
        { name: "G", ord: 1, sticky: "false", rtl: "true", font: "Arial", size: 20 },
      ],
      tmpls: [],
    });
    expect(bundle.fields[0]?.config.sticky).toBe(true);
    expect(bundle.fields[0]?.config.rtl).toBe(false);
    expect(bundle.fields[1]?.config.sticky).toBe(false);
    expect(bundle.fields[1]?.config.rtl).toBe(true);
  });

  it("round-trips per-deck day limits and loses only retention precision", () => {
    const bundle = deckSchema11ToProto({
      dyn: 0,
      reviewLimitToday: { limit: 3, today: 5 },
      newLimitToday: { limit: 7, today: 9 },
      desiredRetention: 92,
    });
    expect(bundle.kind.normal?.review_limit_today).toEqual({ limit: 3, today: 5 });
    expect(bundle.kind.normal?.new_limit_today).toEqual({ limit: 7, today: 9 });

    const back = deckProtoToSchema11({
      row: { id: 1, name: "D", mtimeSecs: 0, usn: 0 },
      common: bundle.common,
      kind: bundle.kind,
    });
    expect(back["reviewLimitToday"]).toEqual({ limit: 3, today: 5 });
    expect(back["desiredRetention"]).toBe(92);

    // Non-integer percent truncates — the documented inherent loss.
    const precise = deckSchema11ToProto({ dyn: 0 });
    if (precise.kind.normal) {
      precise.kind.normal.desired_retention = Math.fround(0.925);
    }
    const truncated = deckProtoToSchema11({
      row: { id: 1, name: "D", mtimeSecs: 0, usn: 0 },
      common: precise.common,
      kind: precise.kind,
    });
    expect(truncated["desiredRetention"]).toBe(92);
  });

  it("tolerates malformed today counters and req entries", () => {
    const deck = deckSchema11ToProto({
      dyn: 0,
      lrnToday: "not-an-array",
      revToday: [4],
      newToday: [4, 2],
      timeToday: [4, 100],
    });
    expect(deck.common.last_day_studied).toBe(4);
    expect(deck.common.new_studied).toBe(2);

    const notetype = notetypeSchema11ToProto({
      req: [[0, "bogus-kind", [0]], "not-a-tuple", [1, "all", "not-an-array"]],
      flds: [],
      tmpls: [],
    });
    expect(notetype.config.reqs).toEqual([
      { card_ord: 0, kind: 0, field_ords: [0] },
      { card_ord: 1, kind: 2, field_ords: [] },
    ]);
  });

  it("maps template deck overrides of zero or below to null", () => {
    const bundle = notetypeSchema11ToProto({
      flds: [],
      tmpls: [{ name: "T", ord: 0, qfmt: "q", afmt: "a", did: null }],
    });
    expect(bundle.templates[0]?.config.target_deck_id).toBe(0n);
  });

  it("converts deck names with multiple levels and none at all", () => {
    expect(humanDeckNameToNative("Single")).toBe("Single");
    expect(nativeDeckNameToHuman("Single")).toBe("Single");
    const native = humanDeckNameToNative("A::B::C");
    expect(native).toBe("A\u001FB\u001FC");
    expect(nativeDeckNameToHuman(native)).toBe("A::B::C");
  });

  it("round-trips complex col.conf values through config rows", () => {
    const conf: Json = {
      curDeck: 1,
      fsrs: true,
      nested: { a: [1, 2, { b: "c" }] },
      sortType: "noteFld",
    };
    const rows = confJsonToConfigRows(conf);
    expect(rows).toHaveLength(4);
    expect(configRowsToConfJson(rows)).toEqual(conf);
  });
});
