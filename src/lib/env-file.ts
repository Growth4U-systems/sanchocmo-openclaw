/**
 * Pure transforms over `.env` file *content* (strings in, string/record out).
 *
 * Kept free of `fs`/Next so the parse/upsert/remove logic is unit-testable
 * (see src/lib/__tests__/env-file.test.mts). The API route (pages/api/env)
 * does the file read/write and delegates the actual editing here.
 */

/** Parse `.env` content into a flat KEY→value map (skips blanks and comments). */
export function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

/** Set/replace each KEY=value in `content`, appending keys that don't exist. */
export function upsertEnvContent(content: string, updates: Record<string, string>): string {
  const lines = content.split("\n");
  for (const [key, value] of Object.entries(updates)) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(key + "=")) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    if (!found) lines.push(`${key}=${value}`);
  }
  return lines.join("\n");
}

/**
 * Remove the given KEYs from `content` entirely (drops their `KEY=...` lines).
 * Blank lines, comments and non-assignment lines are preserved.
 */
export function removeKeysFromEnvContent(content: string, keys: string[]): string {
  const keySet = new Set(keys);
  return content
    .split("\n")
    .filter((line) => {
      const eq = line.indexOf("=");
      if (eq === -1) return true; // keep blanks / comments / non-assignments
      return !keySet.has(line.slice(0, eq).trim());
    })
    .join("\n");
}
