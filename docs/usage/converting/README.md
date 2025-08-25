# Converting Between SRS Formats

After [importing](../reading/README.md) or [creating](../creating/README.md) your SRS data, you may want to convert it between different formats.

To do so, srs-converter provides a **universal SRS format**.

## The Universal SRS Format

> [!warning]
> This is an alpha version, the universal format **will** be improved and changed without any regards for backward compatibility.

The universal SRS format provides:

- **Normalized data structures** - Consistent APIs regardless of source format
- **Type safety** - Full TypeScript support with intelligent autocomplete
- **Cross-format compatibility** - Same code works with different source formats
- **Extensibility** - Easy to add new formats

## Supported Conversions

| From                 | To              | Status     | Guide                        |
| -------------------- | --------------- | ---------- | ---------------------------- |
| Anki (.apkg/.colpkg) | Universal SRS   | ⚠️ Partial | [Anki → SRS](anki-to-srs.md) |
| Universal SRS        | Anki (.apkg)    | ⚠️ Partial | [SRS → Anki](srs-to-anki.md) |
| Mnemosyne            | Universal SRS   | 🔄 Planned |                              |
| Universal SRS        | Mnemosyne       | 🔄 Planned |                              |
| Mochi                | Universal SRS   | 🔄 Planned |                              |
| Universal SRS        | Mochi           | 🔄 Planned |                              |
| Supermemo            | Universal SRS   | 🔄 Planned |                              |
| Custom JSON/CSV      | Universal SRS   | 🔄 Planned |                              |
| Universal SRS        | Custom JSON/CSV | 🔄 Planned |                              |

## Preserved Data

We aim to preserve as much data as possible when converting between the formats.
A 100% accurate representation might not always be possible though (for example when you export to a format with less features).

> [!note]
> This is work in progress and not documented yet.
