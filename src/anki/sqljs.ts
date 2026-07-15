/**
 * Central sql.js initialization (ADR-0018).
 *
 * In Node the default initialization finds `sql-wasm.wasm` inside the
 * installed sql.js package, so no configuration is needed. In browsers the
 * wasm asset must be provided by the application bundle; call
 * {@link configureSqlJs} once before the first package operation, e.g. with
 * Vite:
 *
 * ```ts
 * import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
 * configureSqlJs({ locateFile: () => wasmUrl });
 * ```
 */

import type { SqlJsStatic } from "sql.js";
import InitSqlJs from "sql.js";

/** Options forwarded to sql.js initialization (a subset of emscripten's). */
export interface SqlJsConfig {
  /**
   * Maps a requested asset filename (e.g. `sql-wasm.wasm`) to the URL or
   * path it should be fetched from.
   */
  locateFile?: (file: string) => string;
  /** The wasm binary itself, when the caller prefers to fetch it manually. */
  wasmBinary?: ArrayBuffer;
}

let config: SqlJsConfig | undefined;
let instance: Promise<SqlJsStatic> | undefined;

/**
 * Sets the sql.js initialization options and resets the memoized instance so
 * the next database operation initializes with them. Call once, before any
 * package is read or written. Passing `undefined` restores the defaults.
 * @param newConfig - The sql.js initialization options
 */
export function configureSqlJs(newConfig: SqlJsConfig | undefined): void {
  config = newConfig;
  instance = undefined;
}

/**
 * Returns the shared sql.js module, initializing it on first use.
 * @returns The initialized sql.js module
 */
export async function getSqlJs(): Promise<SqlJsStatic> {
  instance ??= InitSqlJs(config);
  return await instance;
}
