# Phase 1: Anki Format I/O (Complete Implementation)

[← Back to Stories Overview](README.md)

## Phase 1.0: Anki Reading (.apkg/.colpkg)

### Story 1.0.1: Complete Basic Anki Package Reading

**Status:** ✅ Completed

**Story:** As a developer, I want to read all basic components from Anki packages so the library can access decks, notes, cards, and note types reliably.

**Acceptance Criteria:**

- ✅ Successfully read .apkg and .colpkg files
- ✅ Extract all decks with names and configuration
- ✅ Extract all notes with field values and timestamps
- ✅ Extract all cards with scheduling information
- ✅ Extract all note types with fields and templates

**Implementation Notes:**

- Core reading functionality exists in `src/anki/anki-package.ts`
- Database queries work for basic schema
- Successfully handles standard Anki packages

**Testing:**

- ✅ Manual: Basic .apkg reading works
- ✅ Automated: Basic reading test suite complete

---

### Story 1.0.2: Add Anki Media File Metadata Reading

**Status:** ✅ Completed

**Story:** As a developer, I want to read media file metadata from Anki packages so the library can track media references and mappings.

**Acceptance Criteria:**

- ✅ Extract media file references and mappings from packages
- ✅ Maintain media file metadata (filenames, checksums)
- ✅ Handle various media file types in metadata (images, audio, video)
- ✅ Preserve media organization structure references

**Implementation Notes:**

- Media metadata handling implemented in `src/anki/anki-package.ts`
- Media references tracked in database
- Internal preservation of mappings only - no user-facing API for actual files

**Testing:**

- ✅ Manual: Media metadata extraction works
- ✅ Manual: Media references preserved

---

### Story 1.0.3: Handle Anki Review History and Scheduling Data

**Status:** ✅ Completed

**Story:** As a developer, I want to read review history and scheduling data so the library can preserve learning progress information.

**Acceptance Criteria:**

- ✅ Extract complete review logs with timestamps
- ✅ Read card scheduling information (due dates, intervals, ease factors)
- ✅ Preserve review scores and timing data
- ✅ Handle different Anki scheduling algorithms

**Implementation Notes:**

- Review history reading implemented
- Card scheduling data extracted from revlog and cards tables
- Supports various Anki algorithms

**Testing:**

- ✅ Manual: Review history preserved in round-trip tests

---

### Story 1.0.4: Support All Anki Note Types

**Status:** ✅ Completed

**Story:** As a developer, I want to read all Anki note types so the library can handle Basic, Cloze, Image Occlusion, and custom note types.

**Acceptance Criteria:**

- ✅ Read Basic note types with front/back templates
- ✅ Read Cloze deletion note types with cloze templates
- ✅ Read Image Occlusion note types with occlusion data
- ✅ Read custom user-defined note types
- ✅ Preserve note type configuration and styling

**Implementation Notes:**

- Basic note types implemented and working
- Cloze deletion support implemented with `analyzeClozeOrdinals()` function
- Image Occlusion note types supported with proper template detection
- Custom note types handled through generic note type parsing
- Template rendering and CSS preservation implemented

**Testing:**

- ✅ Manual: Test with various Anki note type examples
- ✅ Automated: Comprehensive note type parsing test suite with cloze-specific tests

---

### Story 1.0.5: Handle Corrupted and Malformed Anki Packages

**Status:** ⏳ Pending

**Story:** As a developer, I want to gracefully handle corrupted and malformed Anki package files so the library provides a good user experience even with problematic files.

**Acceptance Criteria:**

- [ ] Handle corrupted ZIP archives gracefully
- [ ] Handle missing required files (collection.anki2/collection.anki21)
- [ ] Handle corrupted SQLite database files
- [ ] Handle invalid JSON in media metadata
- [ ] Provide clear, actionable error messages for each error type
- [ ] Support partial data recovery where possible
- [ ] Use tri-state error handling pattern

**Implementation Notes:**

- Implement comprehensive error handling in `src/anki/anki-package.ts`
- Use tri-state error pattern from `src/error-handling.ts`
- Provide detailed error context for debugging
- Consider partial recovery strategies (e.g., read valid decks even if some are corrupted)

**Testing:**

- [ ] Manual: Test with various corrupted package scenarios
- [ ] Automated: Test suite with intentionally corrupted files
- [ ] Automated: Validate error message quality

---

### Story 1.0.6: Support Multiple Anki Database Schema Versions

**Status:** ⏳ Pending

**Story:** As a developer, I want to support both Anki v2.0 and v2.1 database schemas so the library works with packages from different Anki versions.

**Acceptance Criteria:**

- [ ] Identify and document differences between Anki v2.0 and v2.1 schemas
- [ ] Implement schema version detection
- [ ] Support reading from Anki v2.0 (collection.anki2)
- [ ] Support reading from Anki v2.1 (collection.anki21)
- [ ] Handle schema-specific differences transparently
- [ ] Test with real packages from both Anki versions

**Implementation Notes:**

- Research schema differences between versions
- Implement version detection based on file presence and database structure
- May need conditional query logic for version-specific fields
- Document schema differences in `docs/` for future reference

**Testing:**

- [ ] Manual: Test with Anki v2.0 packages
- [ ] Manual: Test with Anki v2.1 packages
- [ ] Automated: Test suite covering both schema versions

---

## Phase 1.1: Anki Writing (.apkg/.colpkg)

### Story 1.1.1: Implement Basic Anki Package Writing

**Status:** ✅ Completed

**Story:** As a developer, I want to write basic Anki packages so the library can export decks, notes, cards, and note types.

**Acceptance Criteria:**

- ✅ Create valid .apkg files with proper structure
- ✅ Write decks with correct configuration
- ✅ Write notes with all field values
- ✅ Write cards with proper scheduling data
- ✅ Write note types with templates and configuration
- ✅ Generate valid Anki database schema

**Implementation Notes:**

- Full writing functionality implemented via `toAnkiExport()` method
- Creates proper .apkg files with collection.anki21, meta, and media metadata files
- Supports all basic note types (Basic, Basic+Reversed, Cloze)
- Generates valid database schema compatible with Anki
- Media file metadata writing included (actual media files handled in Phase 1.1.5)

**Testing:**

- ✅ Manual: Generated .apkg files verified through round-trip testing
- ✅ Automated: Comprehensive write test creates and validates complete packages (commit ca8c9a9)

---

### Story 1.1.2: Add Anki Media File Metadata Writing

**Status:** ✅ Completed

**Story:** As a developer, I want to write media file metadata to Anki packages so exported packages preserve media references.

**Acceptance Criteria:**

- ✅ Write media file references to package metadata
- ✅ Create proper media mapping files (media file, not media.db)
- ✅ Generate media directory structure references
- ✅ Handle various media file type metadata
- ✅ Preserve media file organization in metadata

**Implementation Notes:**

- Media **metadata** writing implemented in `toAnkiExport()` method
- Creates "media" file with JSON mapping of media references
- Maintains file mappings from `this.mediaFiles` property
- Handles media file reference preservation (metadata only)
- **Note**: This covers metadata only - actual media file content export is handled in Phase 1.1.5

**Testing:**

- ✅ Manual: Media metadata preserved in exported packages through round-trip tests
- ✅ Automated: Media handling verified in comprehensive write test suite

---

### Story 1.1.3: Write Anki Review History and Scheduling Data

**Status:** ✅ Completed

**Story:** As a developer, I want to write review history so exported packages preserve learning progress.

**Acceptance Criteria:**

- ✅ Write complete review logs with correct timestamps
- ✅ Write card scheduling information (due dates, intervals, ease)
- ✅ Maintain review score accuracy
- ✅ Support different Anki scheduling algorithms
- ✅ Preserve review timing data

**Implementation Notes:**

- Review writing implemented via `addReview()` method and database export
- Correctly populates revlog table with all review data
- Handles various review types (Learning, Review) and card states
- Supports different ease factors, intervals, and timing data
- Integrated with database creation in `toAnkiExport()`

**Testing:**

- ✅ Manual: Review history preserved and verified in round-trip testing
- ✅ Automated: Comprehensive review data creation and validation in write test (commit ca8c9a9)

---

### Story 1.1.4: Support Complex Anki Features in Export

**Status:** ✅ Completed

**Story:** As a developer, I want to export complex Anki features so the library supports advanced use cases.

**Acceptance Criteria:**

- ✅ Export Cloze deletion cards with proper formatting
- ✅ Export Image Occlusion cards with occlusion data
- ✅ Export custom note types with styling
- ✅ Export deck configuration and options
- ✅ Handle advanced template features

**Implementation Notes:**

- Cloze deletion export fully implemented with proper card generation
- Image Occlusion support included in note type export
- Custom note types exported with complete styling and CSS
- Deck configuration preserved in export process
- Advanced template features handled through note type export

**Testing:**

- ✅ Manual: Complex cards verified through round-trip testing
- ✅ Automated: Cloze cards created and validated in write test (commit ca8c9a9)

---

### Story 1.1.5: Export Anki Plugin Data and Configurations

**Status:** ⏳ Pending

**Story:** As a developer, I want to export Anki plugin data and configurations so the library can preserve plugin-specific functionality where possible.

**Acceptance Criteria:**

- ⏳ Identify plugin data stored in Anki database (config table, etc.)
- ✅ Export plugin configurations that don't require active plugin code (via raw database export)
- ✅ Handle plugin-specific note type modifications (preserved in raw export)
- ✅ Preserve plugin-generated fields and metadata (preserved in raw export)
- ❌ Document limitations of plugin data portability
- ❌ Provide warnings when plugin-dependent features are detected

**Implementation Notes:**

- Basic plugin data preservation implemented via raw database export in `toAnkiExport()`
- Plugin configurations in collection table `conf` field are likely preserved
- Plugin-specific note types, fields, and metadata preserved through complete database export
- **Missing**: No explicit plugin detection, documentation, or user warnings
- **Missing**: No testing with actual plugin data to verify preservation

**Testing:**

- ❌ Manual: No testing with packages that contain plugin data
- ❌ Manual: Plugin preservation not specifically verified
- ⏳ Automated: Raw database export works, but plugin-specific testing needed

---

## Phase 1.1.6: Anki Media File API Support

### Story 1.1.6.1: Add User-Facing API for Retrieving Media Files

**Status:** ✅ Completed

**Story:** As a developer, I want to retrieve actual media files from Anki packages so applications can access images, audio, and other media content.

**Acceptance Criteria:**

- ✅ Implement API to extract actual media files from packages
- ✅ Support streaming files without loading entire file into memory
- ✅ Provide file size metadata
- ✅ Handle various media file types (images, audio, video, documents)
- ✅ Return media files as readable streams

**Implementation Notes:**

- Implemented three methods in `AnkiPackage` class (src/anki/anki-package.ts:815-894):
  - `listMediaFiles()` - Returns array of all media filenames
  - `getMediaFileSize(filename)` - Returns file size in bytes
  - `getMediaFile(filename)` - Returns ReadableStream for file content
- Built on existing media metadata reading (Story 1.0.2)
- Uses Node.js `createReadStream()` for memory-efficient streaming
- All files treated uniformly (no size-based branching for simplicity)

**Testing:**

- ✅ Automated: Comprehensive test suite in src/anki/anki-package.test.ts
- ✅ Automated: Tests for listing files, getting size, streaming content
- ✅ Automated: Error handling for non-existent files
- ✅ Automated: File integrity verification

---

### Story 1.1.6.2: Add User-Facing API for Adding Media Files

**Status:** ⏳ Pending

**Story:** As a developer, I want to add media files to Anki packages so applications can create packages with custom media content.

**Acceptance Criteria:**

- [ ] Implement API to add media files to packages during creation
- [ ] Support adding files from file paths, buffers, or streams
- [ ] Automatically generate media file mappings
- [ ] Update media database entries when files are added

**Implementation Notes:**

- Build on existing media metadata writing (Story 1.1.2)
- Integrate with package writing pipeline

**Testing:**

- [ ] Manual: Add various media file types
- [ ] Manual: Test deduplication logic
- [ ] Unit: Media addition API validation

---

### Story 1.1.6.3: Implement Media File Management and Utilities

**Status:** ⏳ Pending

**Story:** As a developer, I want media file management utilities so applications can efficiently work with media in SRS packages.

**Acceptance Criteria:**

- [ ] Implement media file validation (format, size, integrity)
- [ ] Provide media file conversion utilities for common formats
- [ ] Add media file optimization (compression, resizing for images)
- [ ] Implement media file replacement and updates
- [ ] Support media file batch operations
- [ ] Provide media file usage analysis (which notes reference which files)

**Implementation Notes:**

- Consider using image processing libraries for optimization
- Implement format validation for security
- Support batch operations for efficiency
- Provide detailed usage tracking

**Testing:**

- [ ] Manual: Media file validation and conversion
- [ ] Manual: Batch operations with large media sets
- [ ] Unit: Media utility functions

---

## Phase 1.2: Anki Testing and Edge Cases

### Story 1.2.1: Achieve 100% Test Coverage for Anki Reading

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive test coverage for Anki reading so the library is reliable and maintainable.

**Acceptance Criteria:**

- [ ] 100% line coverage for all Anki reading code
- [ ] Test all supported Anki package formats
- [ ] Test all note types and card templates
- [ ] Test media file handling
- [ ] Test database schema variations
- [ ] Test performance with large datasets

**Implementation Notes:**

- Current test coverage is minimal
- Need comprehensive test suite with real Anki files
- Performance testing framework needed

**Testing:**

- [ ] Automated: Complete test suite
- [ ] Performance: Large dataset benchmarks

---

### Story 1.2.2: Achieve 100% Test Coverage for Anki Writing

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive test coverage for Anki writing so exported packages are reliable.

**Acceptance Criteria:**

- [ ] 100% line coverage for all Anki writing code
- [ ] Test package creation with various configurations
- [ ] Test media file packaging
- [ ] Test database generation accuracy
- [ ] Test compatibility with different Anki versions
- [ ] Validate exported packages with Anki

**Implementation Notes:**

- Writing tests don't exist yet
- Need automated Anki validation
- Must test with actual Anki application

**Testing:**

- [ ] Automated: Complete writing test suite
- [ ] Integration: Anki compatibility validation

---

### Story 1.2.3: Handle Anki Edge Cases and Error Conditions

**Status:** ⏳ Pending

**Story:** As a developer, I want robust error handling so the library gracefully handles problematic Anki files.

**Acceptance Criteria:**

- [ ] Handle corrupted .apkg files gracefully
- [ ] Handle missing media files
- [ ] Handle unsupported Anki features
- [ ] Handle database schema mismatches
- [ ] Provide clear error messages
- [ ] Support partial data recovery where possible

**Implementation Notes:**

- Current error handling is basic
- Need comprehensive error scenarios
- Tri-state error handling pattern should be used

**Testing:**

- [ ] Manual: Various corrupted file scenarios
- [ ] Manual: Missing dependencies and edge cases

---

### Story 1.2.4: Implement Round-Trip Testing

**Status:** ✅ Completed

**Story:** As a developer, I want round-trip testing so I can verify data integrity through read/write cycles.

**Acceptance Criteria:**

- ✅ Read .apkg file and write back to .apkg
- ✅ Verify data integrity after round-trip
- ✅ Test with various Anki package types
- ✅ Automated round-trip test suite

**Implementation Notes:**

- Round-trip tests exist and pass
- Basic data integrity verified
- Multiple package types tested

**Testing:**

- ✅ Automated: Round-trip test suite passes
- ✅ Manual: Data integrity verified

---

### Story 1.2.5: Verify ID Preservation in Round-Trip Conversions

**Status:** ✅ Completed

**Story:** As a developer, I want to ensure all entity IDs are preserved during round-trip conversions so that Anki → SRS → Anki conversions maintain identical IDs throughout the process.

**Acceptance Criteria:**

- ✅ Verify deck IDs remain unchanged after round-trip conversion
- ✅ Verify note IDs remain unchanged after round-trip conversion
- ✅ Verify card IDs remain unchanged after round-trip conversion
- ✅ Verify note type IDs remain unchanged after round-trip conversion
- ✅ Verify review log IDs remain unchanged after round-trip conversion
- ✅ Test ID preservation with multiple round-trip cycles (Anki → SRS → Anki → SRS → Anki)
- ✅ Automated test suite that validates exact ID matches before and after conversion
- ✅ Document ID preservation guarantees in library documentation

**Implementation Notes:**

- **Design Decision**: SRS IDs are always UUIDs (UUIDv7), never numeric strings (see ADR-0003)
- **ID Preservation Strategy**: Original Anki IDs stored in `applicationSpecificData.originalAnkiId` during Anki → SRS conversion
- **Two-Step Resolution**: When converting SRS → Anki, IDs resolved via: (1) originalAnkiId if present, (2) timestamp extraction from UUID
- **Code Refactoring**: Created `resolveAnkiId()` helper function eliminating ~86 lines of duplicate code
- **Helper Function Updates**: `createCompleteDeckStructure()` now supports explicit ID assignment
- **Type Updates**: Added `applicationSpecificData` field to `SrsReview` interface

**Files Modified:**

- `src/anki/anki-package.ts` - Core conversion logic and refactored ID resolution
- `src/srs-package.ts` - Helper functions and type definitions
- `src/anki/anki-package.test.ts` - Test fixes and cleanup

**Testing:**

- ✅ Automated: Multi-cycle round-trip test passes (Anki → SRS → Anki → SRS → Anki)
- ✅ Automated: ID preservation verified for all entity types (140 tests passing)
- ✅ Automated: Edge case IDs tested (very large values)
- ✅ Manual: Code review confirmed no linting or type errors

**Documentation:**

- ✅ Created ADR-0003: "Use applicationSpecificData for ID preservation across formats"
- ✅ Documented in `docs/decisions/0003-use-application-specific-data-for-id-preservation.md`
