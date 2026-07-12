---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Model Cards as Generated Units of Notes, Identified by Explicit Generator Descriptors

## Context and Problem Statement

Anki and Mnemosyne split content (note/fact) from schedulable units (cards) generated via templates/fact-views. Mochi and SuperMemo have no such split — and Mochi additionally attaches multiple independent review schedules to a single card (front, reverse, each cloze group). Anki cloze cards are generated from content markers rather than a fixed template list, which the current implementation handles with an out-of-bounds `templateId` convention that produced a cluster of audit bugs (F9, S1, S2). What is the universal schedulable unit, and how is a card's origin represented?

## Decision Drivers

- The note→cards direction is strictly more expressive: card-only formats map losslessly as note-with-one-card, while reconstructing notes from card-only data requires heuristics.
- The numeric `templateId` cannot honestly represent cloze cards (index ≠ template), Mochi reverse schedules, or Mochi per-cloze-group schedules.
- Audit findings F9/S1/S2 trace directly to the implicit cloze convention.
- SuperMemo topics (reading material without an answer) exist in no other format, and supporting answer-less units would burden every consumer.

## Considered Options

**Unit model:**

1. Note→cards split; card = the schedulable unit; explicit generator descriptor per card
2. Note→cards split with the existing numeric `templateId` (status quo)
3. Card-only model (no note/card split)

**SuperMemo topics:**

1. Preserve in the SuperMemo extension namespace only
2. First-class card kind (`recall` | `read`)
3. Out of scope entirely

## Decision Outcome

Chosen: **unit model option 1** and **topics option 3**.

- The note/card split is kept. A card is **the** schedulable unit — exactly one review history per card.
- Each card carries an explicit **generator descriptor** stating why it exists:
  - `{ type: "template", templateId }` — generated from a note-type template (Anki templates, Mnemosyne fact views)
  - `{ type: "cloze", index }` — generated from cloze deletion group _index_ in the note content
  - `{ type: "reverse" }` — the reversed direction of the note's primary card
- Mapping rules: Anki cloze `{{c1::…}}`/`{{c2::…}}` → cards `{cloze, 1}`/`{cloze, 2}`; Mochi's parallel schedules (`:reverse-reviews`, `:cloze/reviews`) → sibling cards with `reverse`/`cloze` generators, folded back into one Mochi card on export; SuperMemo items and other card-only formats → note with a single `{template}` card.
- **SuperMemo topics are out of scope**: importers drop them and MUST report the drop as a conversion issue (tri-state result, ADR-0002). They are not preserved in extension data.

### Consequences

- Good, because card generation semantics become explicit and type-safe — the cloze out-of-bounds convention (and its bug cluster) disappears structurally.
- Good, because all four researched formats' generation models are representable without special cases.
- Good, because "one card = one review history" keeps the review log model (ADR-0004) simple.
- Bad, because exporters to card-only formats must fold sibling cards back together (well-defined via the generator descriptor, but real work).
- Bad, because SuperMemo collections — often majority topics — lose their topics even on SM→universal→SM round-trips; this is accepted deliberately to keep the format flashcard-focused, and the loss is always surfaced, never silent.
- The current numeric `templateId` on `SrsCard` and the cloze detection heuristics in `anki-package.ts` are superseded (implementation alignment in later stories).

## More Information

Research basis: `docs/formats/README.md` (divergences 2 and 7), `docs/formats/mochi.md` §3/§5, `docs/formats/supermemo.md` §2, audit findings F9/S1/S2 in `docs/working/issues.md`. Decision backlog entry: D10 in `docs/formats/open-decisions.md`. Related: ADR-0004 (review log per card).

Refined by ADR-0017 (spec draft.2): the template generator references templates by name (`templateName`); the cloze `index` is the literal source group number.
