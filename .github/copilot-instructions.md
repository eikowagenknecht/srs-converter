# SRS Converter - GitHub Copilot Instructions

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

> This comprehensive guide provides GitHub Copilot coding agents with detailed instructions for working effectively in the srs-converter codebase.

## Working Effectively

### Bootstrap, Build, and Test the Repository

**CRITICAL: Set appropriate timeouts (60+ minutes) for all build commands. NEVER CANCEL builds or tests - they typically complete quickly but need proper timeout buffer.**

1. **Install Dependencies** (20-30 seconds):
   ```bash
   corepack enable pnpm
   pnpm install --frozen-lockfile
   ```

2. **Quality Gates** (run in this exact order - **NEVER CANCEL**, total time ~25 seconds):
   ```bash
   pnpm type-check     # TypeScript checking (~3 seconds) - Set timeout to 60+ seconds
   pnpm format         # Code formatting (~2 seconds) - Set timeout to 60+ seconds  
   pnpm lint           # Full linting (~15 seconds) - Set timeout to 60+ seconds
   pnpm test           # Unit tests (~5 seconds) - Set timeout to 60+ seconds
   ```

3. **Build Package** (~5 seconds):
   ```bash
   pnpm build          # Production build - Set timeout to 60+ seconds
   ```

**TIMING EXPECTATIONS:**
- Type check: ~3 seconds (**NEVER CANCEL** - Set timeout 60+ seconds)
- Format: ~2 seconds (**NEVER CANCEL** - Set timeout 60+ seconds)
- Build: ~5 seconds (**NEVER CANCEL** - Set timeout 60+ seconds) 
- Tests: ~4 seconds (**NEVER CANCEL** - Set timeout 60+ seconds)
- Lint: ~14 seconds (**NEVER CANCEL** - Set timeout 60+ seconds)
- **Full Quality Gates**: ~25 seconds total (**NEVER CANCEL** - Set timeout 120+ seconds)

### Package Manager Requirements

- **ALWAYS use `pnpm`** - NEVER use npm or yarn commands as this may confuse pnpm
- Lock file: `pnpm-lock.yaml`
- Use `pnpm dlx` for one-off package executions
- Dependencies are pinned and updated via dependabot

## Validation

### Manual Functionality Testing

**ALWAYS manually validate any new code via complete end-to-end scenarios after making changes.**

**Required validation scenarios:**

1. **Full Quality Gate Sequence**: Validate all systems work together:
   ```bash
   # Run complete quality pipeline - takes ~25 seconds total
   # NEVER CANCEL - Set timeout to 120+ seconds  
   pnpm type-check && pnpm format && pnpm lint && pnpm test && pnpm build
   ```

2. **Library Build Validation**: Verify the package builds correctly and exports exist:
   ```bash
   # Check that build output contains expected files
   ls -la dist/ && ls -la dist/anki/
   # Should show compiled .js and .d.ts files
   ```

3. **Anki Package Creation**: Test creating and manipulating Anki packages:
   ```bash
   # Run Anki package tests which validate full workflows
   pnpm test src/anki/anki-package.test.ts
   ```

4. **SRS Conversion Workflow**: Test the full conversion pipeline:
   ```bash
   # Run conversion tests which test Anki ↔ SRS conversion
   pnpm test docs/usage/converting/
   ```

5. **Validate Test Artifacts**: Check that tests produce actual files:
   ```bash
   # After running tests, verify output files exist
   ls -la out/
   # Should show .apkg files and databases created during tests
   ```

### Quality Gate Enforcement

**Always run ALL quality gates before committing changes or the CI (.github/workflows/quality-check.yml) will fail:**

1. `pnpm type-check` - TypeScript compilation check
2. `pnpm format` - Code formatting with prettier and biome  
3. `pnpm lint` - Full lint and fix run (type-check + eslint + prettier + biome)
4. `pnpm test` - Run tests with Vitest

**If any tests fail:** Fix the issues and re-run until all pass.

## Architecture Overview

### Key Projects in Codebase

1. **Core Library** (`src/`):
   - `index.ts` - Main entry point exporting all public APIs
   - `error-handling.ts` - Tri-state result pattern with ConversionResult<T>
   - `srs-package.ts` - Universal SRS format implementation

2. **Anki Integration** (`src/anki/`):
   - `anki-package.ts` - Main Anki package handling
   - `database.ts` - SQLite database operations using Kysely + sql.js
   - `types.ts` - Anki-specific type definitions
   - `constants.ts` - Default Anki models and configurations
   - `util.ts` - Utility functions for Anki data processing

3. **Documentation & Tests** (`docs/`):
   - `usage/` - Comprehensive usage examples with executable tests
   - `decisions/` - Architectural Decision Records (ADRs)
   - `stories/` - Development roadmap and progress tracking

### Technology Stack

- **Language**: TypeScript with strict type checking
- **Package Manager**: pnpm (performant, space-efficient)
- **Testing**: Vitest (fast, modern testing framework)
- **Code Quality**: ESLint, Biome, Prettier with lefthook git hooks
- **Build**: TypeScript compiler (tsc)
- **Database**: sql.js (SQLite WASM) with Kysely query builder

### Development Patterns

- **Error Handling**: Always use tri-state `ConversionResult<T>` pattern
- **Imports**: Use `@/` for internal imports, never relative parent imports (`../`)
- **Testing**: Co-locate tests with source files (`file.test.ts` next to `file.ts`)
- **Documentation**: Executable documentation in `docs/usage/` with `.test.ts` files

## File System Structure

```
srs-converter/
├── src/                     # Main source code
│   ├── anki/               # Anki format specific implementations
│   ├── index.ts            # Public API exports
│   ├── error-handling.ts   # Tri-state result system
│   └── srs-package.ts      # Universal SRS format
├── docs/                   # Documentation with executable examples
│   ├── usage/              # Usage guides with tests
│   ├── decisions/          # Architecture Decision Records
│   └── stories/            # Development roadmap
├── dist/                   # Build output (generated)
├── out/                    # Test artifacts (generated)
└── package.json            # Project configuration
```

## Common Commands Reference

### Development
- `pnpm dev` - Start TypeScript compiler in watch mode
- `pnpm build` - Build TypeScript package for production
- `pnpm clean:npm` - Clean node_modules

### Quality Assurance  
- `pnpm type-check` - TypeScript type checking only
- `pnpm format` - Format code with prettier and biome
- `pnpm lint` - Full lint run (type-check + eslint + prettier + biome)
- `pnpm lint:biome` - Run biome linter (fast, catches most issues)

### Testing
- `pnpm test` - Run tests with Vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report

## Working with the Codebase

### Making Changes

1. **Always start with quality gates**: Run `pnpm type-check && pnpm lint && pnpm test` first
2. **Follow existing patterns**: Check similar implementations in the codebase
3. **Use proper imports**: Import from `@/` for internal modules
4. **Handle errors properly**: Use `ConversionResult<T>` for all operations that can fail
5. **Write tests**: Add tests alongside your changes following existing patterns
6. **Validate thoroughly**: Test your changes with real Anki files and SRS conversions

### Key Areas to Check After Changes

- `package.json` - Available dependencies and scripts
- `docs/README.architecture.md` - Architecture decisions and patterns
- `docs/decisions/` - ADRs for additional context
- Existing tests in the same area you're modifying

### Troubleshooting

- **Build Issues**: Check TypeScript errors first with `pnpm type-check`
- **Test Failures**: Run specific test files with `pnpm test <file-pattern>`
- **Import Errors**: Ensure you're using `@/` imports and proper module exports
- **Linting Issues**: Run `pnpm lint:biome` for quick fixes, then full `pnpm lint`

## Conventional Commits Guidelines

**ALL commits and pull requests MUST follow the Conventional Commits specification. This is strictly enforced by CI pipelines.**

### Conventional Commits Format

**Required structure:**
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

**Primary types (most commonly used):**
- `feat`: A new feature for the user
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to build process, auxiliary tools, libraries, dependencies

**Examples of well-formed commit messages:**
```bash
feat: add SRS to Anki conversion with custom note types
fix: resolve database connection timeout in large deck imports
docs: update API documentation for ConversionResult pattern
test: add comprehensive validation for Anki package creation
refactor: extract common database operations into utility functions
chore(deps): bump typescript from 5.2.0 to 5.3.0
```

### Pull Request Requirements

1. **PR Title**: Must follow conventional commits format - this becomes the squash merge commit message
2. **Individual Commits**: Should also follow conventional commits (validated by commitlint)
3. **Enforcement**: The `conventional-pull-request.yml` workflow validates PR titles automatically

**Good PR title examples:**
- `feat: implement universal SRS format converter`
- `fix: handle malformed Anki database files gracefully`
- `docs: create comprehensive GitHub Copilot instructions for effective development`

### Scopes (Optional)

Common scopes used in this project:
- `anki`: Changes specific to Anki integration
- `deps`: Dependency updates
- `ci`: CI/CD pipeline changes
- `types`: TypeScript type definitions

**Examples with scopes:**
```bash
feat(anki): add support for custom card templates
fix(types): correct ConversionResult generic constraints
chore(ci): update GitHub Actions to latest versions
```

### Validation and Enforcement

**Automated enforcement:**
- **commitlint**: Validates individual commit messages using `@commitlint/config-conventional`
- **conventional-pull-request**: Validates PR titles match conventional commits format
- **lefthook**: Git hooks run commitlint on every commit

**Manual validation:**
```bash
# Test your commit message format locally
echo "feat: your commit message" | pnpm dlx commitlint --from=stdin
```

**If validation fails:**
- Fix your commit message format
- For already committed changes: `git commit --amend -m "properly formatted message"`
- For PR titles: Edit the PR title in the GitHub interface

## CI/CD Information

- **GitHub Actions**: `.github/workflows/quality-check.yml`, `.github/workflows/conventional-pull-request.yml`
- **Required Checks**: type-check, lint, test, build must all pass
- **Conventional Commits**: Strictly enforced for all commits and PR titles
- **Git Hooks**: Managed by lefthook (see `lefthook.yml`)
- **Pull Request Template**: Includes quality checks and CLA agreement requirements

Remember: This is a TypeScript library for converting between spaced repetition system formats (primarily Anki). Focus on data integrity, error handling, and comprehensive testing when making changes.