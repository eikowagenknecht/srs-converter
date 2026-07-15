# Development Commands

## Package Development

- `pnpm dev` - Start TypeScript compiler in watch mode
- `pnpm build` - Build the package for production (two bundles: `dist/index.mjs` for Node, `dist/index.browser.mjs` for browsers; see ADR-0018)

## Package Management

- Uses `pnpm` as the package manager (**NEVER** use npm or yarn commands as this may confuse pnpm)
- Lock file: `pnpm-lock.yaml`
- Dependencies are pinned and updated via dependabot usually
- Use `pnpm dlx` for one-off package executions
- Run `pnpm install` for initial setup or after dependency changes

## Testing and Quality

- `pnpm test` - Run tests with Vitest (both the Node `unit` and Chromium `browser` projects)
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:dist` - Smoke-test the built package on Node, Bun, and Deno (probes both bundles; requires `pnpm build` first)
- `pnpm check:dist:browser` - Verify the browser bundle contains no Node builtins (requires `pnpm build` first)
- `pnpm lint` - Full lint and fix run (type-check + oxlint + oxfmt)
- `pnpm lint:oxfmt` - Run oxfmt formatter
- `pnpm type-check` - TypeScript type checking only
- `pnpm format` - Format code with oxfmt

### Additional Development Tools

- `pnpm sync:npm` - Update npm dependencies after dependabot updates
- `pnpm clean:npm` - Clean node_modules
- `pnpm upgrade:npm` - Upgrade local npm dependencies and package-lock.json file
- `pnpm outdated` - Show outdated npm dependencies
