import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  deckCommonCodec,
  deckConfigCodec,
  deckKindCodec,
  fieldConfigCodec,
  mediaEntriesCodec,
  notetypeConfigCodec,
  templateConfigCodec,
} from "./anki-proto";

const ARTIFACTS = "tests/fixtures/anki/corpus/artifacts";

async function artifact(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(ARTIFACTS, name)));
}

async function artifactNames(prefix: string): Promise<string[]> {
  const files = await readdir(ARTIFACTS);
  return files.filter((file) => file.startsWith(prefix) && file.endsWith(".bin")).sort();
}

describe("anki-proto codecs against real Anki 26.05 blobs", () => {
  it("decodes the Basic notetype config incl. add-on data in `other`", async () => {
    const config = notetypeConfigCodec.decode(await artifact("notetype-basic.config.bin"));

    expect(config.kind).toBe(0); // normal
    expect(config.css).toContain(".card");
    expect(config.original_stock_kind).toBe(1); // basic
    expect(config.reqs.length).toBeGreaterThan(0);
    // The generator stored srsConverterModelExtra as an unknown schema-11 key,
    // which Anki carries as JSON inside the `other` bytes.
    const other = JSON.parse(new TextDecoder().decode(config.other)) as Record<string, unknown>;
    expect(other["srsConverterModelExtra"]).toEqual({ nested: ["a", 1] });
  });

  it("decodes cloze-kind notetypes", async () => {
    const cloze = notetypeConfigCodec.decode(await artifact("notetype-cloze.config.bin"));
    expect(cloze.kind).toBe(1);
    expect(cloze.original_stock_kind).toBe(5); // cloze

    const occlusion = notetypeConfigCodec.decode(
      await artifact("notetype-image-occlusion.config.bin"),
    );
    expect(occlusion.kind).toBe(1); // image occlusion is cloze-kind
    expect(occlusion.original_stock_kind).toBe(6);
  });

  it("decodes the FSRS preset with all three parameter generations", async () => {
    const config = deckConfigCodec.decode(await artifact("deck-config-fsrs-preset.config.bin"));

    expect(config.fsrs_params_4).toHaveLength(17);
    expect(config.fsrs_params_5).toHaveLength(19);
    expect(config.fsrs_params_6).toHaveLength(21);
    expect(config.desired_retention).toBeCloseTo(0.85, 5);
    expect(config.new_per_day).toBe(12);
    expect(config.reviews_per_day).toBe(123);
    const other = JSON.parse(new TextDecoder().decode(config.other)) as Record<string, unknown>;
    expect(other["srsConverterPresetExtra"]).toEqual({ answer: 42 });
  });

  it("decodes the steps preset (SM-2 options)", async () => {
    const config = deckConfigCodec.decode(await artifact("deck-config-steps-preset.config.bin"));

    expect(config.learn_steps).toEqual([1, 10, 60]);
    expect(config.relearn_steps).toEqual([15]);
    expect(config.leech_action).toBe(0); // suspend
  });

  it("decodes a normal deck kind with per-deck desired retention", async () => {
    const kind = deckKindCodec.decode(await artifact("deck-spanish.kind.bin"));

    expect(kind.filtered).toBeUndefined();
    expect(kind.normal).toBeDefined();
    expect(kind.normal?.config_id).toBeGreaterThan(0n);
    // Set as 88 (integer percent) in the schema-11 dialect → 0.88 in proto.
    expect(kind.normal?.desired_retention).toBeCloseTo(0.88, 5);
  });

  it("decodes a filtered deck kind with search terms", async () => {
    const kind = deckKindCodec.decode(await artifact("deck-cram.kind.bin"));

    expect(kind.normal).toBeUndefined();
    expect(kind.filtered).toBeDefined();
    expect(kind.filtered?.search_terms).toEqual([
      expect.objectContaining({ search: "deck:Spanish", limit: 100, order: 6 }),
    ]);
  });

  it("decodes every blob in the corpus without errors", async () => {
    const decoders: [string, (buffer: Uint8Array) => unknown][] = [
      ["notetype-", (buffer) => notetypeConfigCodec.decode(buffer)],
      ["field-", (buffer) => fieldConfigCodec.decode(buffer)],
      ["template-", (buffer) => templateConfigCodec.decode(buffer)],
      ["deck-config-", (buffer) => deckConfigCodec.decode(buffer)],
    ];
    for (const [prefix, decode] of decoders) {
      const names = await artifactNames(prefix);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        decode(await artifact(name));
      }
    }
    for (const name of await artifactNames("deck-")) {
      if (name.includes(".common.")) {
        deckCommonCodec.decode(await artifact(name));
      } else if (name.includes(".kind.")) {
        deckKindCodec.decode(await artifact(name));
      }
    }
  });

  it("re-encodes every corpus blob byte-identically", async () => {
    const cases: [string, (buffer: Uint8Array) => Uint8Array][] = [
      ["notetype-", (b) => notetypeConfigCodec.encode(notetypeConfigCodec.decode(b))],
      ["field-", (b) => fieldConfigCodec.encode(fieldConfigCodec.decode(b))],
      ["template-", (b) => templateConfigCodec.encode(templateConfigCodec.decode(b))],
      ["deck-config-", (b) => deckConfigCodec.encode(deckConfigCodec.decode(b))],
    ];
    for (const [prefix, roundTrip] of cases) {
      for (const name of await artifactNames(prefix)) {
        const original = await artifact(name);
        expect(roundTrip(original), `round-tripping ${name}`).toEqual(original);
      }
    }
    for (const name of await artifactNames("deck-")) {
      const original = await artifact(name);
      if (name.includes(".common.")) {
        expect(
          deckCommonCodec.encode(deckCommonCodec.decode(original)),
          `round-tripping ${name}`,
        ).toEqual(original);
      } else if (name.includes(".kind.")) {
        expect(
          deckKindCodec.encode(deckKindCodec.decode(original)),
          `round-tripping ${name}`,
        ).toEqual(original);
      }
    }
  });

  it("preserves unknown fields through decode → encode (ADR-0013 invariant)", async () => {
    const [firstFieldBlob] = await artifactNames("field-");
    if (!firstFieldBlob) {
      throw new Error("no field blobs in corpus");
    }
    const original = await artifact(firstFieldBlob);
    // Append a synthetic unknown field: number 200, varint, value 12345.
    const tag = 200 << 3; // wire type 0 (varint)
    const withUnknown = Uint8Array.from([
      ...original,
      // varint tag 1600 = [0xc0, 0x0c]
      (tag & 0x7f) | 0x80,
      tag >> 7,
      0xb9,
      0x60,
    ]);

    const decoded = fieldConfigCodec.decode(withUnknown);
    expect(decoded.$unparsed).toBeDefined();
    expect(decoded.$unparsed?.length).toBeGreaterThan(0);

    const reEncoded = fieldConfigCodec.encode(decoded);
    const decodedAgain = fieldConfigCodec.decode(reEncoded);
    expect(decodedAgain.$unparsed).toEqual(decoded.$unparsed);
  });

  it("round-trips a synthetic media manifest", () => {
    const manifest = {
      entries: [
        { name: "pixel.png", size: 71, sha1: new Uint8Array(20).fill(7) },
        { name: "beep.mp3", size: 17, sha1: new Uint8Array(20).fill(9) },
      ],
    };
    const encoded = mediaEntriesCodec.encode(manifest);
    const decoded = mediaEntriesCodec.decode(encoded);
    expect(decoded.entries).toHaveLength(2);
    expect(decoded.entries[0]?.name).toBe("pixel.png");
    expect(decoded.entries[0]?.sha1).toEqual(new Uint8Array(20).fill(7));
    expect(decoded.entries[1]?.size).toBe(17);
    expect(decoded.entries[0]?.legacy_zip_filename).toBeUndefined();
  });
});
