---
status: "accepted"
date: 2026-07-10
decision-makers: Eiko Wagenknecht
consulted: Claude (format research, docs/formats/)
---

# Use the Review Log as Scheduling Source of Truth, with Ratings Stored on Their Original Scale

## Context and Problem Statement

Every SRS application stores different, mutually untranslatable scheduler state (Anki: queue/due/interval/ease + FSRS stability/difficulty; Mnemosyne: easiness + acquisition/retention phases; SuperMemo: A-factors + DSR model; Mochi: plain doubling intervals). Grading scales differ in both range and semantics: Anki 1–4 (fail = 1), Mnemosyne 0–5 (fail ≤ 1), SuperMemo 0–5 (fail < 3), Mochi binary. How should the universal format represent scheduling data so that migration between these systems preserves as much meaning as possible?

## Decision Drivers

- FSRS (Anki's modern scheduler) demonstrates that per-card memory state is _derivable_ from the raw review log — its research datasets store only the log (see `docs/formats/prior-art.md` §3).
- SuperMemo demonstrates the inverse: SM-17+ state cannot be rebuilt from snapshots, only from full history — snapshot-based migrations "start from zero" (see `docs/formats/supermemo.md` §3).
- Some sources can only provide snapshots (SuperMemo XML exports aggregate scalars without history), so snapshots need _a_ home, just not a required one.
- The two 0–5 scales disagree about what failure means, so any single normalized rating scale destroys information in one direction and fabricates it in the other.
- The 2026-07-10 round-trip audit showed that scheduling data without a specified home silently resets (`docs/working/issues.md`).

## Considered Options

**Architecture:**

1. Review log as required portable core; scheduler state as optional, namespaced, regenerable caches
2. Snapshot state (due/interval/ease) as first-class core; review log optional
3. Log only; no scheduler snapshots at all

**Rating representation:**

1. Original value + declared scale (per source), RFC-defined mappings applied only on export
2. Normalized 4-button enum (current `SrsReviewScore`), mapped at import
3. Both: normalized enum + preserved original value

## Decision Outcome

Chosen: **architecture option 1** and **rating option 1**.

- The **review log is the source of truth** for scheduling. The universal review record carries: card id, timestamp (epoch ms), rating (original value), duration, review kind (e.g. learn/review/relearn/manual/rescheduled), and optionally scheduled vs. actual interval (present in Anki and Mnemosyne; valuable for FSRS training).
- The **rating scale is declared once per source/package**, either as a well-known named scale (`anki`, `mnemosyne`, `supermemo`, `binary`) or a custom `{ min, max, failBelow }` object. Review entries store the untouched source value. Cross-scale mappings are defined normatively in the RFC and applied only when exporting to a target that requires a different scale — never at import.
- **Scheduler state snapshots** (queue/due/interval/ease, FSRS memory state, easiness, A-factors) live in optional, app-namespaced extension blocks, explicitly specified as _regenerable caches_: importers MAY use them and MUST NOT require them.

### Consequences

- Good, because migration fidelity is maximal: FSRS-class schedulers can retrain from the preserved log; nothing is destroyed at import time.
- Good, because sources that only export snapshots (SuperMemo XML) still keep what little they have, without polluting the required core.
- Good, because the format stays scheduler-agnostic — a new algorithm in 2030 changes nothing in the core schema.
- Bad, because consumers that just want "when is this card due" must either read a namespaced snapshot or compute scheduling themselves — the core does not guarantee a due date.
- Bad, because rating consumers must resolve the declared scale before interpreting values (mitigated by the small set of named well-known scales).
- The current `SrsReviewScore` 1–4 enum and the lossy import-time mapping in `AnkiPackage.toSrsPackage()` are superseded and will be replaced when the implementation is aligned with the spec (Phase 5/6 implementation stories).

## More Information

Research basis: `docs/formats/README.md` (comparison matrix, "Scheduling algorithm commonalities"), `docs/formats/prior-art.md` (design lessons 1, 2, 8), `docs/formats/supermemo.md`, `docs/formats/mnemosyne.md`, `docs/formats/anki.md`. Decision backlog entry: D1 in `docs/formats/open-decisions.md`. Related: ADR-0003 (extension data), to be evolved by the D4 decision (namespaced extensions with restore obligations).
