---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Declare Content Dialects Per Source; Define a Universal Template Language

## Context and Problem Statement

Anki, Mnemosyne, and SuperMemo store field content as HTML; Mochi stores Markdown. HTML↔Markdown conversion is provably lossy in both directions (documented across the md2anki tool ecosystem). Template languages are mutually untranslatable (Anki `{{Field}}`/conditionals/`{{type:}}`, Mnemosyne fact-view key lists, Mochi `<< >>` sections) and are the single biggest portability obstacle identified in the prior-art research. How does the universal format store field content, and how are card templates represented?

## Decision Drivers

- Silent lossy conversion at import time is the failure mode the 2026-07-10 audit condemns; imports must be lossless.
- The README's core promise is a truly open, vendor-neutral format — templates that only Anki can execute undermine that.
- A consumer that cannot execute a source's template language must still be able to render a usable card.
- Positional field identity is a live bug (audit F8) and breaks on rename/reorder (prior-art lesson 5).

## Considered Options

**Field content:**

1. Declared dialect per note type (`html` | `markdown` | `plain`); conversion only as an explicit, loss-reporting operation
2. Canonical Markdown (convert at import)
3. Canonical HTML (convert at import)

**Templates:**

1. Verbatim templates + declared dialect + mandatory plain fallback
2. Universal template language, transpiled from/to each format's dialect
3. No templates in core (fields only; templates in extensions)

## Decision Outcome

Chosen: **content option 1** and **template option 2**, with verbatim-original preservation.

- **Content:** every note type declares its `contentFormat` (`html` | `markdown` | `plain`). Field values are stored untouched. Dialect conversion exists only as an explicit operation that reports its losses through the tri-state result (ADR-0002). Nothing converts silently at import.
- **Fields are name-keyed everywhere** — field values reference field names, never array positions; renames are explicit operations.
- **Templates: the RFC defines a universal template language** as the core representation. Design constraints:
  - Feature set = constructs expressible in at least two researched formats: named field interpolation, conditional sections on field emptiness, cloze rendering, hint/reveal, question-side inclusion in the answer, typed-answer marker (as an optional capability flag).
  - Importers transpile source templates into it; exporters transpile out of it. Constructs that cannot transpile degrade along RFC-defined rules and MUST be reported as conversion issues — never dropped silently.
  - **The original source template is additionally preserved verbatim in the source app's extension namespace.** Authority is split: the universal-language template is authoritative for cross-format consumers; the namespaced original is authoritative for same-app restoration (mirror of ADR-0004's cache principle). Same-app round-trips therefore restore templates exactly even where transpilation is imperfect.

### Consequences

- Good, because imports never destroy content; the audit's silent-loss failure mode is structurally excluded.
- Good, because the universal template language makes cards genuinely renderable by any conforming consumer — the vendor-neutrality promise becomes real rather than aspirational.
- Good, because verbatim originals in extension namespaces cap the downside of imperfect transpilation at zero for same-app round-trips.
- Bad, because consumers must handle (at least) two content dialects.
- Bad, because the template language is a significant spec and engineering commitment: a grammar in the RFC plus a transpiler per supported format, each with lossy edges that need degradation rules. This measurably grows Story 5.0.5 and the conversion-layer stories.
- Neutral, because template CSS remains a per-note-type field carried alongside (dialect-independent).

## More Information

Research basis: `docs/formats/README.md` (divergences 4 and 5), `docs/formats/prior-art.md` (lessons 5, 6, 7; md2anki lossiness evidence), per-format template models in `docs/formats/{anki,mnemosyne,mochi}.md`. Decision backlog entry: D2 in `docs/formats/open-decisions.md`. Related: ADR-0004 (authority-split principle), ADR-0005 (generator descriptors consume cloze/reverse semantics so templates don't have to), upcoming D4 ADR (extension namespaces and restore obligations that the verbatim-original rule relies on).
