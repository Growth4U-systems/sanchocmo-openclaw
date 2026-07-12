import {
  inferTaskExecutionContract,
  type TaskContractInput,
  type TaskDocumentRef,
} from "@/lib/data/task-execution-contract";
import type {
  AgentRunExpectedOutput,
  AgentRunTaskContractSnapshot,
} from "@/lib/data/agent-runs";
import path from "node:path";
import { BASE } from "@/lib/data/paths";
import {
  normalizeBrandDocPath,
  normalizeBrandDocPathFromBase,
} from "@/lib/doc-paths";

const GLOB_MAGIC = /[*?[\]{}]/;

function text(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().slice(0, 12_000);
}

function inferredBrandSlug(task: Record<string, unknown>): string | undefined {
  const explicit = text(task.brand_slug ?? task.brandSlug);
  if (explicit) return explicit;
  const values = [
    task.deliverable_file,
    task.deliverableFile,
    task.output_documents,
    task.outputDocuments,
    task.output_files,
    task.outputFiles,
    task.documents,
  ];
  for (const value of values) {
    const entries = Array.isArray(value) ? value : value == null ? [] : [value];
    for (const entry of entries) {
      const raw = typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? (entry as Record<string, unknown>).path
          : undefined;
      const match = typeof raw === "string"
        ? raw.replace(/\\/g, "/").match(/^\/?brand\/([^/]+)\//)
        : null;
      if (match?.[1]) return match[1];
    }
  }
  return undefined;
}

/**
 * Canonical workspace path for an expected output or a concrete file-write
 * target. Relative and Windows-style task conventions collapse to the same
 * tenant-scoped representation. Globs are allowed only for expectations.
 */
export function normalizeQualityOutputPath(
  clientSlug: string,
  value: unknown,
  options: { allowGlob?: boolean; baseDirectory?: string } = {},
): string | undefined {
  if (typeof value !== "string") return undefined;
  let raw = value.trim().replace(/^[`"']+|[`"']+$/g, "");
  if (!raw || /^(?:https?:|data:|file:)/i.test(raw) || raw.includes("\0")) return undefined;
  if (options.allowGlob === false && GLOB_MAGIC.test(raw)) return undefined;
  if (path.isAbsolute(raw)) {
    const relative = path.relative(path.resolve(BASE), path.resolve(raw));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
    raw = relative;
  }
  try {
    const slashPath = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    return options.baseDirectory
      ? normalizeBrandDocPathFromBase(clientSlug, slashPath, options.baseDirectory)
      : normalizeBrandDocPath(clientSlug, slashPath);
  } catch {
    return undefined;
  }
}

function firstPath(value: unknown): string | undefined {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  for (const entry of entries) {
    if (typeof entry === "string" && entry.trim()) return entry;
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const raw = record.path ?? record.file;
      if (typeof raw === "string" && raw.trim()) return raw;
    }
  }
  return undefined;
}

function expectedSource(source: TaskDocumentRef["source"]): AgentRunExpectedOutput["source"] {
  if (
    source === "deliverable_file"
    || source === "output_documents"
    || source === "output_files"
    || source === "documents"
  ) return source;
  return "fallback";
}

/** Build the immutable task harness from Sancho's canonical execution contract. */
export function buildTaskContractSnapshot(
  task: unknown,
  clientSlug?: string,
): AgentRunTaskContractSnapshot | undefined {
  if (!task || typeof task !== "object" || Array.isArray(task)) return undefined;
  const row = task as Record<string, unknown>;
  const slug = clientSlug?.trim() || inferredBrandSlug(row);
  if (!slug) return undefined;

  const normalized = inferTaskExecutionContract(row as TaskContractInput, { brandSlug: slug });
  const rawDeliverable = firstPath(row.deliverable_file ?? row.deliverableFile);
  const canonicalDeliverable = normalizeQualityOutputPath(slug, rawDeliverable, { allowGlob: true });
  const outputFilesBase = canonicalDeliverable
    ? path.posix.dirname(canonicalDeliverable)
    : undefined;
  const expectedOutputs: AgentRunExpectedOutput[] = [];
  const seen = new Set<string>();
  for (const document of normalized.outputDocuments) {
    const outputPath = normalizeQualityOutputPath(slug, document.path, {
      allowGlob: true,
      baseDirectory: document.source === "output_files" ? outputFilesBase : undefined,
    });
    if (!outputPath || seen.has(outputPath)) continue;
    seen.add(outputPath);
    expectedOutputs.push({ path: outputPath, source: expectedSource(document.source) });
  }
  if (expectedOutputs.length === 0 && text(row.id)) {
    const type = row.type === "content_subtask" ? "content_task" : text(row.type);
    const fallback = type === "content_task"
      ? `brand/${slug}/content/drafts/${text(row.idea_id) || text(row.id)}/output.md`
      : `brand/${slug}/tasks/${text(row.id)}/output.md`;
    const fallbackPath = normalizeQualityOutputPath(slug, fallback, { allowGlob: false });
    if (fallbackPath) expectedOutputs.push({ path: fallbackPath, source: "fallback" });
  }

  return {
    name: text(row.name),
    type: text(row.type),
    status: text(row.status),
    completion: text(row.completion),
    doneCriteria: text(row.done_criteria ?? row.doneCriteria),
    deliverable: text(row.deliverable),
    expectedOutputs,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match a canonical concrete target to a canonical literal/glob expectation. */
export function qualityOutputMatches(expectedPath: string, actualPath: string): boolean {
  if (!GLOB_MAGIC.test(expectedPath)) return expectedPath === actualPath;
  let source = "^";
  for (let index = 0; index < expectedPath.length; index += 1) {
    const char = expectedPath[index];
    if (char === "*") {
      const double = expectedPath[index + 1] === "*";
      if (double) {
        index += 1;
        if (expectedPath[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "[") {
      const close = expectedPath.indexOf("]", index + 1);
      if (close > index + 1) {
        const body = expectedPath.slice(index + 1, close).replace(/^!/, "^");
        source += `[${body.replace(/\\/g, "\\\\")}]`;
        index = close;
      } else {
        source += "\\[";
      }
    } else if (char === "{") {
      const close = expectedPath.indexOf("}", index + 1);
      const alternatives = close > index + 1
        ? expectedPath.slice(index + 1, close).split(",")
        : [];
      if (
        alternatives.length > 1
        && alternatives.every((alternative) => /^[A-Za-z0-9._-]+$/.test(alternative))
      ) {
        source += `(?:${alternatives.map(escapeRegex).join("|")})`;
        index = close;
      } else {
        source += "\\{";
      }
    } else {
      source += escapeRegex(char);
    }
  }
  source += "$";
  try {
    return new RegExp(source).test(actualPath);
  } catch {
    return false;
  }
}
