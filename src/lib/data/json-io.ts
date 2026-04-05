import fs from "fs";
import path from "path";

/**
 * Read and parse a JSON file. Returns fallback if file doesn't exist or is invalid.
 */
export function readJSON<T>(filePath: string, fallback: T): T {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

/**
 * Write JSON to a file with pretty-printing. Creates parent directories if needed.
 */
export function writeJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Safe write with validation and backup (used for foundation-state.json).
 */
export function safeWriteJSON(
  filePath: string,
  data: unknown,
  validate?: (data: unknown) => boolean
): void {
  const json = JSON.stringify(data, null, 2);
  // Validate roundtrip
  JSON.parse(json);

  if (validate && !validate(data)) {
    throw new Error(`Validation failed for ${filePath}`);
  }

  // Backup existing file
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + ".bak");
  }

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, json);
}

/**
 * Check if a file exists.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read a text file. Returns null if it doesn't exist.
 */
export function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * List files in a directory. Returns empty array if directory doesn't exist.
 */
export function listDir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}
