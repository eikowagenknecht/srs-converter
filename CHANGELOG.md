# [0.4.0](https://github.com/eikowagenknecht/srs-converter/compare/v0.3.0...v0.4.0) (2026-07-16)


* feat(anki)!: read and write Anki's modern package format (schema 18), modern by default ([4f4ac10](https://github.com/eikowagenknecht/srs-converter/commit/4f4ac10f7e78ca80f6196ce0e592d0ebbbcfd9c7))


### Bug Fixes

* **anki:** match Anki cloze semantics when generating cards (WP3) ([f23b3f4](https://github.com/eikowagenknecht/srs-converter/commit/f23b3f46bd9fe5c9831283529ffd54bdbe8171c5))
* **anki:** preserve 64-bit ids and digit-only strings in models JSON (WP1) ([7b7d236](https://github.com/eikowagenknecht/srs-converter/commit/7b7d236e4265432d6c62ecb47b2edec1eb179e6f))
* **anki:** restore full Anki fidelity in SRS round-trips via blob capture (WP2) ([447d8eb](https://github.com/eikowagenknecht/srs-converter/commit/447d8ebdfe17a7769d10c1cc62d6112a899700f6))
* **lint:** disable import/no-nodejs-modules rule ([b26b1fd](https://github.com/eikowagenknecht/srs-converter/commit/b26b1fdf961f441a4e1d6060db24a5eefb1c1d06))
* **srs:** correct field ordering, reverse template, review id collisions (WP5) ([33d3493](https://github.com/eikowagenknecht/srs-converter/commit/33d34938e263250d6bb42dd9b0a1fa03f4e83ace))
* **srs:** warn when removeUnused prunes decks, note types, or notes (WP6) ([7255428](https://github.com/eikowagenknecht/srs-converter/commit/7255428150db1c35df802f45d4717a11fe89b590))


### Features

* **anki:** add removeMediaFile() API for media file removal ([6953962](https://github.com/eikowagenknecht/srs-converter/commit/695396285335ca5d363302cae2380db40512e485))
* **anki:** add removeUnreferencedMediaFiles() API for media cleanup ([7e924cf](https://github.com/eikowagenknecht/srs-converter/commit/7e924cf4fda7514002accd512a560e1efdc24d0d))
* **anki:** add specific error messages for corrupted ZIP archives ([af01635](https://github.com/eikowagenknecht/srs-converter/commit/af01635e7ae3e13d812147d03bc6e02f54e04600))
* **anki:** detect corrupted SQLite databases with specific error messages ([814c224](https://github.com/eikowagenknecht/srs-converter/commit/814c22447d0a4285ad07006e256b74077d47d236))
* **anki:** detect missing required files in Anki packages ([46c8e65](https://github.com/eikowagenknecht/srs-converter/commit/46c8e6526063eae56eefef1b78a001f14a7fbc21))
* **anki:** preserve plugin data in SRS round-trip conversions ([e2949db](https://github.com/eikowagenknecht/srs-converter/commit/e2949db95efbfd493a0271eb3a7026b843c0e296))
* **anki:** validate JSON in media mapping file with specific error messages ([df0b0a6](https://github.com/eikowagenknecht/srs-converter/commit/df0b0a63ba35d83f8791e124f3c4ae38d20ac618))
* run in browsers, Tauri, and Capacitor via a bytes-based API ([ddaea20](https://github.com/eikowagenknecht/srs-converter/commit/ddaea20397c661cd8f61ad884adb3e1a1c76a16e))
* **srs:** add first-class media support and carry it through conversions (WP4) ([dbcd282](https://github.com/eikowagenknecht/srs-converter/commit/dbcd282603ffd18f04b40739e226593ca7af72d5))


### BREAKING CHANGES

* toAnkiExport writes the modern package format by default;
pass { legacy: true } for Legacy 2 output. Node >= 22.15 is now required.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
* **srs:** toSrsPackage() is now async and returns a Promise.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

# [0.3.0](https://github.com/eikowagenknecht/srs-converter/compare/v0.2.4...v0.3.0) (2025-10-19)

### Features

- add API for adding media files to Anki packages ([d1bc637](https://github.com/eikowagenknecht/srs-converter/commit/d1bc637676938f143fd3482c759db28d04975173))
- add media file retrieval APIs for Anki packages ([c246313](https://github.com/eikowagenknecht/srs-converter/commit/c246313a0e8b488e0f09dde39beb5b38626682cb))

# [0.2.4](https://github.com/eikowagenknecht/srs-converter/compare/v0.2.3...v0.2.4) (2025-10-19)

### Bug Fixes

- resolve protobufjs ESM compatibility issue in distributed package ([ff8a788](https://github.com/eikowagenknecht/srs-converter/commit/ff8a788275f280099cace5d6a5e227ad5b3b54ae))

### Features

- implement ID preservation across round-trip conversions ([c4c129d](https://github.com/eikowagenknecht/srs-converter/commit/c4c129d04557370fb365bade23a5ebd9a29a1600))

# [0.2.3](https://github.com/eikowagenknecht/srs-converter/compare/v0.2.2...v0.2.3) (2025-10-07)

### Bug Fixes

- resolve protobufjs import errors in downstream projects ([#21](https://github.com/eikowagenknecht/srs-converter/pull/21)) ([5d2c230](https://github.com/eikowagenknecht/srs-converter/commit/5d2c230cfd081a53a4cb4488f72d97e83923a2df))

# [0.2.2](https://github.com/eikowagenknecht/srs-converter/compare/v0.2.1...v0.2.2) (2025-10-02)

### Bug Fixes

- resolve TypeScript path aliases in built output using tsup ([#19](https://github.com/eikowagenknecht/srs-converter/pull/19)) ([27b3e32](https://github.com/eikowagenknecht/srs-converter/commit/27b3e320836366a67c05c1ef1bb89dae9d811774))

# [0.2.1](https://github.com/eikowagenknecht/srs-converter/compare/v0.2.0...v0.2.1) (2025-08-25)

### Build System

- improve build process and fix npm package structure ([b6a63a2](https://github.com/eikowagenknecht/srs-converter/commit/b6a63a2ab3c2217e633cc2929d10c9955506360e))

# [0.2.0](https://github.com/eikowagenknecht/srs-converter/compare/v0.1.1...v0.2.0) (2025-08-25)

### Features

- add utils for parsing and serializing BigInt in JSON ([02f676e](https://github.com/eikowagenknecht/srs-converter/commit/02f676edd4a727741a8e52f70479d1c4dff1b40d))
- change license from AGPL-3.0-or-later to MIT ([cbd2ae5](https://github.com/eikowagenknecht/srs-converter/commit/cbd2ae5efd4a7624b610d6f46cbdd1f7fd310f7c))
- handle clozes when reading anki decks ([c2a870e](https://github.com/eikowagenknecht/srs-converter/commit/c2a870edee4447c3e60491e4970e6641b55caa04))

### Bug Fixes

- integrate BigInt serialization throughout Anki package handling ([611f962](https://github.com/eikowagenknecht/srs-converter/commit/611f962f7aedb31fe9cb32a1d414fe42e5204fdd))

# [0.1.1](https://github.com/eikowagenknecht/srs-converter/compare/v0.1.0...v0.1.1) (2025-08-15)

### Documentation

- update publishing state ([8afeaff](https://github.com/eikowagenknecht/srs-converter/commit/8afeaff9bf9327bc04025095d0092dfb4032ccc8))

# 0.1.0 (2025-08-15)

### Features

- initial project setup ([c19b492](https://github.com/eikowagenknecht/srs-converter/commit/c19b492a7a733d554d59e187c32d81915d6a595d))
