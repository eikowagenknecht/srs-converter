# srs-converter

A TypeScript library for converting between different spaced repetition system (SRS) formats.

## Features

- Convert Anki packages to a universal SRS format
- Support for notes, cards, decks, and review history
- Type-safe APIs with full TypeScript support
- Comprehensive error handling and validation

## Installation

```bash
npm install srs-converter
```

## Usage

```typescript
import { convertAnkiPackage, SrsPackage } from 'srs-converter';

// Convert an Anki .apkg file to SRS format
const result = await convertAnkiPackage(ankiPackageBuffer);
if (result.success) {
  const srsPackage: SrsPackage = result.data;
  // Use the converted package
}
```

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test

# Type check
pnpm type-check

# Lint and format
pnpm lint
```

## License

AGPL-3.0-or-later
