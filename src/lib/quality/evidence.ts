import type {
  AgentRun,
  AgentRunEvent,
  AgentRunExpectedOutput,
  AgentRunTaskContractSnapshot,
} from "@/lib/data/agent-runs";
import {
  causalArtifactReadbacksFromEvents,
  type AgentRunArtifactReadback,
} from "@/lib/quality/artifact-readback";
import { normalizeQualityOutputPath } from "@/lib/quality/task-contract-snapshot";

export { buildTaskContractSnapshot } from "@/lib/quality/task-contract-snapshot";

export const QUALITY_EVIDENCE_SCHEMA_VERSION = "quality-evidence.v1" as const;
export const QUALITY_EVIDENCE_REDACTION_VERSION = "v1" as const;
export const QUALITY_EVIDENCE_DEFAULT_LIMIT = 100;
export const QUALITY_EVIDENCE_MAX_LIMIT = 250;
export const QUALITY_EVIDENCE_MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_STRING_LENGTH = 12_000;

export const QUALITY_EVIDENCE_LIMITATIONS = Object.freeze([
  "Shadow evidence surface over a bounded JSON ledger; it is not an append-only audit log.",
  "Only the latest 2,000 runs and 10,000 run events are retained.",
  "Follow-ups are inferred only from the next run in the bounded ledger; messages without a subsequent run are unavailable.",
  "Run status completed means a reply was delivered; it does not prove the user task succeeded.",
  "Only a tenant-scoped readback causally bound to a file_write event can verify an expected output.",
  "Artifact readbacks larger than 20 MiB fail closed as unverified.",
  "Runs created before task contract snapshots were introduced may not include taskId or taskContract.",
  "Artifact readback verifies a stable byte snapshot, not semantic content correctness.",
]);

type JsonPrimitive = string | number | boolean | null;
export type RedactedQualityValue =
  | JsonPrimitive
  | RedactedQualityValue[]
  | { [key: string]: RedactedQualityValue };

export interface QualityEvidenceCursor {
  version: 2;
  clientSlug: string;
  from: string;
  to: string;
  finishedAt: string;
  runId: string;
  snapshotCreatedAt: string;
  snapshotRunId: string;
}

export interface QualityEvidenceWindow {
  from: string;
  to: string;
}

export interface QualityEvidencePageRequest {
  after: string | null;
  limit: number;
  window: QualityEvidenceWindow;
  cursor: QualityEvidenceCursor | null;
}

export interface QualityFollowUpSignal {
  text: string;
  ts: string;
  signal: "possible_correction" | "user_followup";
}

export type QualityEvidenceState =
  | "in_progress"
  | "cancelled"
  | "technical_failure"
  | "unverified_completion"
  | "reply_only";

export interface QualityEvidenceError {
  source: "run" | "output" | "event";
  category?: string;
  message: string;
}

export interface QualityEvidenceItem {
  evidenceId: string;
  runId: string;
  clientSlug: string;
  threadId: string;
  taskId: string | null;
  taskContract: AgentRunTaskContractSnapshot | null;
  runtime: string;
  agent: string | null;
  skill: string | null;
  skills: string[];
  skillMode: "auto" | "pinned" | null;
  scope: string | null;
  status: AgentRun["status"];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  request: { text: string };
  response: { text: string; errorCategory: string | null };
  artifacts: Array<
    AgentRunExpectedOutput & {
      state: "verified" | "unverified";
      readbacks: Array<
        Pick<
          AgentRunArtifactReadback,
          "actualPath" | "observedAt" | "byteLength" | "modifiedAt" | "sha256"
        >
      >;
    }
  >;
  followup: QualityFollowUpSignal | null;
  evidenceState: QualityEvidenceState;
  errors: QualityEvidenceError[];
  progress: Array<{
    ts: string;
    kind: string;
    label: string;
    target: string | null;
  }>;
  evidence: {
    replyDelivered: boolean;
    technicalFailure: boolean;
    taskBound: boolean;
    expectedOutputCount: number;
    actionResultObserved: boolean;
    taskCompletionVerified: boolean;
    verificationMethod: "artifact_readback" | null;
    unverifiedCompletionCandidate: boolean;
  };
}

export interface BuildQualityEvidencePageInput {
  clientSlug: string;
  page: QualityEvidencePageRequest;
  runs: readonly AgentRun[];
  events: readonly AgentRunEvent[];
}

export interface QualityEvidencePageResult {
  items: QualityEvidenceItem[];
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedRuns: number;
}

export class QualityEvidenceRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityEvidenceRequestError";
  }
}

const OMITTED_KEYS = new Set([
  "userid",
  "username",
  "attachments",
  "attachment",
  "attachmenturl",
  "url",
  "href",
  "authorization",
  "cookie",
  "setcookie",
  "token",
  "tokenhash",
  "secret",
  "password",
  "apikey",
  "accesskey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "clientsecret",
  "privatekey",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function redactQualityString(value: string): string {
  const redacted = value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[REDACTED_AUTH]")
    .replace(
      /\b(?:api[_-]?key|client[_-]?secret|private[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s,"'};]+/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /\b(?:sancho_mcp_|github_pat_|gh[pousr]_|glpat-|sk-ant-|sk-proj-|sk-|sk_|ntn_|xox[baprs]-)[A-Za-z0-9._-]{8,}\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[REDACTED_JWT]",
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/data:[^\s"'<>]+/gi, "[REDACTED_DATA_URL]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\+\d{8,15}\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{9,15}\b/g, "[REDACTED_PHONE]")
    .replace(
      /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}\b/g,
      "[REDACTED_PHONE]",
    )
    .slice(0, MAX_STRING_LENGTH);
  const residuals = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:Bearer|Basic)\s+(?!\[REDACTED_AUTH\])[^\s,;]{8,}/i,
    /\b(?:sancho_mcp_|github_pat_|gh[pousr]_|glpat-|sk-ant-|sk-proj-|ntn_|xox[baprs]-)[A-Za-z0-9._-]{8,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  ];
  if (residuals.some((pattern) => pattern.test(redacted))) {
    throw new Error(
      "Quality evidence contains secret-like material after redaction",
    );
  }
  return redacted;
}

/**
 * Recursively redact arbitrary ledger values. Identity and attachment fields
 * are omitted rather than masked so downstream agents cannot accidentally use
 * them as features.
 */
export function redactQualityValue(
  value: unknown,
): RedactedQualityValue | undefined {
  if (value === null) return null;
  if (typeof value === "string") return redactQualityString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => redactQualityValue(item))
      .filter((item): item is RedactedQualityValue => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;

  const out: Record<string, RedactedQualityValue> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (OMITTED_KEYS.has(normalizedKey(key))) continue;
    const redacted = redactQualityValue(nested);
    if (redacted !== undefined) out[key] = redacted;
  }
  return out;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return redactQualityString(value.trim());
}

function isoDate(value: string | undefined, field: string): string {
  if (!value) throw new QualityEvidenceRequestError(`${field} is required`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new QualityEvidenceRequestError(
      `${field} must be a valid ISO timestamp`,
    );
  return parsed.toISOString();
}

export function encodeQualityEvidenceCursor(
  cursor: QualityEvidenceCursor,
): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeQualityEvidenceCursor(
  value: string,
): QualityEvidenceCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<QualityEvidenceCursor>;
    if (
      parsed.version !== 2 ||
      typeof parsed.clientSlug !== "string" ||
      typeof parsed.from !== "string" ||
      typeof parsed.to !== "string" ||
      typeof parsed.finishedAt !== "string" ||
      typeof parsed.runId !== "string" ||
      typeof parsed.snapshotCreatedAt !== "string" ||
      typeof parsed.snapshotRunId !== "string"
    ) {
      throw new Error("invalid shape");
    }
    return {
      version: 2,
      clientSlug: parsed.clientSlug,
      from: isoDate(parsed.from, "cursor.from"),
      to: isoDate(parsed.to, "cursor.to"),
      finishedAt: isoDate(parsed.finishedAt, "cursor.finishedAt"),
      runId: parsed.runId,
      snapshotCreatedAt: isoDate(
        parsed.snapshotCreatedAt,
        "cursor.snapshotCreatedAt",
      ),
      snapshotRunId: parsed.snapshotRunId,
    };
  } catch (error) {
    if (error instanceof QualityEvidenceRequestError) throw error;
    throw new QualityEvidenceRequestError(
      "after must be a valid quality evidence cursor",
    );
  }
}

export function resolveQualityEvidencePageRequest(input: {
  clientSlug: string;
  after?: string;
  from?: string;
  to?: string;
  limit?: string | number;
  now?: Date;
}): QualityEvidencePageRequest {
  const slug = input.clientSlug.trim();
  if (!slug) throw new QualityEvidenceRequestError("client slug is required");

  const cursor = input.after ? decodeQualityEvidenceCursor(input.after) : null;
  if (cursor && cursor.clientSlug !== slug) {
    throw new QualityEvidenceRequestError(
      "after cursor belongs to another client",
    );
  }

  const now = input.now ?? new Date();
  const to = cursor?.to ?? isoDate(input.to ?? now.toISOString(), "to");
  const defaultFrom = new Date(
    new Date(to).getTime() - DEFAULT_WINDOW_MS,
  ).toISOString();
  const from = cursor?.from ?? isoDate(input.from ?? defaultFrom, "from");
  if (input.from && cursor && isoDate(input.from, "from") !== cursor.from) {
    throw new QualityEvidenceRequestError(
      "from does not match the cursor window",
    );
  }
  if (input.to && cursor && isoDate(input.to, "to") !== cursor.to) {
    throw new QualityEvidenceRequestError(
      "to does not match the cursor window",
    );
  }
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (fromMs > toMs)
    throw new QualityEvidenceRequestError("from must be before or equal to to");
  // A future upper bound lets an active run (or a late event) enter an
  // already-issued cursor after the first page, changing replay results.
  // Server-authored terminal/event timestamps make a non-future window a
  // stable point-in-time cut without copying mutable run state into cursors.
  if (toMs > now.getTime()) {
    throw new QualityEvidenceRequestError("to cannot be in the future");
  }
  if (toMs - fromMs > QUALITY_EVIDENCE_MAX_WINDOW_MS) {
    throw new QualityEvidenceRequestError(
      "quality evidence window cannot exceed 31 days",
    );
  }

  const parsedLimit =
    input.limit === undefined
      ? QUALITY_EVIDENCE_DEFAULT_LIMIT
      : Number(input.limit);
  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > QUALITY_EVIDENCE_MAX_LIMIT
  ) {
    throw new QualityEvidenceRequestError(
      `limit must be an integer between 1 and ${QUALITY_EVIDENCE_MAX_LIMIT}`,
    );
  }

  return {
    after: input.after ?? null,
    limit: parsedLimit,
    window: { from, to },
    cursor,
  };
}

function compareRuns(left: AgentRun, right: AgentRun): number {
  return (
    String(left.finishedAt).localeCompare(String(right.finishedAt)) ||
    left.id.localeCompare(right.id)
  );
}

function isExportableRun(run: AgentRun): boolean {
  const createdAt =
    typeof run.createdAt === "string" ? Date.parse(run.createdAt) : Number.NaN;
  const finishedAt =
    typeof run.finishedAt === "string"
      ? Date.parse(run.finishedAt)
      : Number.NaN;
  return (
    typeof run.id === "string" &&
    typeof run.threadId === "string" &&
    typeof run.runtime === "string" &&
    typeof run.createdAt === "string" &&
    typeof run.updatedAt === "string" &&
    ["completed", "failed", "cancelled"].includes(run.status) &&
    typeof run.finishedAt === "string" &&
    Number.isFinite(createdAt) &&
    Number.isFinite(finishedAt) &&
    finishedAt >= createdAt
  );
}

function isAfterCursor(
  run: AgentRun,
  cursor: QualityEvidenceCursor | null,
): boolean {
  if (!cursor) return true;
  return (
    String(run.finishedAt) > cursor.finishedAt ||
    (run.finishedAt === cursor.finishedAt && run.id > cursor.runId)
  );
}

function existedAtSnapshot(
  run: AgentRun,
  cursor: QualityEvidenceCursor | null,
): boolean {
  if (!cursor) return true;
  return (
    run.createdAt < cursor.snapshotCreatedAt ||
    (run.createdAt === cursor.snapshotCreatedAt &&
      run.id <= cursor.snapshotRunId)
  );
}

function isTenantRun(run: AgentRun, slug: string): boolean {
  if (typeof run.threadId !== "string" || !run.threadId.startsWith(`${slug}:`))
    return false;
  if (!run.input || typeof run.input !== "object" || Array.isArray(run.input))
    return true;
  const inputSlug = (run.input as Record<string, unknown>).slug;
  return inputSlug === undefined || inputSlug === slug;
}

function terminalAt(run: AgentRun): number | null {
  if (!run.finishedAt) return null;
  const parsed = new Date(run.finishedAt).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function possibleCorrection(text: string): boolean {
  return /(?:eso\s+no|no\s+(?:es|era|funcion|hiciste)|te\s+ped[ií]|quer[ií]a|reintenta|intenta\s+de\s+nuevo|no\s+puedo\s+ver|wrong|not\s+what|doesn['’]?t\s+work|try\s+again)/i.test(
    text,
  );
}

function followUpFor(
  run: AgentRun,
  runs: readonly AgentRun[],
  windowToMs: number,
): QualityFollowUpSignal | null {
  const endedAt = terminalAt(run);
  if (endedAt === null) return null;
  const upperBound = Math.min(windowToMs, endedAt + FOLLOW_UP_WINDOW_MS);
  const nextRun = runs
    .filter(
      (candidate) =>
        candidate.id !== run.id && candidate.threadId === run.threadId,
    )
    .filter((candidate) => {
      const createdAt = Date.parse(candidate.createdAt);
      return (
        Number.isFinite(createdAt) &&
        createdAt > endedAt &&
        createdAt <= upperBound
      );
    })
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )[0];
  if (!nextRun) return null;
  const input = redactedRecord(nextRun.input);
  const raw =
    typeof input?.userText === "string"
      ? input.userText
      : typeof input?.text === "string"
        ? input.text
        : "";
  if (!raw) return null;
  const text = redactQualityString(raw);
  const correction = possibleCorrection(text);
  return {
    text,
    ts: new Date(nextRun.createdAt).toISOString(),
    signal: correction ? "possible_correction" : "user_followup",
  };
}

function redactedRecord(
  value: unknown,
): Record<string, RedactedQualityValue> | null {
  const redacted = redactQualityValue(value);
  if (!redacted || Array.isArray(redacted) || typeof redacted !== "object")
    return null;
  return redacted;
}

function collectErrors(
  run: AgentRun,
  events: readonly AgentRunEvent[],
): QualityEvidenceError[] {
  const errors: QualityEvidenceError[] = [];
  if (run.error)
    errors.push({ source: "run", message: redactQualityString(run.error) });

  const output = redactedRecord(run.output);
  const detail = output?.errorDetail;
  if (detail && !Array.isArray(detail) && typeof detail === "object") {
    const category =
      typeof detail.category === "string" ? detail.category : undefined;
    const raw = typeof detail.raw === "string" ? detail.raw : category;
    if (raw) errors.push({ source: "output", category, message: raw });
  }

  for (const event of events) {
    if (
      ![
        "runtime_rejected",
        "runtime_unreachable",
        "cancel_failed",
        "failed",
      ].includes(event.type)
    )
      continue;
    const data = redactedRecord(event.data);
    const detail = data?.errorDetail;
    const structured =
      detail && !Array.isArray(detail) && typeof detail === "object"
        ? detail
        : null;
    const category =
      structured && typeof structured.category === "string"
        ? structured.category
        : event.type;
    const message =
      structured && typeof structured.raw === "string"
        ? structured.raw
        : typeof data?.error === "string"
          ? data.error
          : redactQualityString(JSON.stringify(data ?? { type: event.type }));
    errors.push({ source: "event", category, message });
  }
  return errors.slice(0, 1_000);
}

function collectProgress(
  events: readonly AgentRunEvent[],
): QualityEvidenceItem["progress"] {
  return events
    .filter(
      (event) =>
        event.type === "progress" &&
        typeof event.ts === "string" &&
        Number.isFinite(Date.parse(event.ts)),
    )
    .slice(0, 2_000)
    .map((event) => {
      const data = redactedRecord(event.data) ?? {};
      const kind = typeof data.kind === "string" ? data.kind : "progress";
      const label =
        typeof data.label === "string"
          ? data.label
          : typeof data.detail === "string"
            ? data.detail
            : kind;
      return {
        ts: event.ts,
        kind,
        label,
        target: typeof data.target === "string" ? data.target : null,
      };
    });
}

function artifactsFromImmutableReadbacks(
  run: AgentRun,
  clientSlug: string,
  expected: readonly AgentRunExpectedOutput[],
  events: readonly AgentRunEvent[],
): QualityEvidenceItem["artifacts"] {
  const readbacks = causalArtifactReadbacksFromEvents(run, clientSlug, events);
  return expected.map((item) => {
    const matches = readbacks
      .filter(
        (readback) =>
          readback.expectedPath === item.path &&
          readback.source === item.source,
      )
      .map((readback) => ({
        actualPath: readback.actualPath,
        observedAt: readback.observedAt,
        byteLength: readback.byteLength,
        modifiedAt: readback.modifiedAt,
        sha256: readback.sha256,
      }));
    return {
      ...item,
      state:
        matches.length > 0 ? ("verified" as const) : ("unverified" as const),
      readbacks: matches,
    };
  });
}

function safeTaskContract(
  contract: AgentRunTaskContractSnapshot | undefined,
  clientSlug: string,
): AgentRunTaskContractSnapshot | undefined {
  if (!contract) return undefined;
  const expectedOutputs = (
    Array.isArray(contract.expectedOutputs) ? contract.expectedOutputs : []
  )
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const path = normalizeQualityOutputPath(clientSlug, item.path, {
        allowGlob: true,
      });
      if (
        !path ||
        ![
          "deliverable_file",
          "output_documents",
          "output_files",
          "documents",
          "fallback",
        ].includes(item.source)
      )
        return null;
      return { path, source: item.source };
    })
    .filter((item): item is AgentRunExpectedOutput => item !== null)
    .filter(
      (item, index, list) =>
        list.findIndex((candidate) => candidate.path === item.path) === index,
    );
  return {
    name: optionalString(contract.name),
    type: optionalString(contract.type),
    status: optionalString(contract.status),
    completion: optionalString(contract.completion),
    doneCriteria: optionalString(contract.doneCriteria),
    deliverable: optionalString(contract.deliverable),
    expectedOutputs,
  };
}

function toEvidenceItem(
  run: AgentRun,
  clientSlug: string,
  events: readonly AgentRunEvent[],
  allRuns: readonly AgentRun[],
  windowToMs: number,
): QualityEvidenceItem {
  const errors = collectErrors(run, events);
  const taskContract = safeTaskContract(run.taskContract, clientSlug);
  const expectedOutputCount = taskContract?.expectedOutputs.length ?? 0;
  const artifacts = artifactsFromImmutableReadbacks(
    { ...run, taskContract },
    clientSlug,
    taskContract?.expectedOutputs ?? [],
    events,
  );
  const exportedArtifacts = artifacts.map((item) => ({
    ...item,
    path: redactQualityString(item.path),
    readbacks: item.readbacks.map((readback) => ({
      ...readback,
      actualPath: redactQualityString(readback.actualPath),
    })),
  }));
  const exportedTaskContract = taskContract
    ? {
        ...taskContract,
        expectedOutputs: taskContract.expectedOutputs.map((item) => ({
          ...item,
          path: redactQualityString(item.path),
        })),
      }
    : undefined;
  const taskCompletionVerified =
    artifacts.length > 0 &&
    artifacts.every((item) => item.state === "verified");
  const actionResultObserved = artifacts.some(
    (item) => item.state === "verified",
  );
  const replyDelivered = run.status === "completed";
  const technicalFailure = run.status === "failed" || errors.length > 0;
  const unverifiedCompletionCandidate =
    replyDelivered &&
    Boolean(run.taskId) &&
    expectedOutputCount > 0 &&
    !taskCompletionVerified;
  const evidenceState: QualityEvidenceState = technicalFailure
    ? "technical_failure"
    : run.status === "cancelled"
      ? "cancelled"
      : run.status === "queued" || run.status === "running"
        ? "in_progress"
        : unverifiedCompletionCandidate
          ? "unverified_completion"
          : "reply_only";
  const inputRecord = redactedRecord(run.input);
  const outputRecord = redactedRecord(run.output);
  const requestText =
    typeof inputRecord?.userText === "string"
      ? inputRecord.userText
      : typeof inputRecord?.text === "string"
        ? inputRecord.text
        : "";
  const responseText =
    typeof outputRecord?.text === "string" ? outputRecord.text : "";
  const outputErrorDetail = outputRecord?.errorDetail;
  const errorCategory =
    outputErrorDetail &&
    !Array.isArray(outputErrorDetail) &&
    typeof outputErrorDetail === "object" &&
    typeof outputErrorDetail.category === "string"
      ? outputErrorDetail.category
      : errors.find((error) => error.category)?.category;

  return {
    evidenceId: `quality:${run.id}`,
    runId: run.id,
    clientSlug,
    threadId: redactQualityString(run.threadId),
    taskId: optionalString(run.taskId) ?? null,
    taskContract: exportedTaskContract ?? null,
    runtime: redactQualityString(run.runtime),
    agent: optionalString(run.agent) ?? null,
    skill: optionalString(run.skill) ?? null,
    skills: Array.isArray(run.skills)
      ? run.skills
          .filter((value): value is string => typeof value === "string")
          .map(redactQualityString)
          .slice(0, 100)
      : [],
    skillMode: run.skillMode ?? null,
    scope: optionalString(inputRecord?.scope) ?? null,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    updatedAt: run.updatedAt,
    request: { text: requestText },
    response: { text: responseText, errorCategory: errorCategory ?? null },
    artifacts: exportedArtifacts,
    followup: followUpFor(run, allRuns, windowToMs),
    evidenceState,
    errors,
    progress: collectProgress(events),
    evidence: {
      replyDelivered,
      technicalFailure,
      taskBound: Boolean(run.taskId),
      expectedOutputCount,
      actionResultObserved,
      taskCompletionVerified,
      verificationMethod: taskCompletionVerified ? "artifact_readback" : null,
      // Candidate, never a verdict: today's ledger cannot prove task completion.
      unverifiedCompletionCandidate,
    },
  };
}

/**
 * Pure tenant/window filter and stable cursor paginator. IO belongs to the API
 * route; tests can exercise the evidence contract without filesystem state.
 */
export function buildQualityEvidencePage(
  input: BuildQualityEvidencePageInput,
): QualityEvidencePageResult {
  const fromMs = new Date(input.page.window.from).getTime();
  const toMs = new Date(input.page.window.to).getTime();
  const tenantRuns = input.runs.filter((run) =>
    isTenantRun(run, input.clientSlug),
  );
  const malformedRuns = tenantRuns.filter(
    (run) =>
      ["completed", "failed", "cancelled"].includes(run.status) &&
      !isExportableRun(run),
  );
  const snapshotRuns = tenantRuns
    .filter(
      (run) =>
        typeof run.id === "string" &&
        typeof run.createdAt === "string" &&
        Number.isFinite(Date.parse(run.createdAt)),
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  const snapshotLast = snapshotRuns[snapshotRuns.length - 1];
  const snapshotCreatedAt =
    input.page.cursor?.snapshotCreatedAt ?? snapshotLast?.createdAt;
  const snapshotRunId = input.page.cursor?.snapshotRunId ?? snapshotLast?.id;
  const candidates = input.runs
    .filter(isExportableRun)
    .filter((run) => isTenantRun(run, input.clientSlug))
    .filter((run) => existedAtSnapshot(run, input.page.cursor))
    .filter((run) => {
      const finishedAt = new Date(String(run.finishedAt)).getTime();
      return (
        Number.isFinite(finishedAt) &&
        finishedAt >= fromMs &&
        finishedAt <= toMs
      );
    })
    .filter((run) => isAfterCursor(run, input.page.cursor))
    .sort(compareRuns);

  const selected = candidates.slice(0, input.page.limit);
  const hasMore = candidates.length > selected.length;
  const eventsByRun = new Map<string, AgentRunEvent[]>();
  const runById = new Map(tenantRuns.map((run) => [run.id, run]));
  for (const event of input.events) {
    const owner = runById.get(event.runId);
    const eventAt =
      typeof event.ts === "string" ? Date.parse(event.ts) : Number.NaN;
    if (
      !owner ||
      owner.threadId !== event.threadId ||
      !Number.isFinite(eventAt) ||
      eventAt > toMs
    )
      continue;
    const list = eventsByRun.get(event.runId) ?? [];
    list.push(event);
    eventsByRun.set(event.runId, list);
  }
  const followUpRuns = tenantRuns
    .filter((run) => existedAtSnapshot(run, input.page.cursor))
    .filter(
      (run) =>
        Number.isFinite(Date.parse(run.createdAt)) &&
        Date.parse(run.createdAt) <= toMs,
    );
  const items = selected.map((run) =>
    toEvidenceItem(
      run,
      input.clientSlug,
      (eventsByRun.get(run.id) ?? [])
        .filter((event) => typeof event.ts === "string")
        .sort((left, right) => left.ts.localeCompare(right.ts)),
      followUpRuns,
      toMs,
    ),
  );
  const last = selected[selected.length - 1];
  const nextCursor =
    hasMore && last && snapshotCreatedAt && snapshotRunId
      ? encodeQualityEvidenceCursor({
          version: 2,
          clientSlug: input.clientSlug,
          from: input.page.window.from,
          to: input.page.window.to,
          finishedAt: String(last.finishedAt),
          runId: last.id,
          snapshotCreatedAt,
          snapshotRunId,
        })
      : null;

  return {
    items,
    nextCursor,
    hasMore,
    skippedMalformedRuns: malformedRuns.length,
  };
}
