/**
 * CI gate (ADR-0018): the browser bundle must not import any Node builtin.
 * tsdown's `platform: "browser"` warns at build time; this script is the
 * hard failure.
 */
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { exit } from "node:process";

const bundlePath = "dist/index.browser.mjs";
const source = await readFile(bundlePath, "utf8");

const names = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
const escaped = names.map((name) => name.replaceAll("/", String.raw`\/`)).join("|");
const pattern = new RegExp(
  `(?:from\\s*|import\\s*\\(\\s*|require\\(\\s*)["'](${escaped})["']`,
  "gu",
);

const hits = [...source.matchAll(pattern)].map((match) => match[1]);
if (hits.length > 0) {
  console.error(`FAIL: ${bundlePath} imports Node builtins:`, [...new Set(hits)]);
  exit(1);
}
console.log(`OK: ${bundlePath} is free of Node builtin imports`);
