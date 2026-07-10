# Decisions

For new Architectural Decision Records (ADRs), please use the following template as a starting point: [adr-template.md](adr-template.md).
It has a lot of sections, but most are optional and should only be used if they add value for this specific MADR!

If you are not sure which to use, go with the default:

- Short title, representative of solved problem and found solution
- Context and Problem Statement
- Considered Options
- Decision Outcome
- Consequences

Only add the other sections if it really is needed.

The MADR documentation is available at <https://adr.github.io/madr/> while general information about ADRs is available at <https://adr.github.io/>.

## Overview

- **ADR-0001**: Design SRS converter as standalone npm package
- **ADR-0002**: Implement tri-state error handling for SRS converter
- **ADR-0003**: Use applicationSpecificData for Data preservation across formats _(superseded by ADR-0011)_
- **ADR-0004**: Use the review log as scheduling source of truth, with ratings stored on their original scale
- **ADR-0005**: Model cards as generated units of notes, identified by explicit generator descriptors
- **ADR-0006**: Declare content dialects per source; define a universal template language
- **ADR-0007**: Serialize as a JSON directory with zip transport
- **ADR-0008**: First-class deck hierarchy with card-level assignment
- **ADR-0009**: Stable universal IDs with source identity maps and deterministic derivation
- **ADR-0010**: Complete the core entity model: media, tags, timestamps, card status
- **ADR-0011**: Versioned core with namespaced extensions and restore obligations _(supersedes ADR-0003)_
- **ADR-0012**: Conformance profiles and mandatory loss reporting
