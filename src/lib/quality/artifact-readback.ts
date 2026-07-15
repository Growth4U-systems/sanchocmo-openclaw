import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  appendAgentRunEventAsync,
  type AgentRun,
  type AgentRunEvent,
  type AgentRunExpectedOutput,
} from "@/lib/data/agent-runs";
import { BASE } from "@/lib/data/paths";
import {
  normalizeQualityOutputPath,
  qualityOutputMatches,
} from "@/lib/quality/task-contract-snapshot";

const MAX_READBACK_BYTES = 20 * 1024 * 1024;

export interface AgentRunArtifactReadback {
  version: 1;
  expectedPath: string;
  actualPath: string;
  source: AgentRunExpectedOutput["source"];
  progressEventId: string;
  progressTs: string;
  observedAt: string;
  byteLength: number;
  modifiedAt: string;
  sha256: string;
}

function eventData(event: AgentRunEvent): Record<string, unknown> | null {
  return event.data &&
    typeof event.data === "object" &&
    !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : null;
}

function fileWriteTarget(
  event: AgentRunEvent,
  clientSlug: string,
): string | undefined {
  if (
    event.type !== "progress" ||
    !event.threadId.startsWith(`${clientSlug}:`)
  ) {
    return undefined;
  }
  const data = eventData(event);
  if (data?.kind !== "file_write") return undefined;
  if (typeof data.target === "string" && path.isAbsolute(data.target)) {
    try {
      const canonicalRoot = fs.realpathSync.native(BASE);
      const canonicalTarget = fs.realpathSync.native(data.target);
      const relative = path.relative(canonicalRoot, canonicalTarget);
      if (
        relative &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative)
      ) {
        return normalizeQualityOutputPath(clientSlug, relative, {
          allowGlob: false,
        });
      }
    } catch {
      return undefined;
    }
  }
  return normalizeQualityOutputPath(clientSlug, data.target, {
    allowGlob: false,
  });
}

async function readTenantFile(
  clientSlug: string,
  actualPath: string,
  progressAtMs: number,
  observedAtMs: number,
): Promise<{
  byteLength: number;
  modifiedAt: string;
  sha256: string;
} | null> {
  const tenantRoot = path.resolve(BASE, "brand", clientSlug);
  const absolute = path.resolve(BASE, actualPath);
  const relative = path.relative(tenantRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return null;

  try {
    const [canonicalBrandRoot, canonicalRoot, canonicalFile] =
      await Promise.all([
        fs.promises.realpath(path.resolve(BASE, "brand")),
        fs.promises.realpath(tenantRoot),
        fs.promises.realpath(absolute),
      ]);
    // The tenant directory itself is part of the trust boundary. Checking
    // only that the file is inside realpath(tenantRoot) lets `brand/alpha`
    // point at `brand/beta` (or outside BASE) and relabel beta bytes as alpha.
    const expectedTenantRoot = path.resolve(canonicalBrandRoot, clientSlug);
    const expectedRelative = path.relative(
      canonicalBrandRoot,
      expectedTenantRoot,
    );
    if (
      !expectedRelative ||
      expectedRelative.startsWith("..") ||
      path.isAbsolute(expectedRelative) ||
      canonicalRoot !== expectedTenantRoot
    )
      return null;
    const canonicalRelative = path.relative(canonicalRoot, canonicalFile);
    if (
      !canonicalRelative ||
      canonicalRelative.startsWith("..") ||
      path.isAbsolute(canonicalRelative)
    )
      return null;

    const before = await fs.promises.stat(canonicalFile);
    if (!before.isFile() || before.size > MAX_READBACK_BYTES) return null;
    const content = await fs.promises.readFile(canonicalFile);
    const after = await fs.promises.stat(canonicalFile);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      return null;
    // Date timestamps are integer milliseconds while stat may expose
    // sub-millisecond precision. Floor only the upper-bound comparison so a
    // write at 10.3342 is not considered later than an observation at 10.334;
    // the causal lower bound remains strict with no pre-progress tolerance.
    if (after.mtimeMs < progressAtMs || Math.floor(after.mtimeMs) > observedAtMs)
      return null;
    return {
      byteLength: content.byteLength,
      modifiedAt: after.mtime.toISOString(),
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return null;
  }
}

/**
 * At successful terminal delivery, bind trusted file_write progress to an
 * immediate tenant-scoped readback and persist the result in the run ledger.
 * The later exporter never re-opens the mutable filesystem.
 */
export async function persistCausalArtifactReadbacks(
  run: AgentRun,
  clientSlug: string,
  events: readonly AgentRunEvent[],
  now = new Date(),
): Promise<AgentRunArtifactReadback[]> {
  if (
    !run.taskContract?.expectedOutputs.length ||
    !run.threadId.startsWith(`${clientSlug}:`)
  )
    return [];
  const observedAt = now.toISOString();
  const persisted: AgentRunArtifactReadback[] = [];
  const seen = new Set<string>();

  for (const progress of events) {
    if (progress.runId !== run.id || progress.threadId !== run.threadId)
      continue;
    const actualPath = fileWriteTarget(progress, clientSlug);
    const progressAt = Date.parse(progress.ts);
    if (
      !actualPath ||
      !Number.isFinite(progressAt) ||
      progressAt > now.getTime()
    )
      continue;

    for (const expected of run.taskContract.expectedOutputs) {
      const expectedPath = normalizeQualityOutputPath(
        clientSlug,
        expected.path,
        { allowGlob: true },
      );
      if (!expectedPath || !qualityOutputMatches(expectedPath, actualPath))
        continue;
      const key = `${expectedPath}\0${actualPath}`;
      if (seen.has(key)) continue;
      const readback = await readTenantFile(
        clientSlug,
        actualPath,
        progressAt,
        now.getTime(),
      );
      if (!readback) continue;
      seen.add(key);
      const data: AgentRunArtifactReadback = {
        version: 1,
        expectedPath,
        actualPath,
        source: expected.source,
        progressEventId: progress.id,
        progressTs: progress.ts,
        observedAt,
        ...readback,
      };
      await appendAgentRunEventAsync({
        runId: run.id,
        threadId: run.threadId,
        type: "artifact_readback",
        data,
        now,
      });
      persisted.push(data);
    }
  }
  return persisted;
}

function parsedReadback(value: unknown): AgentRunArtifactReadback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<AgentRunArtifactReadback>;
  if (
    row.version !== 1 ||
    typeof row.expectedPath !== "string" ||
    typeof row.actualPath !== "string" ||
    ![
      "deliverable_file",
      "output_documents",
      "output_files",
      "documents",
      "fallback",
    ].includes(String(row.source)) ||
    typeof row.progressEventId !== "string" ||
    typeof row.progressTs !== "string" ||
    typeof row.observedAt !== "string" ||
    typeof row.byteLength !== "number" ||
    !Number.isSafeInteger(row.byteLength) ||
    row.byteLength < 0 ||
    typeof row.modifiedAt !== "string" ||
    !Number.isFinite(Date.parse(row.progressTs)) ||
    !Number.isFinite(Date.parse(row.observedAt)) ||
    !Number.isFinite(Date.parse(row.modifiedAt)) ||
    typeof row.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.sha256)
  )
    return null;
  return row as AgentRunArtifactReadback;
}

/** Validate immutable readback events against their run contract and causal progress event. */
export function causalArtifactReadbacksFromEvents(
  run: AgentRun,
  clientSlug: string,
  events: readonly AgentRunEvent[],
): AgentRunArtifactReadback[] {
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : Number.NaN;
  const createdAt = Date.parse(run.createdAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(finishedAt)) return [];
  const progressById = new Map(events.map((event) => [event.id, event]));
  const expected = run.taskContract?.expectedOutputs ?? [];
  const valid: AgentRunArtifactReadback[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (
      event.type !== "artifact_readback" ||
      event.runId !== run.id ||
      event.threadId !== run.threadId
    )
      continue;
    const eventAt = Date.parse(event.ts);
    const data = parsedReadback(event.data);
    if (
      !data ||
      !Number.isFinite(eventAt) ||
      eventAt > finishedAt ||
      data.observedAt !== event.ts
    )
      continue;
    const expectedPath = normalizeQualityOutputPath(
      clientSlug,
      data.expectedPath,
      { allowGlob: true },
    );
    const actualPath = normalizeQualityOutputPath(clientSlug, data.actualPath, {
      allowGlob: false,
    });
    const contractOutput = expected.find(
      (item) => item.path === expectedPath && item.source === data.source,
    );
    if (
      !expectedPath ||
      !actualPath ||
      !contractOutput ||
      !qualityOutputMatches(expectedPath, actualPath)
    )
      continue;

    const progress = progressById.get(data.progressEventId);
    const progressTarget = progress
      ? fileWriteTarget(progress, clientSlug)
      : undefined;
    const progressAt = progress ? Date.parse(progress.ts) : Number.NaN;
    const modifiedAt = Date.parse(data.modifiedAt);
    if (
      !progress ||
      progress.runId !== run.id ||
      progress.threadId !== run.threadId ||
      progressTarget !== actualPath ||
      data.progressTs !== progress.ts ||
      !Number.isFinite(progressAt) ||
      progressAt < createdAt ||
      progressAt > eventAt ||
      modifiedAt < progressAt ||
      modifiedAt > eventAt
    )
      continue;

    const key = `${expectedPath}\0${actualPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ ...data, expectedPath, actualPath });
  }
  return valid;
}
