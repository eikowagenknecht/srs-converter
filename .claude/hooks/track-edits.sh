#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): if the edited file is code, drop a marker so
# the Stop hook knows to run the quality gates at the end of the turn.
# Turns that only touch docs leave no marker and skip the gates entirely.

exec node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  const filePath = (input.tool_input && input.tool_input.file_path) || "";
  const isCode =
    /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/.test(filePath) ||
    /(^|\/)(package\.json|tsconfig[^\/]*\.json|vitest\.config\.[^\/]+)$/.test(filePath);
  if (!isCode) return;
  const fs = require("fs");
  const marker = "/tmp/claude-quality-gates-" + (input.session_id || "default");
  fs.appendFileSync(marker, filePath + "\n");
});
'
