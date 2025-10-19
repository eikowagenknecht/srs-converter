# Known Issues & Bugs

This file tracks bugs and technical issues discovered during development that need to be resolved later.
We're keeping this as a simple living markdown document for now.
When the project matures, we may switch to a more formal issue tracking system like GitHub Issues.

## Usage

When you discover a bug or technical issue during development, add it to the "Active Issues" section below using the format from the "Active Issues Example".
When the issue is resolved, move it to the "Resolved Issues" section with the additional data from the "Resolved Issues Example".

## Format Example

### Active Issues Example

```markdown
### (YYYY-MM-DD) Issue Title (Priority: High/Medium/Low)

**Problem:** Clear description of the issue
**Steps to reproduce:** (if applicable)
**Impact:** Description of impact
**Notes:** Additional context or dependencies
```

### Resolved Issues Example

These **add** resolution details:

```markdown
...
**Resolved:** YYYY-MM-DD
**Resolution:** What was done to resolve the issue
**Lessons Learned:** Any insights gained from resolving the issue
```

---

## Active Issues

### (2025-10-15) IDs Not Preserved in Either Conversion Direction (Priority: High)

**Problem:** Entity IDs are not preserved in either direction of conversion:

1. **Anki → SRS**: Anki numeric IDs (e.g., `1681194987408`) are replaced with new UUIDs (e.g., `'0199e808-19ad-77f8-8af7-4c399222e2d9'`)
2. **SRS → Anki**: SRS IDs (whether UUIDs or numeric strings) are replaced with newly generated numeric IDs

**Steps to reproduce:**

1. Load an Anki package with existing numeric IDs
2. Convert to SRS using `toSrsPackage()`
3. Observe that the SRS package contains new UUIDs instead of preserving the original Anki numeric IDs
4. Convert back to Anki using `fromSrsPackage()`
5. Observe that the Anki package contains new numeric IDs different from the original

**Impact:** This breaks ID preservation guarantees for:

- Note type IDs
- Note IDs
- Card IDs
- Deck IDs
- Review IDs

This means:

- Round-trip conversions cannot preserve entity IDs
- External systems tracking entities by ID will lose references
- Syncing and merging operations become impossible without additional mapping logic

**Notes:**

- Discovered during Story 1.2.5 (ID Preservation Tests) implementation
- The `toSrsPackage()` method generates new UUIDs instead of converting Anki numeric IDs to their string representation
- The `fromSrsPackage()` method generates new numeric IDs instead of parsing/converting SRS IDs
- To fix: Both methods need to preserve IDs, possibly with ID format conversion between numeric (Anki) and string (SRS) formats

---

## Resolved Issues

(No resolved issues at this time)
