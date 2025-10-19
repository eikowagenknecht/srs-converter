# Phase 5: Universal Format Design

[← Back to Stories Overview](README.md)

## Phase 5.0: Universal Format Specification

### Story 5.0.1: Analyze Common Patterns Across All Implemented Formats

**Status:** ⏳ Pending

**Story:** As a developer, I want to analyze patterns across Anki, Mnemosyne, SuperMemo, and Mochi so I can design an effective universal format.

**Acceptance Criteria:**

- [ ] Document common data structures across all formats
- [ ] Identify shared concepts (cards, scheduling, reviews)
- [ ] Document unique features that need preservation
- [ ] Analyze scheduling algorithm commonalities
- [ ] Document media handling approaches
- [ ] Create comprehensive format comparison matrix

**Implementation Notes:**

- Only start after completing all format I/O implementations
- Comprehensive analysis of real usage patterns
- Document findings in blog posts like <https://eikowagenknecht.de/posts/understanding-the-anki-apkg-format/>

**Testing:**

- [ ] Manual: Validate analysis against real data

---

### Story 5.0.2: Choose Universal Format Serialization Strategy

**Status:** ⏳ Pending

**Story:** As a developer, I want to evaluate and choose the best serialization format for the universal SRS format so it meets the human-readable open format requirement while balancing usability and performance.

**Acceptance Criteria:**

- [ ] Evaluate JSON as serialization format (pros/cons, tooling, readability)
- [ ] Evaluate YAML as serialization format (human-friendliness, complexity handling)
- [ ] Evaluate Markdown with frontmatter (combining structured data with readable content)
- [ ] Evaluate EDN format (extensible data notation, like Mochi uses)
- [ ] Evaluate hybrid approaches (e.g., YAML + Markdown, JSON + embedded content)
- [ ] Consider tooling ecosystem and library support for each format
- [ ] Assess performance characteristics for large datasets
- [ ] Ensure format supports rich media references and complex nested structures
- [ ] Document decision rationale with concrete examples

**Implementation Notes:**

**Format Options to Evaluate:**

1. **Pure JSON**
   - ✅ Excellent tooling, universally supported
   - ✅ Fast parsing, small size
   - ❌ Not very human-readable for complex data
   - ❌ No comments, limited schema expressiveness

2. **Pure YAML**
   - ✅ Very human-readable and editable
   - ✅ Supports comments and complex structures
   - ❌ Slower parsing, more complex spec
   - ❌ Indentation-sensitive, can be error-prone

3. **Markdown + YAML Frontmatter**
   - ✅ Combines structured metadata with readable content
   - ✅ Familiar to developers, great for documentation
   - ✅ Card content can be actual markdown
   - ❌ More complex parsing, two-format approach

4. **EDN (Extensible Data Notation)**
   - ✅ Highly extensible, used by Mochi
   - ✅ Supports rich data types and extensibility
   - ❌ Less familiar, smaller tooling ecosystem
   - ❌ Clojure-centric, may feel foreign to most developers

5. **Hybrid Approaches**
   - JSON/YAML for metadata + separate content files
   - Directory structure with multiple format files
   - Archive format (ZIP) containing multiple serialization formats

**Evaluation Criteria:**

- Human readability and editability
- Tooling ecosystem and editor support
- Performance with large datasets
- Schema validation capabilities
- Extensibility for future features
- Cross-platform compatibility
- Version control friendliness (git diffs)

**Testing:**

- [ ] Create sample data in each format with realistic SRS content
- [ ] Benchmark parsing performance across formats
- [ ] Test human editability with non-technical users
- [ ] Evaluate diff quality in version control
- [ ] Test tooling support (validation, formatting, etc.)

---

### Story 5.0.3: Design Universal SRS Format Interfaces

**Status:** ⏳ Pending

**Story:** As a developer, I want to design universal interfaces so all SRS formats can be represented consistently.

**Acceptance Criteria:**

- [ ] Design universal card/note/deck interfaces
- [ ] Create universal scheduling representation
- [ ] Design universal media handling
- [ ] Create universal metadata structures
- [ ] Handle format-specific data preservation
- [ ] Ensure extensibility for future formats

**Implementation Notes:**

- Build on existing `src/srs-package.ts` work
- Must accommodate all researched formats
- Extensible design for unknown future formats

**Testing:**

- [ ] Manual: Interface design validation with real data

---

### Story 5.0.4: Create Universal Format Validation and Schema

**Status:** ⏳ Pending

**Story:** As a developer, I want validation and schema for the universal format so data integrity is guaranteed.

**Acceptance Criteria:**

- [ ] Create schema for chosen serialization format (JSON Schema, YAML Schema, etc.)
- [ ] Implement validation functions for the chosen format
- [ ] Create format validation test suite
- [ ] Handle schema versioning and evolution
- [ ] Create migration utilities for schema changes
- [ ] Document validation requirements and error messages

**Implementation Notes:**

- Comprehensive validation framework based on chosen serialization format
- Support for schema evolution and backward compatibility
- Clear, actionable error messages for validation failures
- Consider format-specific schema tools (JSON Schema, YAML Schema, etc.)

**Testing:**

- [ ] Automated: Validation test suite
- [ ] Manual: Schema validation with various data
- [ ] Manual: Test schema evolution and migration utilities

---

### Story 5.0.5: Write RFC-Style Universal Format Documentation

**Status:** ⏳ Pending

**Story:** As a developer, I want RFC-style documentation so third parties can implement the universal format.

**Acceptance Criteria:**

- [ ] Complete RFC-style specification document
- [ ] Third-party integration developer documentation
- [ ] Security considerations and requirements
- [ ] Comprehensive examples and edge cases
- [ ] Versioning and compatibility guidelines
- [ ] Implementation guidance and best practices

**Implementation Notes:**

- Follow RFC formatting standards
- Comprehensive technical specification
- Real-world examples and use cases

**Testing:**

- [ ] Manual: Third-party developer review and feedback

---
