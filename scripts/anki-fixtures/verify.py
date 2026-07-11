# /// script
# requires-python = ">=3.10"
# dependencies = ["anki==26.5"]
# ///
"""Import an .apkg into a fresh collection with real Anki and report what arrived.

Companion to generate.py (Story 1.3.2); the CI round-trip story (1.3.10) runs
this against srs-converter's own outputs to prove they import cleanly and
preserve guids, scheduling, FSRS state, and media.

Usage: python scripts/anki-fixtures/verify.py <package.apkg> [more.apkg ...]

Prints one JSON summary per package; exits non-zero if any import fails.
"""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from pathlib import Path

from anki.collection import Collection, ImportAnkiPackageOptions, ImportAnkiPackageRequest


def summarize_import(package_path: Path) -> dict:
    work_dir = Path(tempfile.mkdtemp(prefix="anki-verify-"))
    col = Collection(str(work_dir / "collection.anki2"))
    try:
        request = ImportAnkiPackageRequest(
            package_path=str(package_path),
            options=ImportAnkiPackageOptions(
                with_scheduling=True,
                with_deck_configs=True,
            ),
        )
        log = col.import_anki_package(request)

        notes = []
        for note_id, guid, tags, fields in col.db.execute(
            "select id, guid, tags, flds from notes order by guid"
        ):
            notes.append(
                {
                    "guid": guid,
                    "tags": tags.strip(),
                    "fieldsSha1": hashlib.sha1(fields.encode()).hexdigest()[:12],
                }
            )

        cards_by_state = {
            f"type{card_type}/queue{queue}": count
            for card_type, queue, count in col.db.execute(
                "select type, queue, count(*) from cards group by type, queue order by type, queue"
            )
        }
        fsrs_data_cards = col.db.scalar("select count(*) from cards where data like '%\"s\"%'")

        revlog_by_type = {
            f"type{review_type}": count
            for review_type, count in col.db.execute(
                "select type, count(*) from revlog group by type order by type"
            )
        }

        presets = []
        for config in sorted(col.decks.all_config(), key=lambda c: str(c["name"])):
            presets.append(
                {
                    "name": config["name"],
                    "desiredRetention": config.get("desiredRetention"),
                    "fsrsWeights": len(config.get("fsrsWeights") or []),
                    "fsrsParams5": len(config.get("fsrsParams5") or []),
                    "fsrsParams6": len(config.get("fsrsParams6") or []),
                }
            )

        media_dir = Path(col.media.dir())
        media = {
            file.name: hashlib.sha1(file.read_bytes()).hexdigest()[:12]
            for file in sorted(media_dir.iterdir())
            if file.is_file()
        }

        return {
            "package": package_path.name,
            "foundNotes": log.log.found_notes,
            "importedNew": len(log.log.new),
            "notes": notes,
            "decks": sorted(
                d.name
                for d in col.decks.all_names_and_ids()
                if not col.decks.get(d.id)["dyn"]
            ),
            "filteredDecks": sorted(
                d.name for d in col.decks.all_names_and_ids() if col.decks.get(d.id)["dyn"]
            ),
            "notetypes": sorted(nt.name for nt in col.models.all_names_and_ids()),
            "cardsByState": cards_by_state,
            "cardsWithFsrsData": fsrs_data_cards,
            "revlogByType": revlog_by_type,
            "presets": presets,
            "media": media,
        }
    finally:
        col.close()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    failures = 0
    for arg in sys.argv[1:]:
        try:
            summary = summarize_import(Path(arg))
            print(json.dumps(summary, indent=2))
        except Exception as error:  # noqa: BLE001 - report and continue
            failures += 1
            print(json.dumps({"package": arg, "error": str(error)}))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
