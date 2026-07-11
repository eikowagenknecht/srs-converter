# /// script
# requires-python = ">=3.10"
# dependencies = ["anki==26.5"]
# ///
"""Generate the Anki fixture corpus (Story 1.3.2).

Builds one collection with Anki's own library (the real Rust core, pinned to
the same release as the wire spec in docs/formats/anki.md) and exports it in
every package flavor srs-converter must understand. Also dumps unit-level
artifacts (the schema-18 database and the raw protobuf config blobs) for
codec tests.

Usage (uv):        uv run scripts/anki-fixtures/generate.py
Usage (venv):      python -m venv .venv && .venv/bin/pip install anki==26.5
                   .venv/bin/python scripts/anki-fixtures/generate.py

Output lands in tests/fixtures/anki/corpus/ (override with --out).

Regeneration is semantically stable, not byte-stable: entity ids derive from
creation timestamps, so re-running produces the same entities/content with
different ids. Tests must assert structure and content, never literal ids.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

from anki.collection import Collection

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "anki" / "corpus"

# 1x1 transparent PNG and a minimal MP3 frame — tiny but valid-enough media.
PIXEL_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082"
)
TINY_MP3 = bytes.fromhex("494433030000000000000ffffb9064000f")

FSRS_PARAMS_4 = [round(0.1 * i + 0.4, 4) for i in range(17)]
FSRS_PARAMS_5 = [round(0.05 * i + 0.3, 4) for i in range(19)]
FSRS_PARAMS_6 = [round(0.02 * i + 0.2, 4) for i in range(21)]


def log(message: str) -> None:
    print(f"[generate] {message}")


def add_note(col: Collection, notetype_name: str, deck: str, fields: dict[str, str], tags=None):
    notetype = col.models.by_name(notetype_name)
    if notetype is None:
        raise RuntimeError(f"notetype not found: {notetype_name}")
    note = col.new_note(notetype)
    for name, value in fields.items():
        note[name] = value
    if tags:
        note.tags = list(tags)
    col.add_note(note, col.decks.id(deck))
    return note


def build_collection(col: Collection) -> dict:
    """Populates the collection; returns a coverage summary."""
    media_dir = Path(tempfile.mkdtemp(prefix="anki-fixture-media-"))
    (media_dir / "pixel.png").write_bytes(PIXEL_PNG)
    (media_dir / "beep.mp3").write_bytes(TINY_MP3)
    png_name = col.media.add_file(media_dir / "pixel.png")
    mp3_name = col.media.add_file(media_dir / "beep.mp3")

    # --- Decks: hierarchy + per-deck overrides ------------------------------
    col.decks.id("Spanish")
    col.decks.id("Spanish::Vocabulary")
    col.decks.id("Spanish::Grammar")
    col.decks.id("Science")

    # --- Deck presets: two, with FSRS params in all three generations -------
    fsrs_conf = col.decks.add_config("FSRS preset")
    fsrs_conf["fsrsWeights"] = FSRS_PARAMS_4
    fsrs_conf["fsrsParams5"] = FSRS_PARAMS_5
    fsrs_conf["fsrsParams6"] = FSRS_PARAMS_6
    fsrs_conf["desiredRetention"] = 0.85
    fsrs_conf["new"]["perDay"] = 12
    fsrs_conf["rev"]["perDay"] = 123
    fsrs_conf["srsConverterPresetExtra"] = {"answer": 42}  # add-on style key
    col.decks.update_config(fsrs_conf)

    steps_conf = col.decks.add_config("Steps preset")
    steps_conf["new"]["delays"] = [1.0, 10.0, 60.0]
    steps_conf["lapse"]["delays"] = [15.0]
    steps_conf["lapse"]["leechAction"] = 0
    col.decks.update_config(steps_conf)

    spanish = col.decks.by_name("Spanish")
    spanish["conf"] = fsrs_conf["id"]
    spanish["desiredRetention"] = 88  # per-deck override, integer percent
    spanish["srsConverterDeckExtra"] = True  # add-on style key
    col.decks.save(spanish)

    science = col.decks.by_name("Science")
    science["conf"] = steps_conf["id"]
    col.decks.save(science)

    # Global FSRS switches (config table entries).
    col.set_config("fsrs", True)

    # --- Notetype tweaks: add-on data in `other` blobs -----------------------
    basic = col.models.by_name("Basic")
    basic["srsConverterModelExtra"] = {"nested": ["a", 1]}
    basic["flds"][0]["srsConverterFieldExtra"] = "field-extra"
    basic["tmpls"][0]["srsConverterTemplateExtra"] = 7
    col.models.update_dict(basic)

    # --- Notes: every stock notetype ----------------------------------------
    add_note(
        col,
        "Basic",
        "Spanish::Vocabulary",
        {"Front": f'hola <img src="{png_name}">', "Back": "hello"},
        tags=["vocab", "level::a1"],
    )
    add_note(
        col,
        "Basic (and reversed card)",
        "Spanish::Vocabulary",
        {"Front": f"adiós [sound:{mp3_name}]", "Back": "goodbye"},
        tags=["vocab"],
    )
    add_note(
        col,
        "Basic (type in the answer)",
        "Spanish::Grammar",
        {"Front": "yo ___ (ser)", "Back": "soy"},
    )
    add_note(
        col,
        "Cloze",
        "Spanish::Grammar",
        {
            "Text": "El {{c1::perro}} come {{c2::pan}}.",
            "Back Extra": "dog / bread",
        },
        tags=["cloze"],
    )
    io_summary = "skipped (notetype missing)"
    if col.models.by_name("Image Occlusion") is not None:
        add_note(
            col,
            "Image Occlusion",
            "Science",
            {
                "Occlusion": "{{c1::image-occlusion:rect:left=10.0:top=10.0:width=40.0:height=20.0}}",
                "Image": f'<img src="{png_name}">',
                "Header": "Cell diagram",
                "Back Extra": "",
                "Comments": "",
            },
        )
        io_summary = "included"

    # --- Scheduling states: reviews, FSRS memory state, suspend/bury --------
    card_ids = [row[0] for row in col.db.execute("select id from cards order by id")]
    if len(card_ids) < 5:
        raise RuntimeError(f"expected at least 5 cards, got {len(card_ids)}")

    first, second, third, fourth = card_ids[0], card_ids[1], card_ids[2], card_ids[3]

    # Give the first card a full review history covering every revlog type.
    # ids are epoch-ms and must be unique; ivl < 0 means seconds.
    base = 1_700_000_000_000
    revlog_rows = [
        # (id, cid, usn, ease, ivl, lastIvl, factor, time, type)
        (base + 1, first, 0, 1, -60, 0, 0, 5_000, 0),  # learning, again, 60s
        (base + 2, first, 0, 3, -600, -60, 0, 4_000, 0),  # learning, good
        (base + 3, first, 0, 3, 1, -600, 2500, 3_500, 0),  # graduate to 1d
        (base + 4, first, 0, 4, 4, 1, 2650, 2_000, 1),  # review, easy
        (base + 5, first, 0, 1, -600, 4, 2450, 6_000, 2),  # relearning (lapse)
        (base + 6, first, 0, 2, 3, -600, 2450, 2_500, 1),  # review, hard
        (base + 7, second, 0, 3, 2, 1, 2500, 1_500, 3),  # filtered/cram review
        (base + 8, third, 0, 0, 10, 2, 0, 0, 4),  # manual reschedule (ease 0)
        (base + 9, third, 0, 0, 12, 10, 305, 0, 5),  # FSRS reschedule
    ]
    for row in revlog_rows:
        col.db.execute(
            "insert into revlog (id,cid,usn,ease,ivl,lastIvl,factor,time,type) values (?,?,?,?,?,?,?,?,?)",
            *row,
        )

    # Review state on the first card + FSRS memory state in cards.data.
    col.db.execute(
        "update cards set type=2, queue=2, due=120, ivl=3, factor=2450, reps=6, lapses=1, data=? where id=?",
        json.dumps(
            {
                "pos": 1,
                "s": 3.42,
                "d": 5.17,
                "dr": 0.88,
                "decay": 0.19,
                "lrt": 1_700_000_500,
                "cd": json.dumps({"k": 1}),
            }
        ),
        first,
    )

    col.sched.suspend_cards([second])
    col.sched.bury_cards([fourth])

    # --- Filtered deck -------------------------------------------------------
    filtered_summary = "included"
    try:
        filtered_id = col.decks.new_filtered("Cram")
        filtered = col.decks.get(filtered_id)
        filtered["terms"] = [["deck:Spanish", 100, 6]]
        col.decks.save(filtered)
        col.sched.rebuild_filtered_deck(filtered_id)
    except Exception as error:  # pragma: no cover - depends on API surface
        filtered_summary = f"skipped ({error})"

    return {
        "notes": col.note_count(),
        "cards": len(card_ids),
        "image_occlusion": io_summary,
        "filtered_deck": filtered_summary,
        "media": [png_name, mp3_name],
        "revlog_types": sorted({row[8] for row in revlog_rows}),
    }


def export_all(col: Collection, out_dir: Path) -> list[str]:
    from anki.collection import ExportAnkiPackageOptions

    exports = []

    def apkg(name: str, *, legacy: bool, with_scheduling: bool) -> None:
        path = out_dir / name
        options = ExportAnkiPackageOptions(
            with_scheduling=with_scheduling,
            with_deck_configs=True,
            with_media=True,
            legacy=legacy,
        )
        # limit=None exports the whole collection.
        col.export_anki_package(out_path=str(path), options=options, limit=None)
        exports.append(name)

    apkg("corpus-legacy2.apkg", legacy=True, with_scheduling=True)
    apkg("corpus-v3.apkg", legacy=False, with_scheduling=True)
    apkg("corpus-v3-no-scheduling.apkg", legacy=False, with_scheduling=False)

    # Single-deck modern export: srs-converter's Legacy 2 writer currently
    # supports exactly one deck per package, so the modern→legacy round-trip
    # tests need a one-deck fixture.
    from anki.collection import DeckIdLimit

    vocab_id = col.decks.id_for_name("Spanish::Vocabulary")
    if vocab_id is None:
        raise RuntimeError("Spanish::Vocabulary deck missing")
    for name, legacy in [("corpus-v3-single-deck.apkg", False), ("corpus-legacy2-single-deck.apkg", True)]:
        col.export_anki_package(
            out_path=str(out_dir / name),
            options=ExportAnkiPackageOptions(
                with_scheduling=True,
                with_deck_configs=True,
                with_media=True,
                legacy=legacy,
            ),
            limit=DeckIdLimit(vocab_id),
        )
        exports.append(name)

    colpkg_path = out_dir / "corpus-v3.colpkg"
    col.export_collection_package(str(colpkg_path), include_media=True, legacy=False)
    exports.append("corpus-v3.colpkg")
    return exports


def dump_artifacts(collection_path: Path, v3_apkg: Path, artifacts_dir: Path) -> None:
    """Copies the schema-18 DB and dumps every protobuf config blob."""
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    db_copy = artifacts_dir / "collection-schema18.sqlite"
    shutil.copyfile(collection_path, db_copy)

    def slug(name: str) -> str:
        return "".join(ch if ch.isalnum() else "-" for ch in name).strip("-").lower()

    with sqlite3.connect(db_copy) as db:
        for name, config in db.execute("select name, config from notetypes"):
            (artifacts_dir / f"notetype-{slug(name)}.config.bin").write_bytes(config)
        for ntid, ord_, config in db.execute("select ntid, ord, config from fields"):
            (artifacts_dir / f"field-{ntid}-{ord_}.config.bin").write_bytes(config)
        for ntid, ord_, config in db.execute("select ntid, ord, config from templates"):
            (artifacts_dir / f"template-{ntid}-{ord_}.config.bin").write_bytes(config)
        for name, common, kind in db.execute("select name, common, kind from decks"):
            (artifacts_dir / f"deck-{slug(name)}.common.bin").write_bytes(common)
            (artifacts_dir / f"deck-{slug(name)}.kind.bin").write_bytes(kind)
        for name, config in db.execute("select name, config from deck_config"):
            (artifacts_dir / f"deck-config-{slug(name)}.config.bin").write_bytes(config)

    # Raw (still zstd-compressed) media manifest from the v3 package.
    with zipfile.ZipFile(v3_apkg) as zf:
        (artifacts_dir / "media-manifest.zst").write_bytes(zf.read("media"))
        (artifacts_dir / "meta.bin").write_bytes(zf.read("meta"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    work_dir = Path(tempfile.mkdtemp(prefix="anki-fixture-col-"))
    collection_path = work_dir / "collection.anki2"
    col = Collection(str(collection_path))

    summary = build_collection(col)
    exports = export_all(col, out_dir)
    col.close()

    dump_artifacts(collection_path, out_dir / "corpus-v3.apkg", out_dir / "artifacts")

    log(f"exports: {exports}")
    log(f"coverage: {json.dumps(summary, indent=2)}")
    log(f"output: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
