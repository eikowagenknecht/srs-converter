# Testing

- We use Vitest for unit testing
- Tests should be co-located with the source files (e.g., `file.test.ts` next to `file.ts`)
- Testing setup in `vitest.config.ts`
- Test coverage is determined with `pnpm test:coverage`

## Quality Gates

Required tests (must be run in order):

1. **Type checking:** `pnpm type-check`
2. **Code formatting:** `pnpm format`
3. **Linting:** `pnpm lint`
4. **Unit tests:** `pnpm test`

## Build Verification

- `pnpm build` (TypeScript compilation check)

**If any tests fail:** Fix the issues and re-run until all pass.

## Test Implementation Guidelines

- Test all public APIs and error conditions
- Use descriptive test names that explain what is being tested
- Follow the tri-state error handling pattern when testing error cases
- Mock external dependencies appropriately
- Test both successful and failure scenarios

When writing a test and you're not 100% sure if the test is correct or if the code is correct:

- Add a TODO comment to the test, explaining why you are not sure and what the two possible interpretations are
- Then mark it to be skipped with `it.skip()` or `describe.skip()`
