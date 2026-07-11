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

**Status:** 🔄 In Progress (4/5 substories completed)

**Story:** As a developer, I want to gracefully handle corrupted and malformed Anki package files so the library provides a good user experience even with problematic files.

This story is broken down into the following substories:

| Substory | Scope             | Status       |
| -------- | ----------------- | ------------ |
| 1.0.5.1  | ZIP validation    | ✅ Completed |
| 1.0.5.2  | Missing files     | ✅ Completed |
| 1.0.5.3  | SQLite corruption | ✅ Completed |
| 1.0.5.4  | JSON validation   | ✅ Completed |
| 1.0.5.5  | Partial recovery  | ⏳ Pending   |

**Recommended order:** 1.0.5.1 → 1.0.5.2 → 1.0.5.4 → 1.0.5.3 → 1.0.5.5

Stories 1-4 can be done independently; Story 5 builds on top of them.

---

### Story 1.0.5.1: Handle Corrupted ZIP Archives

**Status:** ✅ Completed

**Story:** As a developer, I want the library to detect and gracefully handle corrupted, truncated, or invalid ZIP files so users get clear feedback when their package file is damaged.

**Acceptance Criteria:**

- [x] Detect truncated ZIP files (incomplete downloads)
- [x] Detect files that aren't valid ZIP archives (wrong format, binary data)
- [x] Provide specific error message: "The file is not a valid ZIP archive" vs "The ZIP archive is truncated/corrupted"
- [x] Use tri-state error handling with `critical` severity

**Implementation Notes:**

- Enhanced error handling in `AnkiPackage.fromAnkiExport()` with pre-validation:
  - Check file size for empty files (0 bytes)
  - Check ZIP magic bytes (`PK\x03\x04`) to distinguish truncated ZIPs from non-ZIP files
- Specific error messages for each scenario:
  - Empty files: "The file is empty (0 bytes)..."
  - Non-ZIP files: "The file is not a valid ZIP archive..."
  - Truncated ZIPs: "The ZIP archive is truncated or corrupted..."
- All messages include actionable guidance (re-export from Anki)

**Testing:**

- [x] Automated: Test with truncated ZIP file
- [x] Automated: Test with non-ZIP file (e.g., text file renamed to .apkg)
- [x] Automated: Test with empty file
- [x] Automated: Validate error messages are specific and actionable

**Files Modified:**

- `src/anki/anki-package.ts` - Enhanced ZIP validation in `fromAnkiExport()`
- `src/anki/anki-package.test.ts` - Added 5 tests for corrupted ZIP handling

---

### Story 1.0.5.2: Handle Missing Required Files in Package

**Status:** ✅ Completed

**Story:** As a developer, I want the library to detect missing required files inside Anki packages so users understand exactly what's wrong with their export.

**Acceptance Criteria:**

- [x] Detect missing `collection.anki21` database file
- [x] Detect missing `media` mapping file
- [x] Detect missing `meta` version file
- [x] Provide specific error message for each missing file type
- [x] Include guidance on how to re-export from Anki

**Implementation Notes:**

- Added 3-step validation in `AnkiPackage.fromAnkiExport()`:
  1. Check for `meta` file first (required for all Anki exports)
  2. Validate export version (reject unsupported versions early)
  3. Check for remaining required files (`media`, `collection.anki21`)
- Uses `stat()` to check file existence after ZIP extraction
- Specific error messages for each missing file type with re-export instructions
- Note: Only checks for `collection.anki21` (schema version support is Story 1.0.6)

**Testing:**

- [x] Automated: Test with package missing `collection.anki21`
- [x] Automated: Test with package missing `media` file
- [x] Automated: Test with package missing `meta` file
- [x] Automated: Test with empty ZIP archive
- [x] Automated: Test with multiple missing files
- [x] Automated: Test actionable guidance in error messages

**Files Modified:**

- `src/anki/anki-package.ts` - Added file existence checks in `fromAnkiExport()`
- `src/anki/anki-package.test.ts` - Added 6 tests for missing files handling

---

### Story 1.0.5.3: Handle Corrupted SQLite Database

**Status:** ✅ Completed

**Story:** As a developer, I want the library to gracefully handle corrupted or malformed SQLite database files so users get clear feedback when their database is damaged.

**Acceptance Criteria:**

- [x] Detect corrupted SQLite database (invalid header, checksum failures)
- [x] Detect malformed/incomplete database schema (missing required tables)
- [x] Handle empty database files
- [x] Provide specific error messages for each scenario
- [x] Include suggestions (re-export from Anki, check Anki installation)

**Implementation Notes:**

- Added `AnkiDatabaseError` custom error class with typed error categories (`empty`, `truncated`, `invalid_header`, `corrupted`, `missing_tables`)
- Enhanced `AnkiDatabase.fromBuffer()` with 3-stage validation:
  1. Check for empty buffer (0 bytes)
  2. Verify SQLite magic bytes ("SQLite format 3\0" - first 16 bytes)
  3. Catch sql.js errors during database open
- Added `validateSchema()` method to check required tables (col, notes, cards, revlog, graves)
- Updated `AnkiPackage.fromAnkiExport()` with specific error handling for each `AnkiDatabaseError` type
- All error messages include actionable guidance (re-export from Anki)

**Testing:**

- [x] Automated: Test with corrupted database file (random bytes)
- [x] Automated: Test with valid SQLite but missing required tables
- [x] Automated: Test with empty database file
- [x] Automated: Test with truncated database file
- [x] Automated: Test with file too small to be valid SQLite
- [x] Automated: Test actionable guidance in error messages

**Files Modified:**

- `src/anki/database.ts` - Added `AnkiDatabaseError` class, enhanced `fromBuffer()`, added `validateSchema()`
- `src/anki/anki-package.ts` - Added specific database error handling in `fromAnkiExport()`
- `src/anki/anki-package.test.ts` - Added 6 tests for corrupted database handling

---

### Story 1.0.5.4: Handle Invalid JSON in Media Metadata

**Status:** ✅ Completed

**Story:** As a developer, I want the library to handle malformed JSON in the media mapping file so users get clear feedback when media metadata is corrupted.

**Acceptance Criteria:**

- [x] Detect malformed JSON syntax in `media` file
- [x] Detect invalid media mapping structure (wrong types, missing keys)
- [x] Handle empty media file gracefully (valid case - no media)
- [x] Provide clear error message with JSON parse error details

**Implementation Notes:**

- Enhanced `AnkiPackage.fromAnkiExport()` with JSON validation:
  1. Handle empty media file (empty string → treat as `{}`)
  2. Wrap `JSON.parse()` with try-catch for syntax errors
  3. Validate parsed structure is a non-null object (not array)
  4. Validate all values are strings (filenames)
- Specific error messages for each scenario:
  - JSON syntax errors: includes original parse error message
  - Wrong structure: reports actual type (array, null, etc.)
  - Invalid values: reports key and actual value type
- All messages include actionable guidance (re-export from Anki)

**Testing:**

- [x] Automated: Test with malformed JSON (syntax error)
- [x] Automated: Test with wrong JSON structure (array instead of object)
- [x] Automated: Test with empty media file
- [x] Automated: Test with valid empty JSON object `{}`
- [x] Automated: Test with invalid value types (number, null instead of string)
- [x] Automated: Test actionable guidance in error messages

**Files Modified:**

- `src/anki/anki-package.ts` - Enhanced JSON validation in `fromAnkiExport()`
- `src/anki/anki-package.test.ts` - Added 7 tests for invalid JSON handling

---

### Story 1.0.5.5: Support Partial Data Recovery

**Status:** ✅ Completed

**Story:** As a developer, I want the library to support partial data recovery when some data is recoverable so users can extract what's possible from partially corrupted packages.

**Acceptance Criteria:**

- [x] Return `partial` status when non-critical errors occur
- [x] Continue reading valid decks even if some are malformed
- [x] Continue reading valid notes even if some have issues
- [x] Report all issues in `ConversionIssue[]` array
- [x] Respect `errorHandling: "strict" | "best-effort"` option
- [x] Document which errors are recoverable vs critical (see below)

**Implementation Notes:**

Critical (unrecoverable) errors:

- Corrupted/invalid ZIP archive
- Missing required files (database, media mapping, meta)
- Corrupted SQLite database (header invalid, too small)
- Missing required database tables
- Malformed collection JSON structure (outer object broken)

Recoverable errors (skip and continue in best-effort mode):

- Individual deck entries with invalid structure/types
- Individual note type entries with invalid structure/types
- Notes referencing non-existent note types
- Cards referencing non-existent notes or decks
- Reviews referencing non-existent cards
- Missing media files (warning only - files listed but not in archive)

Implementation:

- `AnkiDatabase.toObject()` now validates all items and returns `DatabaseResult<DatabaseDump>` with issues
- `AnkiDatabase.getCollectionWithValidation()` validates decks and note types
- Validation functions: `validateDeckEntry()`, `validateNoteTypeEntry()`, `validateNote()`, `validateCard()`, `validateReview()`
- Validation cascade: invalid notes → orphaned cards → orphaned reviews
- Media file existence validated in `AnkiPackage.fromAnkiExport()`
- `IssueCollector` handles strict/best-effort logic via `createResult()`

**Testing:**

- [x] Automated: Test recovery with some valid and some invalid notes
- [x] Automated: Test `strict` mode fails on recoverable errors
- [x] Automated: Test `best-effort` mode returns partial results
- [x] Automated: Verify all issues are reported in result
- [x] Automated: Test missing media file warnings
- [x] Automated: Test cards with non-existent deck references
- [x] Automated: Test reviews with non-existent card references

**Files Modified:**

- `src/anki/database.ts` - Added `DatabaseResult`, validation functions, `getCollectionWithValidation()`, updated `toObject()`
- `src/anki/anki-package.ts` - Added media file validation in `fromAnkiExport()`
- `src/error-handling.ts` - Added `noteType` and `media` to item types
- `src/anki/database.test.ts` - Updated tests for new `toObject()` return type
- `src/anki/anki-package.test.ts` - Added 8 tests for partial recovery scenarios

**Dependencies:** Stories 1.0.5.1, 1.0.5.2, 1.0.5.3, 1.0.5.4

---

### Story 1.0.6: Support Reading Legacy 1 Packages (collection.anki2)

**Status:** ⏳ Pending

**Story:** As a developer, I want to read Legacy 1 packages (`collection.anki2`, exports from Anki 2.0 / very old clients) so the library covers the full range of legacy exports.

> [!note]
> Rescoped 2026-07-11: package version detection now lives in Story 1.3.1, and modern (package v3 / schema 18) support is Phase 1.3. This story retains only the Legacy 1 remainder.

**Acceptance Criteria:**

- [ ] Read `collection.anki2` when detection (Story 1.3.1) reports Legacy 1
- [ ] Document any Legacy 1 vs Legacy 2 data differences encountered (both are schema 11; differences are client-era conventions, e.g. scheduler v1 leftovers)
- [ ] Test with a real Anki 2.0-era package

**Implementation Notes:**

- Depends on Story 1.3.1 (version detection)
- Both legacy variants are schema 11 — expect this to be mostly a file-name dispatch plus tolerant parsing

**Testing:**

- [ ] Manual: Test with Anki v2.0 packages
- [ ] Automated: Legacy 1 fixture coverage

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

### Story 1.1.5: Preserve Plugin Data in Direct Anki Read/Write

**Status:** ✅ Completed

**Story:** As a developer, I want plugin data preserved when reading and writing Anki packages directly (without SRS conversion) so that plugin functionality isn't lost.

**Acceptance Criteria:**

- ✅ Preserve the `data` field on notes (used by add-ons for custom data)
- ✅ Preserve the `data` field on cards (used by add-ons for custom data)
- ✅ Preserve plugin configurations in collection `conf` field via JSON serialization
- ✅ Export complete database contents without filtering plugin data

**Implementation Notes:**

- Direct Anki read/write fully preserves plugin data fields (database.ts:183-187, 92-100)
- The `data` field on notes and cards is preserved via `selectAll()` and complete insertion
- Collection configuration preserved via JSON serialization (database.ts:85-90)
- All database fields exported without filtering - plugin data flows through transparently

**Testing:**

- ✅ Automated: Round-trip tests verify database preservation

---

### Story 1.1.5.1: Restore Plugin Data During SRS Round-Trip Conversion

**Status:** ✅ Completed

**Story:** As a developer, I want plugin data restored during SRS → Anki conversion so that Anki → SRS → Anki round-trips preserve plugin-specific data.

**Acceptance Criteria:**

- ✅ Store note `data` field as `applicationSpecificData.ankiData` during Anki → SRS conversion
- ✅ Store card `data` field as `applicationSpecificData.ankiData` during Anki → SRS conversion
- ✅ Restore note `data` field from `applicationSpecificData.ankiData` during SRS → Anki conversion
- ✅ Restore card `data` field from `applicationSpecificData.ankiData` during SRS → Anki conversion
- ✅ Handle missing `ankiData` gracefully (default to empty/`"{}"`)
- ✅ Verify round-trip conversion preserves plugin data

**Implementation Notes:**

- **Bug Fixed**: Plugin data now stored directly in `applicationSpecificData.ankiData` field
- During Anki → SRS conversion: Store `data` field directly as `ankiData` (anki-package.ts:1153, 1187)
- During SRS → Anki conversion: Restore directly from `ankiData` (anki-package.ts:463, 609)
- Gracefully handles missing data with default values ("" for notes, "{}" for cards)
- Simple implementation using optional chaining: `?.["ankiData"] ?? defaultValue`

**Testing:**

- ✅ Automated: Round-trip test verifies plugin data preservation (anki-package.test.ts:3201-3376)
- ✅ Automated: Test creates notes/cards with real plugin data and verifies preservation
- ✅ Automated: Edge cases handled via optional chaining with fallback defaults

**Files Modified:**

- `src/anki/anki-package.ts` - Direct storage and retrieval of plugin data field
- `src/anki/anki-package.test.ts` - Added comprehensive round-trip test
- `docs/stories/phase-1.md` - Story split and updated
- `docs/stories/README.md` - Progress updated to 9/11 (82%)

---

### Story 1.1.5.2: Document Plugin Data Handling and Limitations

**Status:** ✅ Completed

**Story:** As a developer, I want clear documentation about plugin data handling so users understand limitations and can troubleshoot issues.

**Acceptance Criteria:**

- ✅ Document which fields store plugin data (`data` on notes/cards, collection `conf`)
- ✅ Document that plugin data is preserved in round-trip conversions
- ✅ Document limitations of plugin data portability between systems
- ✅ Document that plugin functionality requires the original plugin to be installed
- ✅ Add examples of plugin data preservation in usage docs

**Implementation Notes:**

- Added concise plugin data section to `docs/usage/reading/anki/README.md` covering:
  - Which fields store plugin data and how it's preserved
  - Direct Anki operations vs round-trip conversions
  - Important limitations (requires original add-on, not validated, portability concerns)
- Added plugin data preservation section to `docs/usage/converting/anki-to-srs.md`:
  - Explanation of how `data` field is stored in `applicationSpecificData.ankiData`
  - Working code example showing preservation in Anki → SRS → Anki conversion
- Added plugin data restoration section to `docs/usage/converting/srs-to-anki.md`:
  - Explanation of how `ankiData` is restored to `data` field
  - Code example showing how to create SRS packages with plugin data
- All documentation examples are backed by automated tests

**Testing:**

- ✅ Automated: Plugin data preservation test in `docs/usage/converting/anki-to-srs.test.ts`
- ✅ Automated: All quality gates pass (type-check, format, lint, test)
- ✅ Manual: Documentation is concise and cross-referenced

**Files Modified:**

- `docs/usage/reading/anki/README.md` - Added plugin data handling section
- `docs/usage/converting/anki-to-srs.md` - Added plugin data preservation section with example
- `docs/usage/converting/srs-to-anki.md` - Added plugin data restoration section with example
- `docs/usage/converting/anki-to-srs.test.ts` - Added comprehensive round-trip test
- `docs/stories/phase-1.md` - Story updated to completed status

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

**Status:** ✅ Completed

**Story:** As a developer, I want to add media files to Anki packages so applications can create packages with custom media content.

**Acceptance Criteria:**

- ✅ Implement API to add media files to packages during creation
- ✅ Support adding files from file paths, buffers, or streams
- ✅ Automatically generate media file mappings
- ✅ Update media database entries when files are added

**Implementation Notes:**

- Implemented `addMediaFile(filename, source)` method in `AnkiPackage` class (src/anki/anki-package.ts:877-925)
- Accepts three source types: file path (string), Buffer, or Readable stream
- Validates filename uniqueness - throws error if duplicate detected
- Generates sequential numeric media IDs starting from next available ID
- Automatically updates `this.mediaFiles` mapping
- Enhanced `toAnkiExport()` to include all media files in zip (src/anki/anki-package.ts:714-720)
- Built on existing media metadata writing (Story 1.1.2)
- Fully integrated with package writing pipeline

**Testing:**

- ✅ Manual: Verified with project maintainer
- ✅ Automated: 8 comprehensive tests covering all acceptance criteria (src/anki/anki-package.test.ts:1254-1437)
  - Adding files from paths, buffers, and streams
  - Duplicate filename error handling
  - Invalid source error handling
  - Sequential ID generation
  - Export/import round-trip verification
  - Working with packages that already have media
- ✅ Documentation: Examples added to usage guide with automated tests (docs/usage/creating/anki/raw-anki-methods.md)

**Files Modified:**

- `src/anki/anki-package.ts` - Added `addMediaFile()` method and enhanced export
- `src/anki/anki-package.test.ts` - Added comprehensive test suite
- `docs/usage/creating/anki/raw-anki-methods.md` - Added usage documentation
- `docs/usage/creating/anki/raw-anki-methods.test.ts` - Added documentation example test
- `docs/usage/exporting/anki/README.md` - Added reference to raw-anki-methods guide
- `tests/fixtures/media/` - Added test fixtures (image.png, audio.mp3, video.mp4)
- `README.md` - Updated media files support status to "Full"

---

### Story 1.1.6.3: Add User-Facing API for Removing Media Files

**Status:** ✅ Completed

**Story:** As a developer, I want to remove media files from Anki packages so applications can update or clean up media content.

**Acceptance Criteria:**

- ✅ Implement `removeMediaFile(filename)` method to remove individual files
- ✅ Throw error if attempting to remove a non-existent file
- ✅ Remove media file from disk (temp directory)
- ✅ Update media file mappings when files are removed
- ✅ Verify removed files are not included in exported packages
- ✅ Support removing files from packages that were loaded (not just created)

**Implementation Notes:**

- Implemented `removeMediaFile(filename)` method in `AnkiPackage` class (src/anki/anki-package.ts:938-973)
- Removes both physical file from temp directory using `rm()` and updates media mapping
- Uses `Object.fromEntries` and `filter` to remove mapping entry (avoiding dynamic delete for lint compliance)
- Validates file existence before removal - throws clear error if file doesn't exist
- Fully integrated with package writing pipeline - removed files automatically excluded from exports
- Built on existing media file management from Stories 1.1.6.1 and 1.1.6.2
- Design decision: Remove silently without warning about note references (user responsibility to manage references)

**Testing:**

- ✅ Automated: 8 comprehensive tests covering all acceptance criteria (src/anki/anki-package.test.ts:1437-1648)
  - Basic removal of existing files
  - Error handling for non-existent files
  - Verification of file removal from disk
  - Export/import round-trip verification (removed files not in exports)
  - Removal from loaded packages (not just created ones)
  - Multiple file removal scenarios
  - Removing same file twice error handling
  - Remove and re-add same filename workflow
- ✅ Documentation: Usage examples added with automated tests (docs/usage/creating/anki/raw-anki-methods.md)

**Files Modified:**

- `src/anki/anki-package.ts` - Added `removeMediaFile()` method
- `src/anki/anki-package.test.ts` - Added comprehensive test suite
- `docs/usage/creating/anki/raw-anki-methods.md` - Added usage documentation
- `docs/usage/creating/anki/raw-anki-methods.test.ts` - Added documentation example test

---

### Story 1.1.6.4: Add API for Removing Unreferenced Media Files

**Status:** ✅ Completed

**Story:** As a developer, I want to remove media files that are not referenced by any notes so applications can clean up unused media and reduce package size.

**Acceptance Criteria:**

- ✅ Implement `removeUnreferencedMediaFiles()` method to identify and remove unused files
- ✅ Scan all notes to find media file references in field content
- ✅ Return list of removed filenames
- ✅ Handle various media reference formats (e.g., `<img src="file.png">`, `[sound:audio.mp3]`)
- ❌ Provide dry-run option to preview what would be removed without actually removing (not implemented per user request)

**Implementation Notes:**

- Implemented `removeUnreferencedMediaFiles()` method in `AnkiPackage` class (src/anki/anki-package.ts:989-1033)
- Uses regex pattern to detect media references: `/<img[^>]+src=["']?([^"'>\s]+)["']?|\[sound:([^\]]+)\]/gi`
- Note: Anki uses `[sound:]` syntax for both audio and video files
- Regex pattern is documented as easily modifiable if additional formats are discovered
- Scans all notes and all fields within each note
- Returns array of removed filenames
- Built on existing `removeMediaFile()` method from Story 1.1.6.3

**Testing:**

- ✅ Automated: 10 comprehensive tests in src/anki/anki-package.test.ts covering:
  - Basic removal of unreferenced files
  - Keeping files referenced in img tags (with/without quotes, single/double quotes)
  - Keeping files referenced in sound tags (audio)
  - Keeping video files referenced via sound tags (Anki uses [sound:] for both)
  - Handling packages with no unreferenced files
  - Handling packages with no media files
  - Removing all files when none are referenced
  - Scanning all note fields
  - Complex HTML with multiple references
  - Error handling for unavailable database
- ✅ Documentation: Usage example in docs/usage/creating/anki/raw-anki-methods.md
- ✅ Documentation: Automated test for documentation example in docs/usage/creating/anki/raw-anki-methods.test.ts

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

---

## Phase 1.3: Modern Anki Support (Package v3 / Schema 18)

Read and write support for Anki's current export format (`collection.anki21b`, zstd, protobuf blobs), per ADR-0013…0016. Reference material: `docs/formats/anki.md` (§Modern Schema, §Pinned wire-format spec) and `docs/formats/anki-schema-mapping.md`. Suggested order is story order; 1.3.11 is independent and can run any time.

### Story 1.3.1: Package Version Detection and Friendly Errors

**Status:** ⏳ Pending

**Story:** As a user, I want the library to recognize which Anki package version I gave it and tell me clearly when it can't handle it yet, instead of a misleading "missing collection.anki21" error.

**Acceptance Criteria:**

- [ ] Implement the detection algorithm from `docs/formats/anki.md` §Package v3 container layout: decode `meta` (protobuf `PackageMetadata`) when present; fall back to file-presence rules when absent
- [ ] Version 3 packages produce a clear error naming the format and the workaround (re-export with "Support older Anki versions") — until Phase 1.3 lands fully
- [ ] Unknown/version-0 `meta` produces a "package too new" error
- [ ] Legacy 1 vs Legacy 2 correctly distinguished (enables Story 1.0.6)
- [ ] Existing Legacy 2 behavior unchanged

**Implementation Notes:**

- The `meta` decode needs only `PackageMetadata` (a single varint field) — hand-roll it here; it becomes the first piece of the ADR-0013 codec
- Replaces the misleading error path at the `collection.anki21` existence check in `src/anki/anki-package.ts`
- Ships alone as an immediate UX improvement

**Testing:**

- [ ] Automated: fixtures for v3, legacy 1, legacy 2, missing meta, garbage meta

---

### Story 1.3.2: Anki-Generated Fixture Corpus

**Status:** ⏳ Pending

**Story:** As a developer, I want test fixtures generated by real Anki (not hand-built) so reader, writer, codec, and conversion tests are verified against ground truth.

**Acceptance Criteria:**

- [ ] Python generator script builds one deterministic collection and exports it as: Legacy 2 `.apkg`, v3 `.apkg` (with and without scheduling), v3 `.colpkg`
- [ ] Coverage: stock note types (Basic, Basic+Reversed, Typing, Cloze, Image Occlusion), subdeck hierarchy, filtered deck, ≥2 deck presets with FSRS params (4/5/6) and per-deck `desiredRetention`, media (image + audio), hierarchical tags, review history covering revlog types 0–5 (incl. seconds-encoded intervals and manual reschedule), `cards.data` FSRS state, suspended/buried cards, add-on data in at least one `other` blob
- [ ] Script also dumps unit-level artifacts: decompressed `collection.anki21b`, individual entity config blobs, raw media manifest
- [ ] Companion verify script: imports a given `.apkg`/`.colpkg` into a fresh collection and asserts note guids, scheduling state, and media checksums (used by Story 1.3.10)
- [ ] Generated fixtures committed; regeneration documented and semantically stable (byte-stability not required — zip/zstd metadata may vary)

**Implementation Notes:**

- Use Anki's own Python bindings (`anki` on PyPI, pinned to the release matching tag 26.05 — verify exact PyPI version string) — the real Rust core, so fixtures are reference-implementation output
- Single-file script with inline dependency metadata (PEP 723, `uv run`) keeps Python out of the main toolchain; document the invocation in the script header
- Determinism: fix the collection creation stamp and set entity ids/mtimes explicitly after creation
- Suggested location: `scripts/anki-fixtures/` for the generator, fixtures next to the existing Anki tests

**Testing:**

- [ ] Automated: fixture regeneration in CI (or documented manual step) + checksum/content sanity assertions

---

### Story 1.3.3: Protobuf Wire Codec (ADR-0013)

**Status:** ⏳ Pending

**Story:** As a developer, I want a minimal hand-rolled protobuf encoder/decoder for the pinned Anki messages so modern blobs can be read and written without AGPL-derived code or new dependencies.

**Acceptance Criteria:**

- [ ] Decode + encode for every message in `docs/formats/anki.md` §Pinned wire-format spec (`PackageMetadata`, `MediaEntries`, notetype/field/template configs, `Deck.Common`/`KindContainer`, `DeckConfig.Config`)
- [ ] Unknown-field passthrough: unmodeled field numbers survive decode→encode byte-safely (covers `other = 255` and future Anki fields)
- [ ] Proto3 semantics: defaults omitted on encode, explicit-presence (`optional`) fields tracked, unknown enum values preserved as numbers, packed repeated scalars supported
- [ ] Decoded-JSON shape per ADR-0016: snake_case proto names, enums as numbers, bytes as base64, reserved key for unparsed bytes

**Implementation Notes:**

- Written against the field tables only — never copy proto text (ADR-0013 licensing invariant)
- Unit-test against the real blobs dumped by Story 1.3.2, including one with add-on `other` data

**Testing:**

- [ ] Automated: decode→encode→decode round-trips on all fixture blobs
- [ ] Automated: synthetic unknown-field and unknown-enum cases

---

### Story 1.3.4: Read Schema-18 Collections

**Status:** ⏳ Pending

**Story:** As a user, I want to open modern Anki exports directly so current-Anki `.apkg`/`.colpkg` files work without the compatibility checkbox.

**Acceptance Criteria:**

- [ ] `engines.node` raised to `>=22.15.0`; zstd helpers over `node:zlib` (streaming for the collection file, buffers elsewhere) (ADR-0014)
- [ ] v3 packages: decompress `collection.anki21b`, read split tables (`notetypes`/`fields`/`templates`/`decks`/`deck_config`/`config`/`tags`), decode blobs via the 1.3.3 codec
- [ ] Deck names converted from `\x1f` separators to `::` form on read
- [ ] Entities normalize into the same internal representation the legacy reader produces — everything downstream of the reader untouched
- [ ] `applicationSpecificData` blobs stored in native form with schema marker (ADR-0016); `col`-level data (`config` rows, `tags` rows) captured equivalently to today's `ankiCol` handling
- [ ] Differential test: legacy and v3 exports of the same fixture collection parse to equivalent `SrsPackage`s

**Implementation Notes:**

- Reading rows via sql.js is unaffected by the `unicase` collation (reads don't invoke it) — the collation problem belongs to the writer story
- Remember `col.models/decks/dconf/conf/tags` are empty strings at schema 18 — don't `JSON.parse` unconditionally

**Testing:**

- [ ] Automated: full fixture parse + differential suite
- [ ] Automated: corrupted/truncated zstd stream error handling

---

### Story 1.3.5: Read Modern Media

**Status:** ⏳ Pending

**Story:** As a user, I want media from modern packages extracted correctly so images and audio survive conversion.

**Acceptance Criteria:**

- [ ] Decode zstd-compressed `MediaEntries` manifest; map entry index → zip entry name
- [ ] Decompress individual media files; verify size and sha1 against the manifest (mismatch → tri-state error report, not silent acceptance)
- [ ] Missing `media` entry tolerated as empty (old AnkiDroid compat)
- [ ] Filenames validated with the same safety rules Anki applies (NFC, single path component)

**Testing:**

- [ ] Automated: fixture media round-trip incl. checksum verification and a tampered-checksum case

---

### Story 1.3.6: Schema 11 ↔ Proto Conversion Functions

**Status:** ⏳ Pending

**Story:** As a developer, I want the two conversion functions (proto→11, 11→proto) implemented per the mapping doc so writers can consume blobs from either source schema.

**Acceptance Criteria:**

- [ ] Implement every mapping table in `docs/formats/anki-schema-mapping.md`, including the post-11 keys, unknown-key passthrough with reserved-key stripping, and nested `new`/`rev`/`lapse` handling
- [ ] All 12 items on the mapping doc's gotchas checklist covered by explicit tests (swapped `new.order`, inverted `autoplay`/`replayq`, percent-vs-float `desiredRetention`, `\x1f` names, permille `initialFactor`, today-counter collapse, …)
- [ ] Loss inventory enforced: same-schema identity modulo documented losses, nothing more (property test over fixture entities)

**Implementation Notes:**

- Pure functions over the blob JSON dialects — no I/O; usable by both writers
- Differential oracle: fixture pairs from Story 1.3.2 (same collection, both formats) must convert into each other within the documented loss set

**Testing:**

- [ ] Automated: per-table unit tests + fixture-pair differential tests

---

### Story 1.3.7: Legacy Writer Accepts Modern-Sourced Packages

**Status:** ⏳ Pending

**Story:** As a user, I want a package read from a modern export to write out as valid Legacy 2 so I can target older Anki versions from any source.

**Acceptance Criteria:**

- [ ] `fromSrsPackage` overlay logic branches on the ADR-0016 schema marker: passthrough for schema-11 blobs (existing path untouched), proto→11 conversion (Story 1.3.6) for modern-sourced blobs
- [ ] Modern-sourced `col`-level data (config rows, tags) down-converted to `col.conf`/`col.tags` JSON
- [ ] Round-trip: v3 fixture → `SrsPackage` → Legacy 2 `.apkg` imports cleanly into real Anki (verify script from 1.3.2), preserving guids, scheduling, FSRS state, media

**Testing:**

- [ ] Automated: existing legacy round-trip suite still green (no regression)
- [ ] Automated: modern→legacy crossing asserts exactly the documented loss set

---

### Story 1.3.8: Write Schema-18 Packages

**Status:** ⏳ Pending

**Story:** As a user, I want the library to produce modern `.apkg` files so my exports match what current Anki produces and keep full FSRS/preset fidelity.

**Acceptance Criteria:**

- [ ] Resolve the `unicase` collation question first (spike): register a substitute collation in sql.js or an equivalent strategy — schema-18 DDL has unicase-collated unique indexes that inserts must maintain (see `docs/formats/anki.md` §Schema-18 DDL ⚠️)
- [ ] Create schema-18 database: full DDL, `col.ver = 18`, legacy col columns set to `''`, deck names with `\x1f` separators
- [ ] Encode entity blobs via codec (passthrough for modern-sourced, 11→proto via Story 1.3.6 for legacy-sourced)
- [ ] Package layout per pinned spec: `meta` (version 3), zstd `collection.anki21b`, dummy `collection.anki2`, zstd `MediaEntries` manifest + individually compressed media with mandatory sha1, zip entries stored
- [ ] Output satisfies every importer-validation rule in the pinned spec (integrity check, NFC-safe media names, 20-byte sha1)

**Implementation Notes:**

- Mirror Anki's own writer choices (documented in the pinned spec) wherever the importer allows freedom — least surprise for downstream tools
- The dummy `collection.anki2` needs one Basic note with a "collection too new" message (any reasonable text; Anki's is localized)

**Testing:**

- [ ] Automated: our v3 output re-read by our own reader equals input (modern→modern lossless per ADR-0016)
- [ ] Automated: real-Anki import via verify script (also covered by 1.3.10 in CI)

---

### Story 1.3.9: Make Modern the Default Output

**Status:** ⏳ Pending

**Story:** As a user, I want modern output by default — matching current Anki — with Legacy 2 behind an explicit option.

**Acceptance Criteria:**

- [ ] Export API gains a target option (name TBD in implementation, mirroring Anki's "Support older Anki versions" semantics); default = modern (ADR-0015)
- [ ] Breaking change shipped in a major release together with the engines bump; changelog + migration note
- [ ] `README.md` and `docs/usage/` updated (formats supported, default behavior, option example)

**Testing:**

- [ ] Automated: default-path and option-path both covered
- [ ] Manual: maintainer verification of docs and migration note

---

### Story 1.3.10: CI Round-Trip Verification Against Real Anki

**Status:** ⏳ Pending

**Story:** As a maintainer, I want CI to prove our outputs import into real Anki so format regressions are caught before release.

**Acceptance Criteria:**

- [ ] CI job runs the 1.3.2 verify script against our Legacy 2 and v3 outputs (four-direction matrix per ADR-0016 confirmation: legacy→legacy, modern→modern, legacy→modern, modern→legacy)
- [ ] Asserts guids, scheduling state, FSRS `cards.data`, deck presets, media checksums
- [ ] Pinned Anki version in CI matches the pinned spec tag; bumping it is a deliberate, reviewed change

**Testing:**

- [ ] Automated: the CI job itself (green on main, red on injected regression during development)

---

### Story 1.3.11: Model cards.data FSRS State (Independent)

**Status:** ⏳ Pending

**Story:** As a developer, I want per-card FSRS state (`cards.data` JSON: `pos`, `s`, `d`, `dr`, `decay`, `lrt`, `cd`) modeled instead of passed through opaquely, so FSRS memory state becomes first-class in conversions.

**Acceptance Criteria:**

- [ ] Parse `cards.data` on read (legacy and modern — the column is identical in both), exposing typed FSRS state
- [ ] Preserve unknown keys and the ≤100-byte `cd` (custom_data) constraint on write
- [ ] Round-trip: parsed state re-serializes equivalently

**Implementation Notes:**

- Independent of the rest of Phase 1.3 — the column exists in the legacy files the library already reads; flagged as the "cheapest high-value step" in `docs/formats/anki.md`
- Where this surfaces in the universal model is Phase 5 territory (ADR-0004 scheduling discussions); this story only makes the Anki side typed

**Testing:**

- [ ] Automated: fixtures with FSRS state (from Story 1.3.2) parse and round-trip
