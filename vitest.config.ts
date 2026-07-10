import { resolve } from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Git worktrees created by AI agents live under .claude/worktrees/ inside
    // the repository. Without this exclude, their test files are discovered a
    // second time and the duplicated runs race on shared artifacts (out/, …).
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
