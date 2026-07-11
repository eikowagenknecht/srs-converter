# /// script
# requires-python = ">=3.10"
# dependencies = ["anki==26.5"]
# ///
"""Import two Anki packages with real Anki and compare what arrives.

Used by CI (Story 1.3.10) to prove srs-converter's round-trip outputs import
into real Anki with the same content as the fixture they came from:

    python scripts/anki-fixtures/compare.py <source.apkg> <output.apkg>

Strictly compared: notes (guid, tags, field hash), regular deck names, media
hashes, and card scheduling states. Review-log, preset, and filtered-deck
differences are reported informationally — the known gaps (ease-0 revlog
rows, filtered decks as ephemeral study views) are tracked in
docs/working/issues.md.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from verify import summarize_import

STRICT_KEYS = ["notes", "decks", "media", "cardsByState"]
INFO_KEYS = ["revlogByType", "presets", "cardsWithFsrsData", "filteredDecks"]


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    source, output = Path(sys.argv[1]), Path(sys.argv[2])
    source_summary = summarize_import(source)
    output_summary = summarize_import(output)

    failures = []
    for key in STRICT_KEYS:
        if source_summary.get(key) != output_summary.get(key):
            failures.append(key)
            print(f"MISMATCH {key}:")
            print(f"  source: {json.dumps(source_summary.get(key), sort_keys=True)}")
            print(f"  output: {json.dumps(output_summary.get(key), sort_keys=True)}")

    for key in INFO_KEYS:
        if source_summary.get(key) != output_summary.get(key):
            print(f"info: {key} differs:")
            print(f"  source: {json.dumps(source_summary.get(key), sort_keys=True)}")
            print(f"  output: {json.dumps(output_summary.get(key), sort_keys=True)}")

    if failures:
        print(f"FAIL {output.name}: {', '.join(failures)}")
        return 1
    print(f"OK {output.name}: matches {source.name} in real Anki")
    return 0


if __name__ == "__main__":
    sys.exit(main())
