# SuperMemo Format Research

Part of Story 5.0.1 (format analysis for the universal SRS format design).
Researched 2026-07-10. Confidence tags: **[CODE]** verified from parser source, **[DOC]** SuperMemo official docs, **[SEC]** secondary. SuperMemo internals are notoriously underdocumented — uncertainty flags at the end matter.

## 0. Product landscape & scoping recommendation

SuperMemo is not one product:

| Product                               | Era / versions                        | Data format                                          | Import feasibility                                 |
| ------------------------------------- | ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| **SuperMemo for Windows**             | SM8 → SM15–SM19, SM20 (current ~2024) | Binary collection (`.kno` + folder) **+ XML export** | **Primary target — via XML export only**           |
| **supermemo.com** (web/mobile)        | 2015–present                          | Server-side proprietary                              | **Not importable** — no export exists (as of 2026) |
| **SuperMemo UX** (commercial courses) | ~2006–2012                            | `-SMArch-` SMPAK archive                             | Niche; readable (see §7)                           |
| **SM7/SM8 DOS-era**                   | 1990s                                 | Older binary                                         | Out of scope                                       |

**Recommendation:** target **SuperMemo for Windows via its XML export** (`File ▸ Export ▸ XML`) — the only format that (a) contains user-authored Q&A + tree + partial scheduling, (b) every SM15–SM20 install can produce, (c) is proven by 3+ independent open-source converters. **Do not attempt binary collection parsing** (no open-source parser exists; optimization data requires the proprietary algorithm).

## 1. Collection on disk [DOC — never code-verified]

A collection = `<name>.kno` (small binary DB header: element counts, version, burden, `FirstDay`/`LastDay` as days since 1980-01-01, SM-18 optimization data "too complex to interpret") + a sibling `<name>/` folder:

- `info/` — per-element binary databases: `ElementInfo.dat` (A-factor, last rep, reps, forgetting index), `contents.dat` (**knowledge tree** structure), `RepetitionHist.dat` (**full repetition history**), `compon.dat` (component layout), `repetitions.dat`, `sm8opt.dat` (optimization matrices), queue subsets (`Outstanding.sub`, …), `.ini` configs.
- `registry/` — deduplicated registries per media class: `text.*`, `image.*`, `sound.*`, `video.*`, `template.*`, `concept.*` (`.mem`/`.lst`/`.rtx`/`.rtf` + index files). **Question/answer text actually lives in the text registry.**
- `elements/` — multimedia blobs (HTML, images, sounds; 40 files/folder, CD-ROM legacy).

**Binary parsing feasibility: LOW.** Delphi-serialized, versioned, partly undocumented; every existing converter round-trips through XML.

## 2. Element model [DOC]

Everything is a node in a single **knowledge tree**. One element = one page; there are no decks and no note/card split:

- **Item** — the flashcard: Question + Answer. Cloze items are Items.
- **Topic** — reading material (article/extract); Question/Title body, no Answer; scheduled for incremental reading, not recall.
- **Concept** (SM17+) — subject hub rooting a concept group; tag-/category-like, supports many-to-many concept links.
- **Task** — to-do items in tasklists; separate scheduling.

Each element is composed of **components** (text/image/sound/HTML boxes) laid out by a **template** (`compon.dat`, `template.*` registry).

**Incremental reading lineage:** extract from a Topic → child Topic; cloze from an extract → child **Item**. The parent→child tree link (plus a back-reference) is the only structural record of the cloze↔source relationship.

## 3. Scheduling (SM-15 / SM-17 / SM-18) [DOC]

**Grades 0–5**; **< 3 = fail/lapse**: 0 blackout · 1 wrong, answer recognized · 2 wrong, felt easy · 3 correct with serious difficulty · 4 correct after hesitation · 5 perfect.

Per-element parameters:

- **A-Factor** — difficulty proxy (since SM8; replaced legacy **E-Factor**), stored per element and in XML.
- **U-Factor** — current/previous interval ratio; **R-Factor**; **Interval**; **Repetitions**; **Lapses**; **Last/Next repetition**; **First grade**.
- **OF matrix** (optimal factors, difficulty × stability) drives SM-5…SM-15.

**SM-17/SM-18 two-component (DSR) model:** per-element **Stability** (decay rate) and **Retrievability** (recall probability), item difficulty recomputed per repetition, ~400 forgetting curves feeding a stability-increase (SInc) matrix. Crucially: **SM-17+ state is derived from the full repetition history, not from stored scalars** — this is why cross-app schedule transfer fundamentally fails.

## 4. Repetition history [DOC]

Two-tier storage: aggregate scalars in `ElementInfo.dat` / XML `<LearningData>`; **full log in `RepetitionHist.dat`** — per repetition: rep #, date, hour, grade, interval, priority position, difficulty, stability, retrievability estimates, postponements.

Caveats: history collected only since **1996**; hour only since **SuperMemo 2006**. History can be exported as a **separate text file** (`Learning ▸ Statistics ▸ Repetition history`) — the only way to get per-rep history out; **not** carried by the XML export, and its text format is loosely documented.

## 5. Import/export paths — the practical core [CODE]

**SuperMemo XML export/import** is the workable path. Schema code-verified from three independent converters (libanki `supermemo_xml.py` reader, anki2sm writer, sm2anki reader):

```xml
<SuperMemoCollection>
  <Count>N</Count>
  <SuperMemoElement>
    <ID>1</ID>
    <Title>Biology</Title>        <!-- present on Topic/Concept nodes -->
    <Type>Topic</Type>            <!-- Topic | Item | Concept -->
    <SuperMemoElement>            <!-- nesting = the tree -->
      <ID>2</ID>
      <Type>Item</Type>
      <Content>
        <Question>What is ATP?</Question>
        <Answer>Adenosine triphosphate</Answer>
        <Image><URL>C:\...\elements\x.jpg</URL><Name>x.jpg</Name>
               <Question>T</Question><Answer>F</Answer></Image>
        <Sound><URL>...</URL><Name>a.mp3</Name><Text></Text>
               <Question>F</Question><Answer>T</Answer></Sound>
      </Content>
      <LearningData>
        <Interval>1</Interval>
        <Repetitions>1</Repetitions>
        <Lapses>0</Lapses>
        <LastRepetition>05.07.2026</LastRepetition>  <!-- DD.MM.YYYY -->
        <AFactor>3.92</AFactor>
        <UFactor>3</UFactor>
      </LearningData>
    </SuperMemoElement>
  </SuperMemoElement>
</SuperMemoCollection>
```

Code-verified facts:

- **Item detection** (libanki): no `<Title>` + has Question and Answer → Item; nodes with `<Title>` are Topic/Concept (structural). sm2anki maps the Concept/Title chain → deck path.
- Q&A are HTML-escaped; newlines → `<br>`. Topics carry only `<Question>`.
- **Media** = `<Image>`/`<Sound>`/`<Video>` elements inside `<Content>` with `<URL>` (absolute path!), `<Name>`, and **T/F `<Question>`/`<Answer>` flags choosing which side the media shows on**.
- **`<LearningData>` is optional and aggregate-only** — no per-rep history, no stability/retrievability. anki2sm ships it disabled because the scheduling models don't align.
- Tree reconstruction = XML nesting (converters keep a title breadcrumb stack).

**What real migrations do:** import Q&A + tree; **scheduling history is lost in practice** (SM-17 DSR can't be rebuilt from foreign data; even SM→SM XML carries only aggregates). Other paths: HTML export (presentation-only), Q&A text export, separate repetition-history text export (§4).

## 6. Content & media [DOC]

Element bodies are **HTML** (blobs in `elements/`, referenced via registries; non-HTML text as RTF). Media referenced by registry and by absolute path in XML. On XML import SuperMemo copies media into the collection and registers it; broken/relative paths are a documented gotcha.

## 7. supermemo.com & SMPAK

- **supermemo.com export does not exist** (blog 2015-12-04 "strongly considering"; never shipped; import-only through 2026). Not importable.
- **SMPAK / SuperMemo UX** [CODE, `ggodlewski/smux-anki-converter`]: magic `-SMArch-`, chunked, zlib-compressed; contains `/course.xml` + per-item `/itemNNNNN.xml` + `glossary.xml`. Item model carries richer scheduling than Windows XML: `lastRepetition`, `nextRepetition`, `aFactor`, `estimatedFI`, `expectedFI`, `firstGrade`, `newInterval`, `normalizedGrade`, `repetitions`, `uFactor`, `usedInterval`, `lapses`, `learned`, `type` (EXERCISE/ONCE/PRESENTATION), `question`, `answer`. Relevant only for legacy UX courses.

## Mapping notes (→ universal SRS format)

| Universal concept | SuperMemo equivalent                                                 | Recoverable via XML?                    | Notes                                                                                                                 |
| ----------------- | -------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Deck              | None — **knowledge tree** (Topic/Concept nodes)                      | Yes (nesting/`<Title>` chain)           | Tree is richer than decks: arbitrary depth, an element is both content and container. Converters map path → `A::B::C` |
| Note type         | Templates + components                                               | **No** — not in XML                     | Effectively lost; every Item becomes generic Q/A                                                                      |
| Note              | No note/card split                                                   | —                                       | Model as note == card                                                                                                 |
| Card              | **Item** (Q+A); Topic ≈ read-only card                               | Yes                                     | Topics need a "source material" representation or explicit skip                                                       |
| Review            | `RepetitionHist.dat`                                                 | **No** — XML omits it                   | Only via separate text export; incomplete pre-1996/pre-2006                                                           |
| Scheduling state  | A-Factor, interval, reps, lapses, last-rep (+derived S/R/difficulty) | Aggregate only (`<LearningData>`)       | SM-17 DSR needs full history — carry raw scalars _and_ review log in the universal format                             |
| Media             | registry + `elements/`; XML side-flags                               | Yes (`<URL>`/`<Name>` + T/F side flags) | Preserve the "which side" flag; resolve absolute paths                                                                |
| Tags              | None — Concepts / tree position                                      | Partial                                 | Map Concept membership → tags, or ancestors → hierarchical tags                                                       |

**Extra SM concepts with no universal home:** A/U/R-Factors, forgetting index target, priority queue, postponements, extract→cloze lineage, Tasks. The universal format should reserve an opaque, namespaced scheduling-state blob so SM→SM fidelity remains possible even when cross-app conversion is lossy.

**Bottom line:** support one import path — SM-for-Windows XML — recovering tree→decks, Items→cards (Q/A + media side flags), aggregate scheduling; document explicitly that full review history and DSR state are not recoverable via XML. Optional stretch: ingest the repetition-history text export.

## Sources

- [CODE] libanki `anki/importing/supermemo_xml.py` — <https://github.com/bmabey/libanki>
- [CODE] anki2sm (`anki2smV2.py`, `Models.py`) — <https://github.com/EstravenX/anki2sm>
- [CODE] sm2anki — <https://github.com/jiangege/sm2anki>
- [CODE] smux-anki-converter (`SmPakParser.java`, `course/Item.java`) — <https://github.com/ggodlewski/smux-anki-converter>
- [DOC] Collection files — <https://super-memory.com/help/files.htm>, <https://help.supermemo.org/wiki/SuperMemo_files>
- [DOC] `.kno` header — <https://supermemopedia.com/wiki/.Kno_file>
- [DOC] Glossary (A/E/U/R-Factor, stability, retrievability, OF matrix) — <https://super-memory.com/help/g.htm>
- [DOC] Element types — <https://help.supermemo.org/wiki/Items,_topics,_concepts,_and_tasks>
- [DOC] Repetition history — <https://super-memory.com/help/rephist.htm>
- [DOC] SM-17/SM-18 — <https://supermemo.guru/wiki/Algorithm_SM-17>, <https://supermemo.guru/wiki/Algorithm_SM-18>
- [DOC] XML exchange FAQ — <https://super-memory.com/archive/help16/faq/xml.htm>
- [DOC] supermemo.com export status — <https://www.supermemo.com/en/blog/call-for-requests-import-and-export-in-supermemo>
- [SEC] 50k-card Anki→SM migration case study — <https://masterhowtolearn.wordpress.com>

Uncertainties: binary `.dat` internals are DOC-only (field offsets unreliable); how faithfully SM rebuilds DSR state from imported `<LearningData>` is unverified (reportedly poor); `.kno` header from a single wiki page; supermemo.com assessment is "no export exists," not a format description.
