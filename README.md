# srs-converter

![GitHub License](https://img.shields.io/github/license/eikowagenknecht/srs-converter)
[![Node.js Version](https://img.shields.io/badge/Node.js-22%2B-blue)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

A TypeScript library for converting between different spaced repetition system (SRS) formats.

**Goal**: Enable seamless data migration between popular SRS applications like Anki, Mnemosyne, SuperMemo, and Mochi, preserving as much data as possible.

> [!warning]
> **Alpha Software**: This library is in early alpha development.
> APIs may change without notice, and data loss could occur.
>
> **This is not recommended for production use yet.**
> Please backup your data before testing.

## Features

- **Anki Support**: Convert `.apkg` and `.colpkg` packages to a universal SRS format
- **Complete Data**: Support for notes, cards, decks, and review history
- **Node.js Only**: Currently requires Node.js (browser support planned for future releases)
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Robust validation and tri-state error reporting
- **Well-Tested Dependencies**: Uses established libraries for SQLite parsing, archive handling, and data processing
- **Extensible**: Architecture designed to support additional SRS formats in the future

### Universal SRS Format

The library aims to define a universal SRS format.
This is neccessary, because the current SRS formats are very fragmented and undocumented.
As a strong opponent of vendor lock-in, the library will strive to create a format that:

- Is open and accessible
- Is human-readable
- Has support for all the relevant entities of SRS systems (notes, cards, decks, etc.)
- Is well-documented (we will provide comprehensive RFC style documentation)
- Uses normalized data structures
- Is free from proprietary constraints
- Guarantees upward compatibility
- Is easily extensible for additional application specific data

## Installation

Install from npm:

```bash
npm install srs-converter
pnpm install srs-converter
yarn add srs-converter
```

### Development Installation

For development or testing, you can also install this package locally:

```bash
# Clone the repository
git clone https://github.com/eikowagenknecht/srs-converter.git
cd srs-converter

# Install dependencies
pnpm install

# Build the package
pnpm build
```

## Platform Compatibility

- **Node.js**: Full support (v22+ recommended)
- **Bun** / **Deno**: Not tested
- **Browser**: Not currently supported (uses Node.js-specific filesystem APIs)

**Note**: Browser support is planned for future releases by abstracting file system operations.

## Usage

For usage examples and API documentation, see the [Usage Guide](docs/usage/README.md).

## Project Status

The library development follows a phase-based approach. For detailed development progress, upcoming features, and implementation status, see the [**Development Stories**](docs/stories/README.md).

**Current Focus**: We're in early development, expanding test coverage for existing Anki functionality and adding support for media files and complex note types (Cloze, Image Occlusion) before implementing additional SRS formats (Mnemosyne, Mochi, SuperMemo).

### Format Support Matrix

| Feature             | Anki               | Mnemosyne  | SuperMemo  | Mochi      | Custom Formats |
| ------------------- | ------------------ | ---------- | ---------- | ---------- | -------------- |
| **Read Support**    | ✅ Good            | ❌ Planned | ❌ Planned | ❌ Planned | ❌ Planned     |
| **Write Support**   | ✅ Good            | ❌ Planned | ❌ Planned | ❌ Planned | ❌ Planned     |
| **Round-trip**      | ✅ Working         | ❌ Planned | ❌ Planned | ❌ Planned | ❌ Planned     |
| **File Types**      | `.apkg`, `.colpkg` | -          | -          | -          | -              |
| **Database Schema** | Legacy v2          | -          | -          | -          | -              |

### Anki Format Details

For detailed technical information about the Anki package format, see: [Understanding the Anki .apkg Format (Legacy 2)](https://eikowagenknecht.com/posts/understanding-the-anki-apkg-format-legacy-2/)

| Component              | Support Level | Notes                                                                                  |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------- |
| **Decks**              | ✅ Full       | Name, description, configuration, hierarchy                                            |
| **Note Types**         | ✅ Full       | Fields, templates, CSS styling, configuration                                          |
| **Notes**              | ✅ Full       | Content in all fields, tags, modification timestamps                                   |
| **Cards**              | ✅ Full       | Question/answer templates, due dates, intervals, ease factors                          |
| **Review History**     | ✅ Full       | Complete review logs with timestamps and scores                                        |
| **Media Files**        | ✅ Full       | List files, get file size, stream content, add files from paths/buffers/streams        |
| **Formats**            | ⚠️ Partial    | Only Legacy v2 is supported for now                                                    |
| **Plugin Data**        | ✅ Full       | Preserved in direct operations and round-trip conversions                              |
| **Conversion Quality** | ⚠️ Partial    | Anki ↔ Universal SRS format conversion preserves basic data with round-trip capability |
| **Advanced Features**  | ⚠️ Partial    | Complex note types (Cloze, Image Occlusion) are untested                               |

## Maintainer

This project is maintained by [Eiko Wagenknecht](https://eikowagenknecht.com).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Development Documentation

For detailed development information:

- [Usage Guide](docs/usage/README.md) - Comprehensive usage examples and API documentation
- [Architecture Overview](docs/README.architecture.md) - System design and technical decisions
- [Decision Records](docs/decisions/README.md) - Architectural decisions and their rationale
- [Development Stories](docs/stories/README.md) - Development roadmap and progress tracking
- [Development Commands](docs/README.commands.md) - Package management and build commands
- [Testing Guidelines](docs/README.testing.md) - Testing setup and best practices
- [Setup Guide](docs/README.setup.md) - Environment setup and prerequisites
- [Git Workflow](docs/README.git.md) - Branching and commit conventions

## License

MIT
