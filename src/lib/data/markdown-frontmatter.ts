import * as yaml from "js-yaml";

/**
 * Tiny frontmatter helper. We don't pull `gray-matter` since `js-yaml` is
 * already in the bundle and the format is simple enough.
 *
 * Format:
 *   ---
 *   key: value
 *   ---
 *   markdown body
 */

export interface ParsedMarkdown<T = Record<string, unknown>> {
  data: T;
  body: string;
}

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter<T = Record<string, unknown>>(text: string): ParsedMarkdown<T> {
  const match = text.match(FENCE_RE);
  if (!match) return { data: {} as T, body: text };
  const yamlText = match[1];
  const body = match[2] || "";
  let data: T;
  try {
    data = (yaml.load(yamlText) || {}) as T;
  } catch {
    data = {} as T;
  }
  return { data, body };
}

export function serializeFrontmatter<T = Record<string, unknown>>(data: T, body: string): string {
  const yamlText = yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd();
  return `---\n${yamlText}\n---\n${body.startsWith("\n") ? body : "\n" + body}`;
}

/** Read+parse a frontmatter file. Returns null if it doesn't exist. */
export function readFrontmatterFile<T = Record<string, unknown>>(absPath: string): ParsedMarkdown<T> | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  if (!fs.existsSync(absPath)) return null;
  const text = fs.readFileSync(absPath, "utf-8");
  return parseFrontmatter<T>(text);
}

/** Serialize+write a frontmatter file (creates parent dirs). */
export function writeFrontmatterFile<T = Record<string, unknown>>(absPath: string, data: T, body: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path") as typeof import("path");
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, serializeFrontmatter(data, body));
}
