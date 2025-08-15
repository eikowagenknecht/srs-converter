# srs-converter - Development Stories

> [!important]
> This document is a work in progress and may be incomplete or inaccurate.
> AI was involved in the initial drafting of this document, so there may be errors or inconsistencies.
>
> We will thoroughly review and update this document before implementing stories.

## Overview

This document outlines the current development roadmap for the srs-converter library, from completing format-specific I/O implementations through universal format design and cross-format conversion capabilities.

## Story Status Legend

- ⏳ Pending - Not started
- 🔄 In Progress - Currently being worked on  
- ✅ Completed - Implemented and verified
- 🧪 Testing - Implementation complete, awaiting verification

## Phase Progress & Success Criteria

- **Phase 1.0**: Complete Anki reading (.apkg/.colpkg) with all features and edge cases
  - Progress: 2/4 stories completed (50%) 🔄
  - Status: Anki reading mostly works, but needs completion for complex features and full test coverage

- **Phase 1.1**: Complete Anki writing with full feature support and compatibility
  - Progress: 0/4 stories completed (0%) ⏳
  - Status: Basic writing exists but needs comprehensive implementation

- **Phase 1.1.5**: Add user-facing media file APIs for reading and writing actual files
  - Progress: 0/3 stories completed (0%) ⏳
  - Status: Currently only metadata is handled - need APIs for actual file operations

- **Phase 1.2**: Achieve 100% test coverage and handle all Anki edge cases
  - Progress: 1/4 stories completed (25%) 🔄
  - Status: Round-trip tests pass, but comprehensive coverage needed

- **Phase 2.0**: Mnemosyne format reading implementation
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 2.1**: Mnemosyne format writing implementation  
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 3.0**: Mochi format reading implementation
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 3.1**: Mochi format writing implementation  
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 4.0**: SuperMemo format reading implementation
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 4.1**: SuperMemo format writing implementation
  - Progress: 0/4 stories completed (0%) ⏳

- **Phase 5.0**: Universal format specification based on multi-format analysis
  - Progress: 0/5 stories completed (0%) ⏳

- **Phase 6.0**: Cross-format conversion layer implementation
  - Progress: 0/5 stories completed (0%) ⏳

---

## Phase 1: Anki Format I/O (Complete Implementation)

### Phase 1.0: Anki Reading (.apkg/.colpkg)

#### Story 1.0.1: Complete Basic Anki Package Reading

**Status:** 🔄 In Progress (Mostly Complete)

**Story:** As a developer, I want to read all basic components from Anki packages so the library can access decks, notes, cards, and note types reliably.

**Acceptance Criteria:**

- ✅ Successfully read .apkg and .colpkg files
- ✅ Extract all decks with names and configuration
- ✅ Extract all notes with field values and timestamps
- ✅ Extract all cards with scheduling information
- ✅ Extract all note types with fields and templates
- ⏳ Handle malformed or corrupted package files gracefully
- ⏳ Support both Anki v2.0 and v2.1 database schemas

**Implementation Notes:**

- Core reading functionality exists in `src/anki/anki-package.ts`
- Database queries work for basic schema
- Need to verify support for all Anki schema versions

**Testing:**

- ✅ Manual: Basic .apkg reading works
- ⏳ Automated: Comprehensive test suite for all package types
- ⏳ Edge Cases: Corrupted files, empty packages, various schema versions

---

#### Story 1.0.2: Add Anki Media File Metadata Reading

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

#### Story 1.0.3: Handle Anki Review History and Scheduling Data

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

#### Story 1.0.4: Support All Anki Note Types

**Status:** ⏳ Pending

**Story:** As a developer, I want to read all Anki note types so the library can handle Basic, Cloze, Image Occlusion, and custom note types.

**Acceptance Criteria:**

- [ ] Read Basic note types with front/back templates
- [ ] Read Cloze deletion note types with cloze templates  
- [ ] Read Image Occlusion note types with occlusion data
- [ ] Read custom user-defined note types
- [ ] Handle complex template rendering and CSS
- [ ] Preserve note type configuration and styling

**Implementation Notes:**

- Basic note types work
- Need to implement Cloze and Image Occlusion parsing
- Template rendering not fully implemented

**Testing:**

- [ ] Manual: Test with various Anki note type examples
- [ ] Automated: Note type parsing test suite

---

### Phase 1.1: Anki Writing (.apkg/.colpkg)

#### Story 1.1.1: Implement Basic Anki Package Writing

**Status:** ⏳ Pending

**Story:** As a developer, I want to write basic Anki packages so the library can export decks, notes, cards, and note types.

**Acceptance Criteria:**

- [ ] Create valid .apkg files with proper structure
- [ ] Write decks with correct configuration
- [ ] Write notes with all field values
- [ ] Write cards with proper scheduling data
- [ ] Write note types with templates and configuration
- [ ] Generate valid Anki database schema

**Implementation Notes:**

- Basic writing structure exists but incomplete
- Need to implement full database creation
- Must match Anki's expected schema exactly

**Testing:**

- [ ] Manual: Generated .apkg files open in Anki
- [ ] Automated: Database schema validation

---

#### Story 1.1.2: Add Anki Media File Metadata Writing

**Status:** ⏳ Pending

**Story:** As a developer, I want to write media file metadata to Anki packages so exported packages preserve media references.

**Acceptance Criteria:**

- [ ] Write media file references to package metadata
- [ ] Create proper media mapping files (media.db)
- [ ] Generate media directory structure references
- [ ] Handle various media file type metadata
- [ ] Preserve media file organization in metadata

**Implementation Notes:**

- Need to implement media metadata packaging
- Must create media.db and maintain file mappings
- Handle media file reference deduplication
- No actual file content handling - metadata only

**Testing:**

- [ ] Manual: Media metadata preserved in exported packages
- [ ] Manual: Various media type references handled

---

#### Story 1.1.3: Write Anki Review History and Scheduling Data

**Status:** ⏳ Pending

**Story:** As a developer, I want to write review history so exported packages preserve learning progress.

**Acceptance Criteria:**

- [ ] Write complete review logs with correct timestamps
- [ ] Write card scheduling information (due dates, intervals, ease)
- [ ] Maintain review score accuracy
- [ ] Support different Anki scheduling algorithms
- [ ] Preserve review timing data

**Implementation Notes:**

- Review writing not implemented
- Need to populate revlog table correctly
- Must handle different Anki versions

**Testing:**

- [ ] Manual: Review history preserved after Anki import
- [ ] Manual: Card scheduling works correctly in Anki

---

#### Story 1.1.4: Support Complex Anki Features in Export

**Status:** ⏳ Pending

**Story:** As a developer, I want to export complex Anki features so the library supports advanced use cases.

**Acceptance Criteria:**

- [ ] Export Cloze deletion cards with proper formatting
- [ ] Export Image Occlusion cards with occlusion data
- [ ] Export custom note types with styling
- [ ] Export deck configuration and options
- [ ] Export plugin data where possible
- [ ] Handle advanced template features

**Implementation Notes:**

- Complex features not fully supported in export
- Need Cloze and Image Occlusion export logic
- Template rendering must be complete

**Testing:**

- [ ] Manual: Complex cards work correctly in Anki
- [ ] Manual: Advanced features preserved

---

### Phase 1.1.5: Anki Media File API Support

#### Story 1.1.5.1: Add User-Facing API for Retrieving Media Files

**Status:** ⏳ Pending

**Story:** As a developer, I want to retrieve actual media files from Anki packages so applications can access images, audio, and other media content.

**Acceptance Criteria:**

- [ ] Implement API to extract actual media files from packages
- [ ] Support streaming large media files without loading entire file into memory
- [ ] Provide file metadata (size, type, checksum) along with file content
- [ ] Handle various media file types (images, audio, video, documents)
- [ ] Return media files as readable streams or buffers
- [ ] Implement efficient media file caching for repeated access

**Implementation Notes:**

- Build on existing media metadata reading (Story 1.0.2)
- Use streaming APIs for large files
- Consider memory-efficient access patterns
- Integrate with existing media reference tracking

**Testing:**

- [ ] Manual: Extract various media file types
- [ ] Performance: Large media file handling
- [ ] Unit: Media file API validation

---

#### Story 1.1.5.2: Add User-Facing API for Adding Media Files

**Status:** ⏳ Pending

**Story:** As a developer, I want to add media files to Anki packages so applications can create packages with custom media content.

**Acceptance Criteria:**

- [ ] Implement API to add media files to packages during creation
- [ ] Support adding files from file paths, buffers, or streams
- [ ] Automatically generate media file mappings and checksums
- [ ] Handle media file deduplication based on content checksums
- [ ] Validate media file types and sizes
- [ ] Update media database entries when files are added

**Implementation Notes:**

- Build on existing media metadata writing (Story 1.1.2)
- Implement content-based deduplication
- Handle various input sources (files, buffers, streams)
- Integrate with package writing pipeline

**Testing:**

- [ ] Manual: Add various media file types
- [ ] Manual: Test deduplication logic
- [ ] Unit: Media addition API validation

---

#### Story 1.1.5.3: Implement Media File Management and Utilities

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

### Phase 1.2: Anki Testing and Edge Cases

#### Story 1.2.1: Achieve 100% Test Coverage for Anki Reading

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

#### Story 1.2.2: Achieve 100% Test Coverage for Anki Writing

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

#### Story 1.2.3: Handle Anki Edge Cases and Error Conditions

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

#### Story 1.2.4: Implement Round-Trip Testing

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

## Phase 2: Mnemosyne Format I/O

### Phase 2.0: Mnemosyne Reading

#### Story 2.0.1: Research Mnemosyne Data Format and Structure

**Status:** ⏳ Pending

**Story:** As a developer, I want to understand Mnemosyne's data format so I can implement accurate reading support.

**Acceptance Criteria:**

- [ ] Document Mnemosyne file format specification
- [ ] Identify supported file extensions and structure
- [ ] Understand Mnemosyne's database schema
- [ ] Document scheduling algorithm differences
- [ ] Identify unique Mnemosyne features
- [ ] Create format comparison with Anki

**Implementation Notes:**

- Mnemosyne format research needed
- Create documentation in `docs/formats/mnemosyne.md`
- Compare with existing Anki knowledge

**Testing:**

- [ ] Manual: Document findings with real Mnemosyne files

---

#### Story 2.0.2: Implement Basic Mnemosyne Package Reading

**Status:** ⏳ Pending

**Story:** As a developer, I want to read Mnemosyne packages so the library can access Mnemosyne decks and cards.

**Acceptance Criteria:**

- [ ] Read Mnemosyne database files
- [ ] Extract cards with front/back content  
- [ ] Extract scheduling information
- [ ] Handle Mnemosyne-specific metadata
- [ ] Create Mnemosyne TypeScript interfaces
- [ ] Implement error handling for Mnemosyne files

**Implementation Notes:**

- Create `src/mnemosyne/` directory structure
- Follow similar pattern to Anki implementation
- Define Mnemosyne-specific interfaces

**Testing:**

- [ ] Manual: Basic Mnemosyne file reading
- [ ] Unit: Mnemosyne interface validation

---

#### Story 2.0.3: Handle Mnemosyne-Specific Features and Metadata

**Status:** ⏳ Pending

**Story:** As a developer, I want to handle Mnemosyne-specific features so the library preserves all Mnemosyne functionality.

**Acceptance Criteria:**

- [ ] Handle Mnemosyne learning modes
- [ ] Extract Mnemosyne statistics
- [ ] Handle Mnemosyne card types
- [ ] Preserve Mnemosyne scheduling data
- [ ] Handle Mnemosyne categories/tags
- [ ] Extract Mnemosyne configuration

**Implementation Notes:**

- Research unique Mnemosyne features
- Implement feature-specific handlers
- Preserve all Mnemosyne-specific data

**Testing:**

- [ ] Manual: Mnemosyne-specific feature preservation

---

#### Story 2.0.4: Add Mnemosyne Test Coverage

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive Mnemosyne reading tests so the implementation is reliable.

**Acceptance Criteria:**

- [ ] Create Mnemosyne test dataset
- [ ] Test basic reading functionality
- [ ] Test Mnemosyne-specific features
- [ ] Test error handling scenarios
- [ ] Achieve high test coverage for Mnemosyne code
- [ ] Performance test with large Mnemosyne datasets

**Implementation Notes:**

- Create comprehensive test suite
- Use real Mnemosyne files for testing
- Follow testing patterns from Anki implementation

**Testing:**

- [ ] Automated: Complete Mnemosyne reading test suite

---

### Phase 2.1: Mnemosyne Writing

#### Story 2.1.1: Implement Basic Mnemosyne Package Writing

**Status:** ⏳ Pending

**Story:** As a developer, I want to write Mnemosyne packages so the library can export to Mnemosyne format.

**Acceptance Criteria:**

- [ ] Create valid Mnemosyne database files
- [ ] Write cards with proper format
- [ ] Write scheduling information
- [ ] Handle Mnemosyne file structure
- [ ] Generate compatible Mnemosyne packages
- [ ] Validate exported files with Mnemosyne

**Implementation Notes:**

- Implement Mnemosyne writing functions
- Follow Mnemosyne format specifications
- Ensure compatibility with Mnemosyne application

**Testing:**

- [ ] Manual: Generated files work in Mnemosyne
- [ ] Integration: Mnemosyne compatibility validation

---

#### Story 2.1.2: Handle Mnemosyne Export Features

**Status:** ⏳ Pending

**Story:** As a developer, I want to export Mnemosyne-specific features so the library supports advanced Mnemosyne functionality.

**Acceptance Criteria:**

- [ ] Export Mnemosyne learning modes
- [ ] Export Mnemosyne statistics  
- [ ] Export Mnemosyne card types
- [ ] Export Mnemosyne categories/tags
- [ ] Export Mnemosyne configuration
- [ ] Handle Mnemosyne scheduling algorithms

**Implementation Notes:**

- Implement advanced Mnemosyne export
- Preserve all Mnemosyne-specific features
- Ensure feature compatibility

**Testing:**

- [ ] Manual: Advanced features work in Mnemosyne

---

#### Story 2.1.3: Add Mnemosyne Writing Test Coverage

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive Mnemosyne writing tests so exported packages are reliable.

**Acceptance Criteria:**

- [ ] Test basic Mnemosyne writing functionality
- [ ] Test Mnemosyne-specific feature export
- [ ] Test error handling in writing
- [ ] Achieve high test coverage for Mnemosyne writing
- [ ] Validate exported packages
- [ ] Performance test with large exports

**Implementation Notes:**

- Create comprehensive writing test suite
- Validate with actual Mnemosyne application
- Test performance scenarios

**Testing:**

- [ ] Automated: Complete Mnemosyne writing test suite

---

#### Story 2.1.4: Implement Mnemosyne Round-Trip Testing

**Status:** ⏳ Pending

**Story:** As a developer, I want Mnemosyne round-trip testing so I can verify data integrity.

**Acceptance Criteria:**

- [ ] Read Mnemosyne file and write back
- [ ] Verify data integrity after round-trip
- [ ] Test with various Mnemosyne package types
- [ ] Automated round-trip test suite
- [ ] Performance testing for round-trips
- [ ] Validate with Mnemosyne application

**Implementation Notes:**

- Implement round-trip testing framework
- Follow patterns from Anki round-trip tests
- Ensure data integrity preservation

**Testing:**

- [ ] Automated: Mnemosyne round-trip test suite

---

## Phase 3: Mochi Format I/O

### Phase 3.0: Mochi Reading

#### Story 3.0.1: Research Mochi Data Format and Structure

**Status:** ⏳ Pending

**Story:** As a developer, I want to understand Mochi's data format so I can implement accurate reading support.

**Acceptance Criteria:**

- [ ] Document Mochi file format specification
- [ ] Identify supported Mochi file extensions and structure
- [ ] Understand Mochi's database schema or file format
- [ ] Document Mochi's scheduling algorithm
- [ ] Identify unique Mochi features (spaced repetition, visual cards, etc.)
- [ ] Create format comparison with Anki and Mnemosyne

**Implementation Notes:**

- Mochi format research needed
- Create documentation in `docs/formats/mochi.md`
- Mochi is a modern SRS app with visual card features

**Testing:**

- [ ] Manual: Document findings with real Mochi files

---

#### Story 3.0.2: Implement Basic Mochi Package Reading

**Status:** ⏳ Pending

**Story:** As a developer, I want to read Mochi packages so the library can access Mochi decks and cards.

**Acceptance Criteria:**

- [ ] Read Mochi data files (likely JSON or database format)
- [ ] Extract cards with content and media
- [ ] Extract scheduling information
- [ ] Handle Mochi-specific metadata
- [ ] Create Mochi TypeScript interfaces
- [ ] Implement error handling for Mochi files

**Implementation Notes:**

- Create `src/mochi/` directory structure
- Mochi likely uses JSON or modern database format
- Handle visual card features and media

**Testing:**

- [ ] Manual: Basic Mochi file reading
- [ ] Unit: Mochi interface validation

---

#### Story 3.0.3: Handle Mochi-Specific Features and Metadata

**Status:** ⏳ Pending

**Story:** As a developer, I want to handle Mochi-specific features so the library preserves all Mochi functionality.

**Acceptance Criteria:**

- [ ] Handle Mochi visual card features
- [ ] Extract Mochi media and formatting
- [ ] Handle Mochi card templates and styling
- [ ] Preserve Mochi scheduling data
- [ ] Handle Mochi tags and organization
- [ ] Extract Mochi configuration and preferences

**Implementation Notes:**

- Mochi has advanced visual card features
- Rich media support and styling
- Modern card template system

**Testing:**

- [ ] Manual: Mochi-specific feature preservation

---

#### Story 3.0.4: Add Mochi Test Coverage

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive Mochi reading tests so the implementation is reliable.

**Acceptance Criteria:**

- [ ] Create Mochi test dataset
- [ ] Test basic reading functionality
- [ ] Test Mochi-specific features
- [ ] Test error handling scenarios
- [ ] Achieve high test coverage for Mochi code
- [ ] Performance test with large Mochi datasets

**Implementation Notes:**

- Create comprehensive test suite
- Use real Mochi files for testing
- Test visual card features and media

**Testing:**

- [ ] Automated: Complete Mochi reading test suite

---

### Phase 3.1: Mochi Writing

#### Story 3.1.1: Implement Basic Mochi Package Writing

**Status:** ⏳ Pending

**Story:** As a developer, I want to write Mochi packages so the library can export to Mochi format.

**Acceptance Criteria:**

- [ ] Create valid Mochi data files
- [ ] Write cards with proper format and media
- [ ] Write scheduling information
- [ ] Handle Mochi file structure
- [ ] Generate compatible Mochi packages
- [ ] Validate exported files with Mochi

**Implementation Notes:**

- Implement Mochi writing functions
- Follow Mochi format specifications
- Handle visual card features in export

**Testing:**

- [ ] Manual: Generated files work in Mochi
- [ ] Integration: Mochi compatibility validation

---

#### Story 3.1.2: Handle Mochi Export Features

**Status:** ⏳ Pending

**Story:** As a developer, I want to export Mochi-specific features so the library supports advanced Mochi functionality.

**Acceptance Criteria:**

- [ ] Export Mochi visual card features
- [ ] Export Mochi media and formatting
- [ ] Export Mochi card templates and styling
- [ ] Export Mochi tags and organization
- [ ] Export Mochi configuration
- [ ] Handle Mochi scheduling algorithms

**Implementation Notes:**

- Implement advanced Mochi export
- Preserve all Mochi-specific features
- Handle visual card complexity

**Testing:**

- [ ] Manual: Advanced features work in Mochi

---

#### Story 3.1.3: Add Mochi Writing Test Coverage

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive Mochi writing tests so exported packages are reliable.

**Acceptance Criteria:**

- [ ] Test basic Mochi writing functionality
- [ ] Test Mochi-specific feature export
- [ ] Test error handling in writing
- [ ] Achieve high test coverage for Mochi writing
- [ ] Validate exported packages
- [ ] Performance test with large exports

**Implementation Notes:**

- Create comprehensive writing test suite
- Validate with actual Mochi application
- Test visual card features

**Testing:**

- [ ] Automated: Complete Mochi writing test suite

---

#### Story 3.1.4: Implement Mochi Round-Trip Testing

**Status:** ⏳ Pending

**Story:** As a developer, I want Mochi round-trip testing so I can verify data integrity.

**Acceptance Criteria:**

- [ ] Read Mochi file and write back
- [ ] Verify data integrity after round-trip
- [ ] Test with various Mochi package types
- [ ] Automated round-trip test suite
- [ ] Performance testing for round-trips
- [ ] Validate with Mochi application

**Implementation Notes:**

- Implement round-trip testing framework
- Handle Mochi visual features in testing
- Ensure data integrity preservation

**Testing:**

- [ ] Automated: Mochi round-trip test suite

---

## Phase 4: SuperMemo Format I/O

### Phase 4.0: SuperMemo Reading

#### Story 4.0.1: Research SuperMemo Data Format and Structure

**Status:** ⏳ Pending

**Story:** As a developer, I want to understand SuperMemo's data format so I can implement accurate reading support.

**Acceptance Criteria:**

- [ ] Document SuperMemo file format specification
- [ ] Identify supported SuperMemo versions
- [ ] Understand SuperMemo's database schema
- [ ] Document SuperMemo's scheduling algorithm
- [ ] Identify unique SuperMemo features
- [ ] Create format comparison with Anki, Mnemosyne, and Mochi

**Implementation Notes:**

- SuperMemo format research needed
- Create documentation in `docs/formats/supermemo.md`
- SuperMemo has multiple versions with different formats

**Testing:**

- [ ] Manual: Document findings with real SuperMemo files

---

#### Story 4.0.2: Implement Basic SuperMemo Package Reading

**Status:** ⏳ Pending

**Story:** As a developer, I want to read SuperMemo packages so the library can access SuperMemo collections.

**Acceptance Criteria:**

- [ ] Read SuperMemo collection files
- [ ] Extract elements with content
- [ ] Extract SuperMemo scheduling information
- [ ] Handle SuperMemo-specific metadata
- [ ] Create SuperMemo TypeScript interfaces
- [ ] Implement error handling for SuperMemo files

**Implementation Notes:**

- Create `src/supermemo/` directory structure
- SuperMemo format is more complex than Anki/Mnemosyne/Mochi
- Handle multiple SuperMemo versions

**Testing:**

- [ ] Manual: Basic SuperMemo file reading
- [ ] Unit: SuperMemo interface validation

---

#### Story 4.0.3: Handle SuperMemo-Specific Features

**Status:** ⏳ Pending

**Story:** As a developer, I want to handle SuperMemo-specific features so the library preserves SuperMemo functionality.

**Acceptance Criteria:**

- [ ] Handle SuperMemo learning algorithms
- [ ] Extract SuperMemo statistics and metrics
- [ ] Handle SuperMemo element types
- [ ] Preserve SuperMemo interval calculations
- [ ] Handle SuperMemo categories and organization
- [ ] Extract SuperMemo configuration and preferences

**Implementation Notes:**

- SuperMemo has advanced scheduling algorithms
- Complex element hierarchy system
- Multiple learning modes and algorithms

**Testing:**

- [ ] Manual: SuperMemo-specific feature preservation

---

#### Story 4.0.4: Add SuperMemo Reading Test Coverage

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive SuperMemo reading tests so the implementation is reliable.

**Acceptance Criteria:**

- [ ] Create SuperMemo test dataset
- [ ] Test basic reading functionality
- [ ] Test SuperMemo-specific features
- [ ] Test error handling scenarios
- [ ] Achieve high test coverage for SuperMemo code
- [ ] Performance test with large SuperMemo collections

**Implementation Notes:**

- Create comprehensive test suite
- Use real SuperMemo files for testing
- Handle multiple SuperMemo versions in tests

**Testing:**

- [ ] Automated: Complete SuperMemo reading test suite

---

### Phase 4.1: SuperMemo Writing

#### Story 4.1.1: Implement Basic SuperMemo Package Writing

**Status:** ⏳ Pending

**Story:** As a developer, I want to write SuperMemo packages so the library can export to SuperMemo format.

**Acceptance Criteria:**

- [ ] Create valid SuperMemo collection files
- [ ] Write elements with proper format
- [ ] Write scheduling information
- [ ] Handle SuperMemo file structure
- [ ] Generate compatible SuperMemo packages
- [ ] Validate exported files with SuperMemo

**Implementation Notes:**

- Implement SuperMemo writing functions
- Follow SuperMemo format specifications
- Handle multiple SuperMemo versions

**Testing:**

- [ ] Manual: Generated files work in SuperMemo
- [ ] Integration: SuperMemo compatibility validation

---

#### Story 4.1.2: Handle SuperMemo Export Features

**Status:** ⏳ Pending

**Story:** As a developer, I want to export SuperMemo-specific features so the library supports advanced SuperMemo functionality.

**Acceptance Criteria:**

- [ ] Export SuperMemo learning algorithms
- [ ] Export SuperMemo statistics
- [ ] Export SuperMemo element types
- [ ] Export SuperMemo categories and organization
- [ ] Export SuperMemo configuration
- [ ] Handle SuperMemo scheduling algorithms

**Implementation Notes:**

- Implement advanced SuperMemo export
- Preserve all SuperMemo-specific features
- Handle complex SuperMemo data structures

**Testing:**

- [ ] Manual: Advanced features work in SuperMemo

---

#### Story 4.1.3: Add SuperMemo Writing Test Coverage

**Status:** ⏳ Pending

**Story:** As a developer, I want comprehensive SuperMemo writing tests so exported packages are reliable.

**Acceptance Criteria:**

- [ ] Test basic SuperMemo writing functionality
- [ ] Test SuperMemo-specific feature export
- [ ] Test error handling in writing
- [ ] Achieve high test coverage for SuperMemo writing
- [ ] Validate exported packages
- [ ] Performance test with large exports

**Implementation Notes:**

- Create comprehensive writing test suite
- Validate with actual SuperMemo application
- Test performance scenarios

**Testing:**

- [ ] Automated: Complete SuperMemo writing test suite

---

#### Story 4.1.4: Implement SuperMemo Round-Trip Testing

**Status:** ⏳ Pending

**Story:** As a developer, I want SuperMemo round-trip testing so I can verify data integrity.

**Acceptance Criteria:**

- [ ] Read SuperMemo file and write back
- [ ] Verify data integrity after round-trip
- [ ] Test with various SuperMemo collection types
- [ ] Automated round-trip test suite
- [ ] Performance testing for round-trips
- [ ] Validate with SuperMemo application

**Implementation Notes:**

- Implement round-trip testing framework
- Handle SuperMemo complexity in testing
- Ensure data integrity preservation

**Testing:**

- [ ] Automated: SuperMemo round-trip test suite

---

## Phase 5: Universal Format Design

### Phase 5.0: Universal Format Specification

#### Story 5.0.1: Analyze Common Patterns Across All Implemented Formats

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

#### Story 5.0.2: Choose Universal Format Serialization Strategy

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

#### Story 5.0.3: Design Universal SRS Format Interfaces

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

#### Story 5.0.4: Create Universal Format Validation and Schema

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

#### Story 5.0.5: Write RFC-Style Universal Format Documentation

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

## Phase 6: Conversion Layer Implementation

### Phase 6.0: Format Conversion Implementation

#### Story 6.0.1: Implement Anki ↔ Universal Format Conversion

**Status:** ⏳ Pending

**Story:** As a developer, I want bidirectional Anki conversion so the library can convert between Anki and universal formats.

**Acceptance Criteria:**

- [ ] Convert Anki packages to universal format
- [ ] Convert universal format to Anki packages
- [ ] Preserve all Anki-specific features
- [ ] Handle conversion edge cases and errors
- [ ] Maintain data integrity through conversions
- [ ] Support all Anki note types and features

**Implementation Notes:**

- Implement conversion layer functions
- Use tri-state error handling pattern
- Comprehensive error reporting

**Testing:**

- [ ] Automated: Anki conversion test suite
- [ ] Manual: Round-trip conversion testing

---

#### Story 6.0.2: Implement Mnemosyne ↔ Universal Format Conversion

**Status:** ⏳ Pending

**Story:** As a developer, I want bidirectional Mnemosyne conversion so the library can convert between Mnemosyne and universal formats.

**Acceptance Criteria:**

- [ ] Convert Mnemosyne packages to universal format
- [ ] Convert universal format to Mnemosyne packages
- [ ] Preserve all Mnemosyne-specific features
- [ ] Handle conversion edge cases and errors
- [ ] Maintain data integrity through conversions
- [ ] Support all Mnemosyne learning modes

**Implementation Notes:**

- Implement Mnemosyne conversion functions
- Handle Mnemosyne-specific scheduling
- Preserve Mnemosyne learning statistics

**Testing:**

- [ ] Automated: Mnemosyne conversion test suite
- [ ] Manual: Round-trip conversion testing

---

#### Story 6.0.3: Implement Mochi ↔ Universal Format Conversion

**Status:** ⏳ Pending

**Story:** As a developer, I want bidirectional Mochi conversion so the library can convert between Mochi and universal formats.

**Acceptance Criteria:**

- [ ] Convert Mochi packages to universal format
- [ ] Convert universal format to Mochi packages
- [ ] Preserve all Mochi-specific features (visual cards, styling)
- [ ] Handle conversion edge cases and errors
- [ ] Maintain data integrity through conversions
- [ ] Support Mochi's visual card system

**Implementation Notes:**

- Implement Mochi conversion functions
- Handle Mochi's visual card features
- Preserve rich media and styling

**Testing:**

- [ ] Automated: Mochi conversion test suite
- [ ] Manual: Round-trip conversion testing

---

#### Story 6.0.4: Implement SuperMemo ↔ Universal Format Conversion

**Status:** ⏳ Pending

**Story:** As a developer, I want bidirectional SuperMemo conversion so the library can convert between SuperMemo and universal formats.

**Acceptance Criteria:**

- [ ] Convert SuperMemo collections to universal format
- [ ] Convert universal format to SuperMemo collections
- [ ] Preserve all SuperMemo-specific features
- [ ] Handle conversion edge cases and errors
- [ ] Maintain data integrity through conversions
- [ ] Support SuperMemo's complex scheduling algorithms

**Implementation Notes:**

- Implement SuperMemo conversion functions
- Handle SuperMemo's complex element hierarchy
- Preserve SuperMemo advanced algorithms

**Testing:**

- [ ] Automated: SuperMemo conversion test suite
- [ ] Manual: Round-trip conversion testing

---

#### Story 6.0.5: Add Cross-Format Conversion Testing and Quality Metrics

**Status:** ⏳ Pending

**Story:** As a developer, I want cross-format conversion testing so the library can reliably convert between any supported formats.

**Acceptance Criteria:**

- [ ] Test direct format-to-format conversions (Anki → Mnemosyne → Mochi → SuperMemo)
- [ ] Implement conversion quality metrics
- [ ] Test complex multi-step conversions
- [ ] Create conversion performance benchmarks
- [ ] Handle data loss reporting and mitigation
- [ ] Comprehensive conversion test matrix (Anki, Mnemosyne, Mochi, SuperMemo)

**Implementation Notes:**

- Test all format pair combinations (4x4 = 16 combinations)
- Format order: Anki → Mnemosyne → Mochi → SuperMemo
- Measure and report data loss
- Performance testing for large datasets

**Testing:**

- [ ] Automated: Complete cross-format test suite
- [ ] Performance: Conversion benchmarking

---

## Development Notes

### Library Design Principles

- **Layered Architecture**: Clear separation between format-specific I/O and universal conversion
- **Format Fidelity**: Preserve all format-specific features and data
- **Error Handling**: Use tri-state error pattern for robust error reporting
- **Performance**: Efficient handling of large datasets
- **Extensibility**: Design for easy addition of new formats

### Story Guidelines

- Stories may have dependencies but should be independently testable
- Each story includes comprehensive acceptance criteria
- Complex features are broken down across multiple stories

### Testing Strategy

- **Format I/O Stories**: Unit testing with real SRS files + round-trip testing
- **Conversion Stories**: Cross-format testing + data integrity validation  
- **Performance Stories**: Benchmark testing with large datasets
- **Integration Stories**: End-to-end testing with actual SRS applications
