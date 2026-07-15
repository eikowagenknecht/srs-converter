import { defineConfig } from "tsdown";

/**
 * Two bundles from one source tree (ADR-0018): the `#platform` tsconfig
 * paths mapping picks the per-platform implementation (zstd, default media
 * storage) at build time — the browser bundle swaps it via
 * tsconfig.browser-build.json (tsconfig `paths` take precedence over
 * tsdown's `alias`). The package.json `exports` conditions (`node` vs
 * `default`) select the matching bundle at install time. The API surface is
 * identical, so one declaration file serves both.
 */
export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: { index: "src/index.ts" },
    outExtensions: () => ({ js: ".mjs" }),
    platform: "node",
  },
  {
    clean: false,
    dts: false,
    entry: { "index.browser": "src/index.ts" },
    outExtensions: () => ({ js: ".mjs" }),
    platform: "browser",
    tsconfig: "tsconfig.browser-build.json",
  },
]);
