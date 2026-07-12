---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# First-Class Deck Hierarchy with Card-Level Assignment

## Context and Problem Statement

"Deck" means four different things across the researched formats: Anki has a flat map with hierarchy encoded in names (`Parent::Child`) where **cards** belong to decks; Mochi has real `parent-id` hierarchies with deck-level settings; Mnemosyne has no decks at all (tags + saved sets); SuperMemo has a knowledge tree. The current universal model attaches decks to **notes**, which forces the Anki converter to silently move cards that live in different decks than their siblings.

## Decision Drivers

- Anki sibling cards legitimately live in different decks (per-template deck overrides, moved cards) — note-level assignment cannot represent this.
- Name-encoded hierarchy (`A::B`) is fragile (rename cascades); explicit parent references are not (prior-art lesson 13: FSRS dataset and Mochi both use `parent_id`).
- Deck presets (Anki `dconf`) are shared many-to-one and are currently dropped entirely (audit F12).

## Considered Options

1. Decks as first-class entities with `parentId` hierarchy; card-level deck assignment with note-level default; deck configs as separate referenced entities
2. Note-level deck assignment (status quo)
3. No decks in core (organization purely via tags)

## Decision Outcome

Chosen option 1.

- **Deck entity**: id, name (plain, no `::` semantics), optional `parentId`, description, optional `configId`.
- **Deck config entity**: separate, referenced many-to-one — scheduler-relevant settings live in app-namespaced extension blocks within it (per ADR-0004's cache principle); the entity itself (identity + name) is core so references survive conversion.
- **Assignment**: notes carry a default `deckId`; cards MAY override it. Exporters to note-level-only systems fold card overrides with a reported issue.
- **Mapping rules** (normative in the RFC): Anki `A::B` names ↔ parent chains; Mnemosyne tags ↔ decks by documented convention (reversible); SuperMemo tree path → deck chain; Mnemosyne criteria and Anki filtered decks → extension namespaces (they are queries, not containers).

### Consequences

- Good, because Anki collections round-trip without silently relocating cards.
- Good, because renames don't cascade through name-encoded paths.
- Good, because deck presets finally have a home and can be restored (fixes the audit F12 class of loss).
- Bad, because two assignment levels (note default + card override) add a rule consumers must implement.
- The single-deck restriction in `AnkiPackage.fromSrsPackage()` (`anki-package.ts:783`) is superseded.

## More Information

Research basis: `docs/formats/README.md` (divergence 3), `docs/formats/{anki,mochi,mnemosyne,supermemo}.md`, prior-art lesson 13. Decision backlog: D6 in `docs/formats/open-decisions.md`.

Partially superseded by ADR-0017 (spec draft.2): the "Mnemosyne tags ↔ decks by documented convention (reversible)" mapping rule is dropped — Mnemosyne packages carry no decks, note `deckId` is nullable, and exporters to deck-requiring targets synthesize a reported package-default deck. Everything else stands.
