/**
 * Lightweight durable runner for Partnerships discovery.
 *
 * The durable state is the existing search record on disk. The in-memory set
 * only prevents duplicate execution inside the current process; if the process
 * restarts, the queued search is still visible and can be re-enqueued by the
 * next API hit or by the retry button.
 */

import { getSearch, listSearches, updateRunnerState } from "./discovery-store";
import { runDiscoverySearch } from "./discovery-runner";
import type {
  DiscoveryRunnerErrorCode,
  DiscoverySearchRecord,
} from "./discovery-types";

const active = new Set<string>();
const DEFAULT_STALE_RUNNING_MS = 30 * 60 * 1000;

export interface EnqueueDiscoverySearchRunOptions {
  slug: string;
  searchId: string;
  fixtures?: boolean;
}

export function discoveryJobId(searchId: string): string {
  return `partnerships.discovery:${searchId}`;
}

export function enqueueDiscoverySearchRun(
  options: EnqueueDiscoverySearchRunOptions,
): DiscoverySearchRecord {
  const search = getSearch(options.slug, options.searchId);
  if (!search) throw new Error(`Discovery search not found: ${options.searchId} (${options.slug})`);
  if (search.runner.status === "done") return search;

  const jobId = discoveryJobId(search.id);
  const key = activeKey(options.slug, search.id);
  const mode = options.fixtures ? "fixtures" : "live";
  const queued = updateRunnerState(options.slug, search.id, {
    status: active.has(key) ? "running" : "queued",
    mode,
    jobId,
    queuedAt: search.runner.queuedAt || new Date().toISOString(),
    startedAt: active.has(key) ? search.runner.startedAt : null,
    finishedAt: null,
    error: null,
    errorCode: null,
    retryable: false,
    stats: active.has(key) ? search.runner.stats : null,
  });

  if (!active.has(key)) {
    active.add(key);
    setTimeout(() => {
      void executeDiscoverySearchRun({ ...options, fixtures: mode === "fixtures" });
    }, 0);
  }

  return queued;
}

export function resumeQueuedDiscoverySearches(slug: string): string[] {
  const resumed: string[] = [];
  for (const search of listSearches(slug)) {
    const key = activeKey(slug, search.id);
    if (search.runner.status === "running" && !active.has(key) && isStaleRunning(search)) {
      updateRunnerState(slug, search.id, {
        status: "error",
        finishedAt: new Date().toISOString(),
        error: "El runner se interrumpió antes de terminar. Puedes reintentar la búsqueda.",
        errorCode: "job_interrupted",
        retryable: true,
      });
      continue;
    }
    if (search.runner.status !== "queued" || !isServerSideDiscoveryJob(search)) continue;
    enqueueDiscoverySearchRun({
      slug,
      searchId: search.id,
      fixtures: search.runner.mode === "fixtures",
    });
    resumed.push(search.id);
  }
  return resumed;
}

async function executeDiscoverySearchRun(options: Required<EnqueueDiscoverySearchRunOptions>): Promise<void> {
  const { slug, searchId, fixtures } = options;
  const key = activeKey(slug, searchId);
  const before = getSearch(slug, searchId);
  try {
    updateRunnerState(slug, searchId, {
      status: "running",
      mode: fixtures ? "fixtures" : "live",
      jobId: discoveryJobId(searchId),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      attempts: (before?.runner.attempts ?? 0) + 1,
      error: null,
      errorCode: null,
      retryable: false,
    });
    await runDiscoverySearch({ slug, searchId, fixtures });
  } catch (err) {
    const normalized = normalizeDiscoveryJobError(err);
    updateRunnerState(slug, searchId, {
      status: "error",
      finishedAt: new Date().toISOString(),
      error: normalized.message,
      errorCode: normalized.code,
      retryable: normalized.retryable,
    });
  } finally {
    active.delete(key);
  }
}

function activeKey(slug: string, searchId: string): string {
  return `${slug}:${searchId}`;
}

function isStaleRunning(search: DiscoverySearchRecord): boolean {
  const startedAt = search.runner.startedAt ? Date.parse(search.runner.startedAt) : 0;
  if (!startedAt) return false;
  const threshold =
    Number(process.env.PARTNERSHIPS_DISCOVERY_STALE_MS || "") ||
    DEFAULT_STALE_RUNNING_MS;
  return Date.now() - startedAt > threshold;
}

function isServerSideDiscoveryJob(search: DiscoverySearchRecord): boolean {
  return typeof search.runner.jobId === "string" && search.runner.jobId.startsWith("partnerships.discovery:");
}

function normalizeDiscoveryJobError(err: unknown): {
  message: string;
  code: DiscoveryRunnerErrorCode;
  retryable: boolean;
} {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("sin créditos") || lower.includes("no credits") || lower.includes("credit")) {
    return { message, code: "provider_no_credits", retryable: false };
  }
  if (lower.includes("scrapecreators_api_key") || lower.includes("no está configurada")) {
    return { message, code: "provider_missing_credentials", retryable: false };
  }
  if (lower.includes("clave inválida") || lower.includes("401") || lower.includes("403")) {
    return { message, code: "provider_auth_failed", retryable: false };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    return { message, code: "provider_timeout", retryable: true };
  }
  if (lower.includes("solo soporta instagram") || lower.includes("unsupported")) {
    return { message, code: "unsupported_network", retryable: false };
  }
  if (lower.includes("no candidates") || lower.includes("no produjo candidatos")) {
    return { message, code: "no_candidates", retryable: true };
  }
  if (lower.includes("yalc")) {
    return { message, code: "yalc_unavailable", retryable: true };
  }
  if (lower.includes("scrapecreators") || lower.includes("http 5")) {
    return { message, code: "provider_unavailable", retryable: true };
  }
  return { message, code: "runner_failed", retryable: true };
}
