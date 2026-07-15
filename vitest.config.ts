import { resolve } from "node:path";

import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// Git worktrees created by AI agents live under .claude/worktrees/ inside
// the repository. Without this exclude, their test files are discovered a
// second time and the duplicated runs race on shared artifacts (out/, …).
const exclude = [...configDefaults.exclude, "**/.claude/worktrees/**"];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            "@": resolve(__dirname, "./src"),
            // Build-time platform switch (ADR-0018): Node tests run against
            // the Node implementation, matching tsconfig's paths mapping.
            "#platform": resolve(__dirname, "./src/platform/node.ts"),
          },
        },
        test: {
          environment: "node",
          exclude,
          include: ["src/**/*.test.ts", "docs/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        // Real-browser smoke tests (ADR-0018): Chromium via Playwright,
        // running against the browser platform implementation (WASM zstd,
        // in-memory storage).
        assetsInclude: ["**/*.apkg"],
        resolve: {
          alias: {
            "@": resolve(__dirname, "./src"),
            "#platform": resolve(__dirname, "./src/platform/browser.ts"),
          },
        },
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright(),
          },
          exclude,
          include: ["tests/browser/**/*.test.ts"],
          name: "browser",
        },
      },
    ],
  },
});
