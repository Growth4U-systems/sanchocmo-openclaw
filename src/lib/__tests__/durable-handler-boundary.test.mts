import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function sourceFiles(root: string): string[] {
  const pending = [root];
  const result: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") pending.push(path);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const source = readFileSync(path, "utf8");
        if (
          source.includes("DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2") &&
          /(?:\basync\s+execute\s*\(|\bexecute\s*:\s*async\b)/.test(source)
        ) {
          result.push(path);
        }
      }
    }
  }
  return result.sort();
}

test("contract-v2 handler modules cannot import or call external I/O directly", () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const libraryRoot = join(testDirectory, "..");
  const handlers = sourceFiles(libraryRoot);
  assert.ok(handlers.length > 0, "at least one v2 handler must be checked");
  assert.ok(
    handlers.some((path) => path.endsWith("search-contract-v2.ts")),
    "v2 handlers are discovered from their contract, not their file name",
  );

  const forbidden: Array<[string, RegExp]> = [
    ["global fetch", /\bfetch\s*\(/],
    ["raw dispatcher", /\bdispatch[A-Z][A-Za-z0-9_]*\s*\(/],
    [
      "network primitive import",
      /(?:from\s+|import\s*\()["'](?:node:)?(?:http|https|net|tls)["']/,
    ],
    [
      "external binding import",
      /(?:from\s+|import\s*\()["'][^"']*(?:binding|client|transport|dispatcher|outbound-command|\/services?\/|\/providers?\/)[^"']*["']/i,
    ],
    ["provider SDK invocation", /\.(?:invoke|request|send|publish)\s*\(/],
  ];

  for (const path of handlers) {
    const source = readFileSync(path, "utf8");
    // A handler with declared effects must route every effect through the
    // fenced context. A deliberately pure/remote-owned handler may declare no
    // effects and fail closed from execute; it is still checked against every
    // forbidden I/O primitive below.
    if (!/\beffects\s*:\s*\{\s*\}/.test(source)) {
      assert.match(
        source,
        /\bcontext\.effect\s*\(/,
        `${relative(libraryRoot, path)} must route I/O through context.effect`,
      );
    }
    for (const [label, pattern] of forbidden) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relative(libraryRoot, path)} contains ${label}`,
      );
    }
  }
});
