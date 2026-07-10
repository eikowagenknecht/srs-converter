# Prior Art: SRS & Flashcard Interchange Formats

Part of Story 5.0.1 (format analysis for the universal SRS format design).
Researched 2026-07-10. Survey of every notable attempt at flashcard/SRS data interchange — what recurs, what worked, what failed. "Verified" = read primary source (README/schema/docs/code); "impressionistic" claims flagged.

## 1. CrowdAnki — JSON export of Anki decks for git collaboration

The canonical "Anki-as-git" format (add-on, used by large shared-deck projects like AnKingMed). Verified from source/README.

- Structure: recursive deck tree in `deck.json` + sibling `media/` dir. Deck: `__type__`, `crowdanki_uuid`, `name`, `desc`, `children` (nesting). Notes: `guid` (Anki note guid = dedup key), `note_model_uuid`, `fields[]` (**ordered array of raw HTML strings — positional, no names**), `tags[]`. `note_models[]` = full Anki notetype (flds, tmpls with qfmt/afmt, css, type, req). `deck_configs[]` = scheduler _presets_ (not per-card state). `media_files[]` by name.
- **Dedup model:** UUIDs are the merge key (notes via Anki `guid`, everything else via `crowdanki_uuid`); matching UUID = update in place. This is what makes git merges/PRs on decks viable.
- **Deliberately excludes all per-card scheduling and the revlog** — it is a _sharing_ format; recipients schedule from scratch. Filtered decks skipped.
- Pain points (impressionistic, from issues): scheduler-version mismatches on import; positional field identity breaks on rename/reorder; imports clobber local deck config.

## 2. genanki & deck-generation libraries

genanki (Python, dominant generator), verified:

- Minimal model: `Model(model_id, name, fields, templates(qfmt/afmt), css)`, `Note(model, fields[], guid, tags)`, `Deck(deck_id, name)`, `Package`.
- **IDs are hardcoded once and frozen** (random 31-bit ints); regenerating with same IDs makes Anki treat imports as the same model/deck. The single most-emphasized rule in the docs.
- **`guid` = hash of field values by default; users override to hash only _identity_ fields** so metadata edits don't split notes. The practical "stable content ID" pattern the ecosystem copies.
- Scheduling: out of scope by design — always emits fresh cards.

Neighbors: `anki-apkg-export` (JS, minimal), `mkanki`, `ankipandas` (verified: DataFrames over notes/cards/**revlog** — the one lib surfacing history), `anki-apkg-extractor`. Generators converge on {notetype: named fields + template strings + css} + {note: ordered values + guid + tags}; nobody puts scheduling in the generation path.

## 3. FSRS ecosystem — "review log as ground truth"

The strongest evidence that a **migration** format must center the review log. Verified from the HF dataset card and py-fsrs/fsrs-rs.

- **anki-revlogs-10k / srs-benchmark dataset**: three normalized tables:
  - `revlogs`: `card_id`, `day_offset`, `rating` (1-4), `state` (card state _at review time_: 0 new/1 learning/2 review/3 relearning), `duration` (ms), `elapsed_days`, `elapsed_seconds`
  - `cards`: `card_id`, `note_id`, `deck_id`; `decks`: `deck_id`, `parent_id`, `preset_id`
- Design signal: **the review log is the primary artifact; scheduler state is derived, not stored.** Manual due-date edits and filtered-deck reviews are filtered out to keep the log a clean behavioral record.
- FSRS runtime: memory = Difficulty [1,10] + Stability (days) + Retrievability [0,1]; optimizer fits ~21 params from `ReviewLog[]`. Implication: store the log + optionally a _cached_ memory-state snapshot, treated as regenerable, never authoritative.

## 4. Obsidian spaced-repetition — human-readable scheduling in-content

Verified (st3v3nmw/obsidian-spaced-repetition): cards as markdown (`Q::A`, multi-line `?`, cloze via `==...==`/`{{...}}`); scheduling appended as an HTML comment: `<!--SR:!2024-08-16,51,230-->` (due date, interval days, ease ×100).

- **No card IDs** — identity is positional/content-derived. Pure git-diffable plaintext, zero external DB; but edits/reorders orphan schedules, no cross-tool mapping, and **no review history** (only the current snapshot).

## 5. Markdown / plaintext SRS tools

- **Logseq** (impressionistic): `#card` tag; scheduling as block properties in the same plaintext (`card-ease-factor::`, `card-next-schedule::`, `card-last-score::` 1–5). Same in-content tradeoff as Obsidian, but keyed properties.
- **RemNote** (impressionistic): typed delimiters (`>>`, `::`, `{{cloze}}`); outliner-shaped markdown export; scheduling not exported.
- **NeuraCache markdown spec** (verified): explicit attempt to _standardize_ md flashcards (`question :: answer #flashcard`, multi-line with `---` terminator). Content-only, no scheduling. Little adoption beyond its app.
- **md2anki family** (verified survey): `mdanki`, `Markdown2Anki`, etc. Recurring warning in their own docs: **HTML↔Markdown round-trips are lossy** — direct evidence that content-format choice is a portability hazard.
- **Hashcards** (impressionistic): plaintext SRS with an append-only **review log file separate from card content** — indie datapoint for log-as-truth in human-readable form.

## 6. Anki's own interchange reality

(Format details in [anki.md](anki.md).) Why `.apkg` is a poor interchange substrate despite being the de-facto standard: app-internal SQLite, semantics-bearing JSON blobs inside one `col` row, positional `0x1f`-joined fields, checksums, bit-packed columns, schema mutating across releases (11→18, anki2/21/21b), and sharing exports strip scheduling by default. You must reimplement Anki internals to read it safely.

**AnkiConnect** (verified): localhost JSON-RPC; `addNote` takes `fields{name: value}` — **name-keyed**, unlike .apkg's positional arrays. The cleaner projection most third-party tools actually integrate against.

## 7. Standardization attempts (mostly dead or narrow)

- Pauker / jMemorize / Granule (Java Leitner apps): each its own XML lesson format; no cross-adoption; dead.
- OpenCards: flashcards as PowerPoint slides; niche.
- **Quizlet/Cram TSV**: term/definition with configurable delimiters — the lowest-common-denominator lingua franca; captures nothing beyond two strings.
- **QTI** (IMS assessment standard): real and maintained, but targets graded testing — heavyweight XML, response-processing logic, **no concept of spaced repetition or review logs**. The "standards-body approach" and why it didn't become the flashcard format.
- **Net finding: no widely adopted universal SRS interchange format exists.** The community standardized on the _algorithm_ (FSRS) far more successfully than on data. De-facto trio: .apkg (sharing) + Quizlet TSV (trivial) + CrowdAnki JSON (git) — each lossy in a different axis.

## 8. Cross-domain lessons (brief)

- **iCalendar (RFC 5545)**: mandatory `VERSION`/`PRODID`; but the flat `X-` extension namespace had **no vendor scoping → collisions and silent divergence**; RFC 7986 later needed an IANA registry to clean up. Namespace extensions from day one.
- **GPX**: versioned schema + dedicated `<extensions>` element with XML-namespaced vendor data. Clean core/vendor separation.
- **ActivityStreams 2.0**: JSON-LD `@context` = URI-namespaced extension terms over a small required core.
- Pattern: **version marker + small required core + optional-by-default + explicit namespaced extension channel** — the opposite of Anki's implicit evolving schema.

## Design lessons for the universal SRS format

1. **Review log is the source of truth; scheduler state is a cache.** Ordered, append-only events per card (timestamp, rating, elapsed, state-at-review, duration). Scheduler snapshots (SM-2 ease/ivl, FSRS S/D) are derivable, marked regenerable. Sharing formats drop this; a migration format never may (FSRS ecosystem proves why).
2. **Separate the two use cases explicitly.** Sharing/publishing = content-only + fresh scheduling (CrowdAnki); migration/backup = full history. One format, optional history section — not two formats.
3. **Stable, global, content-independent IDs on every entity** (CrowdAnki UUIDs), never positional identity (Anki `flds`, Obsidian comments) — positional identity breaks on edit/reorder and blocks cross-tool mapping.
4. **Also carry a deterministic content-hash guid** (genanki pattern) for dedup/update-on-reimport, computed over _identity_ fields only — distinct from the stable ID.
5. **Fields name-keyed, not ordinal.** AnkiConnect (keyed) is portable; .apkg (positional) is not. Renames/reorders must be non-destructive.
6. **Pick one content format and specify it rigorously.** HTML↔Markdown round-tripping is provably lossy. Either Markdown-as-source with a versioned rendering contract, or canonical source + rendered form; never "implementation-defined."
7. **Templates/notetypes are the #1 portability killer.** Model as {named fields + N card definitions + _declared_ template dialect + css}, so a consumer that can't execute templates still recovers fields and a plain rendering. Template engine = opt-in capability.
8. **Scheduler-agnostic core with typed extension slots.** Universal log (rating on a _declared scale_ with declared fail-threshold semantics; Anki 1–4, SM/Mnemosyne 0–5 with different fail lines, Mochi binary, Logseq 1–5) + native scheduler params in namespaced blocks.
9. **Media by reference + manifest, content-addressed** (name→hash→mime; bundled bytes or external resolution). Modern Anki (sha1) and Mnemosyne (`_hash`) already do this. Never base64 inline in the readable body.
10. **Directory-of-files by default, zip as transport wrapper.** Directory = git-diffable/mergeable (CrowdAnki's whole value); zip for sending (.apkg/.mochi). Never a binary DB as canonical form.
11. **Version marker + small required core + optional-by-default** (iCal/GPX/ActivityStreams pattern).
12. **Namespaced extension escape hatch with a registry/promotion path** — learn from iCal's `X-` mess. Plus: extensions must specify _restore obligations_ (this repo's audit shows unspecified escape hatches rot).
13. **Deck hierarchy + config as first-class, id-referenced** (`parent_id`, `preset_id`) — not string-path-coupled; many decks share one preset without duplication.
14. **Human-readability must not cost identity.** Obsidian/Logseq are loved for diffability; their weakness is missing IDs and discarded history. Combine diffability with explicit IDs and a preserved log.
15. **Round-trip fidelity is the acceptance test.** Define a conformance profile: what a minimal importer MUST preserve (content + ids + log) vs MAY drop (rendered HTML, vendor extensions). Every existing format fails silently in a different place — make failure explicit and testable.

## Sources

Verified: github.com/Stvad/CrowdAnki; github.com/kerrickstaley/genanki; huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k; github.com/open-spaced-repetition/srs-benchmark; py-fsrs/fsrs-rs; github.com/st3v3nmw/obsidian-spaced-repetition (+ data-storage docs); mochi.cards/docs (format reference); github.com/NeuraCache/markdown-flashcards-spaced-repetition; AnkiDroid DB-structure wiki; docs.ankiweb.net; Quizlet help; RFC 5545/7986.

Impressionistic (confirm before quoting in the RFC): RemNote/Logseq exact syntax tokens, Pauker/jMemorize/OpenCards XML specifics, QTI scope details, GPX/ActivityStreams extension mechanics, Hashcards design, CrowdAnki issue-tracker specifics.
