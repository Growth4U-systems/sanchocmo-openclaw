import fs from "node:fs";
import path from "node:path";

const DROP = Symbol("drop-thinking-block");
const THINKING_MARKER = /"thinkingSignature"|"type"\s*:\s*"thinking"|"thinking"\s*:/;

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    let changed = false;
    let removedBlocks = 0;
    const next = [];
    for (const item of value) {
      const sanitized = sanitizeValue(item);
      if (sanitized.value === DROP) {
        changed = true;
        removedBlocks += Math.max(1, sanitized.removedBlocks);
        continue;
      }
      next.push(sanitized.value);
      changed = changed || sanitized.changed;
      removedBlocks += sanitized.removedBlocks;
    }
    return { value: changed ? next : value, changed, removedBlocks };
  }

  if (!isRecord(value)) return { value, changed: false, removedBlocks: 0 };

  if (value.type === "thinking") {
    return { value: DROP, changed: true, removedBlocks: 1 };
  }

  let changed = false;
  let removedBlocks = 0;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "thinking" || key === "thinkingSignature") {
      changed = true;
      continue;
    }

    const sanitized = sanitizeValue(child);
    if (sanitized.value === DROP) {
      changed = true;
      removedBlocks += Math.max(1, sanitized.removedBlocks);
      continue;
    }
    next[key] = sanitized.value;
    changed = changed || sanitized.changed;
    removedBlocks += sanitized.removedBlocks;
  }

  return { value: changed ? next : value, changed, removedBlocks };
}

export function sanitizeThinkingBlocks(value) {
  const sanitized = sanitizeValue(value);
  return {
    value: sanitized.value === DROP ? null : sanitized.value,
    changed: sanitized.changed,
    removedBlocks: sanitized.removedBlocks,
  };
}

export function sanitizeJsonLine(line) {
  if (typeof line !== "string" || !THINKING_MARKER.test(line)) {
    return { line, changed: false, removedBlocks: 0 };
  }
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { line, changed: false, removedBlocks: 0 };
  }

  const sanitized = sanitizeThinkingBlocks(parsed);
  if (!sanitized.changed) return { line, changed: false, removedBlocks: 0 };
  return {
    line: JSON.stringify(sanitized.value),
    changed: true,
    removedBlocks: sanitized.removedBlocks,
  };
}

function shouldScanFile(filePath) {
  const base = path.basename(filePath);
  return base.includes(".jsonl") || base.endsWith(".json");
}

function walkFiles(root, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "cache" || entry.name === "shell_snapshots") continue;
      walkFiles(fullPath, acc);
    } else if (entry.isFile() && shouldScanFile(fullPath)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

export function sanitizeJsonlFile(filePath) {
  let original;
  try {
    original = fs.readFileSync(filePath, "utf8");
  } catch {
    return { filePath, changed: false, removedBlocks: 0 };
  }

  if (!THINKING_MARKER.test(original)) {
    return { filePath, changed: false, removedBlocks: 0 };
  }

  const hadTrailingNewline = original.endsWith("\n");
  const lines = original.split(/\r?\n/);
  if (hadTrailingNewline) lines.pop();

  let changed = false;
  let removedBlocks = 0;
  const nextLines = lines.map((line) => {
    if (!line.trim()) return line;
    const sanitized = sanitizeJsonLine(line);
    changed = changed || sanitized.changed;
    removedBlocks += sanitized.removedBlocks;
    return sanitized.line;
  });

  if (!changed) return { filePath, changed: false, removedBlocks: 0 };

  const next = nextLines.join("\n") + (hadTrailingNewline ? "\n" : "");
  fs.writeFileSync(filePath, next);
  return { filePath, changed: true, removedBlocks };
}

export function agentThinkingHistoryRoots(agentId, home = process.env.OPENCLAW_HOME) {
  if (!home || !agentId || typeof agentId !== "string") return [];
  const roots = [
    path.join(home, ".openclaw", "agents", agentId, "agent", "codex-home", "sessions"),
    path.join(home, "agents", agentId, "agent", "codex-home", "sessions"),
    path.join(home, ".openclaw", "agents", agentId, "sessions"),
    path.join(home, "agents", agentId, "sessions"),
  ];
  return Array.from(new Set(roots));
}

export function sanitizeAgentThinkingHistory(agentId, opts = {}) {
  const home = opts.home ?? process.env.OPENCLAW_HOME;
  const roots = opts.roots ?? agentThinkingHistoryRoots(agentId, home);
  const files = Array.from(new Set(roots.flatMap((root) => walkFiles(root))));

  let filesChanged = 0;
  let removedBlocks = 0;
  const changedFiles = [];
  for (const filePath of files) {
    const result = sanitizeJsonlFile(filePath);
    if (!result.changed) continue;
    filesChanged += 1;
    removedBlocks += result.removedBlocks;
    changedFiles.push(filePath);
  }

  return {
    agentId,
    rootsScanned: roots.length,
    filesScanned: files.length,
    filesChanged,
    removedBlocks,
    changedFiles,
  };
}
