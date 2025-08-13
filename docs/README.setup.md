# Developer Environment Setup

This document describes the prerequisites and initial setup needed to start working on SRS Converter.

For development commands, see [README.commands.md](README.commands.md).
For architecture and coding guidelines, see [README.architecture.md](README.architecture.md).

## Prerequisites

**Note**: Use latest LTS versions where available. Specific versions listed are reference points - other versions have not been tested.

## Prerequisites (Windows)

The following tools need to be installed (and on the PATH variable, where applicable):

- [Node.js](https://nodejs.org/en/) (latest LTS recommended, tested with v22)

## Prerequisites (WSL - Windows Subsystem for Linux)

- [Node.js](https://nodejs.org/en/) (latest LTS recommended, use `nvm` to manage versions)

## Initial Setup

1. Install the prerequisites listed above
2. Install pnpm: `corepack enable pnpm`
3. Install dependencies: `pnpm install`

## Verify Setup

To check if everything is set up correctly, run the following commands:

- `node --version` - Should be v22+ LTS
- `pnpm --version` - Should be 10+
- `pnpm type-check` - Should pass without errors
- `pnpm test` - Should run all tests successfully
- `pnpm build` - Should build the package without errors

For detailed development commands and workflows, see [README.commands.md](README.commands.md).
