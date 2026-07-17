import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import {
  getLeadsSearchOperationalReadiness,
  type LeadsSearchOperationalReadiness,
} from "@/lib/leads/search-durable-worker";

const STARTUP_STATES = new Set([
  "not_started",
  "starting",
  "ready",
  "failed",
  "stopped",
]);
const SUPERVISOR_STATES = new Set([
  "stopped",
  "starting",
  "ready",
  "degraded",
  "stopping",
]);
const WORKER_STATES = new Set(["stopped", "starting", "ready", "degraded"]);
const SAFE_CODE = /^[a-z][a-z0-9._-]{0,95}$/;
const SCAN_COUNT_KEYS = [
  "pages",
  "scopesSeen",
  "scopesAllowed",
  "scopesRejected",
  "workersStarted",
  "workersWoken",
  "workersRetired",
  "workersFairnessYielded",
  "workerRetireOwnershipLost",
  "capacityDeferredScopes",
  "blockedProjectionPages",
  "blockedProjectionScopes",
  "blockedRunPages",
  "blockedRunScopes",
] as const;
const SUPERVISOR_COUNTER_KEYS = [
  "scansStarted",
  "scansSucceeded",
  "scansFailed",
  ...SCAN_COUNT_KEYS,
] as const;
const CAPACITY_COUNT_KEYS = [
  "maxWorkers",
  "activeWorkers",
  "stoppingWorkers",
  "occupiedWorkers",
  "availableSlots",
  "pendingDemands",
] as const;

export interface LeadsSearchReadinessSession {
  user?: { role?: unknown } | null;
}

export interface LeadsSearchReadinessRouteDependencies {
  getSession(
    req: NextApiRequest,
    res: NextApiResponse,
  ): Promise<LeadsSearchReadinessSession | null>;
  getReadiness(): LeadsSearchOperationalReadiness;
  logError?: (message: string) => void;
}

function safeLog(
  logger: ((message: string) => void) | undefined,
  message: string,
): void {
  try {
    (logger ?? console.error)(message);
  } catch {
    // Logging must not create a second response failure path.
  }
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} is invalid`);
  return value;
}

function count(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} is invalid`);
  }
  return value as number;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 64) {
    throw new Error(`${field} is invalid`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function code(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_CODE.test(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function visibility(
  value: unknown,
  field: string,
): "available" | "unavailable" {
  if (value !== "available" && value !== "unavailable") {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function redactedError(
  value: { code: string; at: string } | undefined,
  field: string,
) {
  return value
    ? {
        code: code(value.code, `${field}.code`),
        at: timestamp(value.at, `${field}.at`),
      }
    : undefined;
}

function redactedStartup(readiness: LeadsSearchOperationalReadiness) {
  const startup = readiness.startup;
  if (!STARTUP_STATES.has(startup.state)) {
    throw new Error("startup.state is invalid");
  }
  const lastError = redactedError(startup.lastError, "startup.lastError");
  return {
    state: startup.state,
    ...(startup.lastAttemptAt
      ? {
          lastAttemptAt: timestamp(
            startup.lastAttemptAt,
            "startup.lastAttemptAt",
          ),
        }
      : {}),
    ...(startup.lastSuccessAt
      ? {
          lastSuccessAt: timestamp(
            startup.lastSuccessAt,
            "startup.lastSuccessAt",
          ),
        }
      : {}),
    ...(lastError ? { lastError } : {}),
  };
}

function redactedRejectionCodes(value: Record<string, number>) {
  const entries = Object.entries(value);
  if (entries.length > 32) throw new Error("rejectionCodes is invalid");
  return Object.fromEntries(
    entries
      .map(([key, value]): [string, number] => [
        code(key, "rejectionCodes"),
        count(value, key),
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function redactedCounts<Key extends string>(
  value: unknown,
  keys: readonly Key[],
  field: string,
): Record<Key, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} is invalid`);
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    keys.map((key) => [key, count(record[key], `${field}.${key}`)]),
  ) as Record<Key, number>;
}

function redactedSupervisor(readiness: LeadsSearchOperationalReadiness) {
  const supervisor = readiness.supervisor;
  if (!supervisor) return null;
  if (!SUPERVISOR_STATES.has(supervisor.state)) {
    throw new Error("supervisor.state is invalid");
  }
  const workerStates = {
    stopped: 0,
    starting: 0,
    ready: 0,
    degraded: 0,
  };
  let startedWorkers = 0;
  for (const worker of supervisor.workers) {
    if (!WORKER_STATES.has(worker.state)) {
      throw new Error("worker.state is invalid");
    }
    workerStates[worker.state] += 1;
    if (boolean(worker.started, "worker.started")) startedWorkers += 1;
  }
  const lastError = redactedError(supervisor.lastError, "supervisor.lastError");
  const lastScan = supervisor.lastScan;
  return {
    state: supervisor.state,
    started: boolean(supervisor.started, "supervisor.started"),
    scanInFlight: boolean(supervisor.scanInFlight, "supervisor.scanInFlight"),
    ...(supervisor.startedAt
      ? {
          startedAt: timestamp(supervisor.startedAt, "supervisor.startedAt"),
        }
      : {}),
    ...(supervisor.lastFullSuccessAt
      ? {
          lastFullSuccessAt: timestamp(
            supervisor.lastFullSuccessAt,
            "supervisor.lastFullSuccessAt",
          ),
        }
      : {}),
    ...(lastError ? { lastError } : {}),
    ...(lastScan
      ? {
          lastScan: {
            startedAt: timestamp(lastScan.startedAt, "lastScan.startedAt"),
            ...(lastScan.finishedAt
              ? {
                  finishedAt: timestamp(
                    lastScan.finishedAt,
                    "lastScan.finishedAt",
                  ),
                }
              : {}),
            ...redactedCounts(lastScan, SCAN_COUNT_KEYS, "lastScan"),
            rejectionCodes: redactedRejectionCodes(lastScan.rejectionCodes),
          },
        }
      : {}),
    counters: redactedCounts(
      supervisor.counters,
      SUPERVISOR_COUNTER_KEYS,
      "counters",
    ),
    workers: {
      total: supervisor.workers.length,
      started: startedWorkers,
      byState: workerStates,
    },
    capacity: {
      ...redactedCounts(supervisor.capacity, CAPACITY_COUNT_KEYS, "capacity"),
      fairnessYieldInProgress: boolean(
        supervisor.capacity.fairnessYieldInProgress,
        "capacity.fairnessYieldInProgress",
      ),
    },
    managedWorkerCount: count(
      supervisor.managedWorkerCount,
      "supervisor.managedWorkerCount",
    ),
    capacityDeferredScopeCount: count(
      supervisor.capacityDeferredScopeCount,
      "supervisor.capacityDeferredScopeCount",
    ),
    capacityDeferredScopesTruncated: boolean(
      supervisor.capacityDeferredScopesTruncated,
      "supervisor.capacityDeferredScopesTruncated",
    ),
    blockedProjectionScopeCount: count(
      supervisor.blockedProjectionScopeCount,
      "supervisor.blockedProjectionScopeCount",
    ),
    blockedProjectionScopesTruncated: boolean(
      supervisor.blockedProjectionScopesTruncated,
      "supervisor.blockedProjectionScopesTruncated",
    ),
    blockedProjectionVisibility: visibility(
      supervisor.blockedProjectionVisibility,
      "supervisor.blockedProjectionVisibility",
    ),
    blockedRunScopeCount: count(
      supervisor.blockedRunScopeCount,
      "supervisor.blockedRunScopeCount",
    ),
    blockedRunScopesTruncated: boolean(
      supervisor.blockedRunScopesTruncated,
      "supervisor.blockedRunScopesTruncated",
    ),
    blockedRunVisibility: visibility(
      supervisor.blockedRunVisibility,
      "supervisor.blockedRunVisibility",
    ),
  };
}

export function createLeadsSearchReadinessHandler(
  dependencies: LeadsSearchReadinessRouteDependencies,
) {
  return async function leadsSearchReadinessHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    let session: LeadsSearchReadinessSession | null;
    try {
      session = await dependencies.getSession(req, res);
    } catch {
      safeLog(
        dependencies.logError,
        "[leads-search-readiness] session lookup failed",
      );
      return res.status(500).json({
        error: "Leads search readiness unavailable",
      });
    }
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (session.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      const readiness = dependencies.getReadiness();
      return res.status(200).json({
        schemaVersion: "leads-search-readiness.v1",
        operation: "leads.search",
        acceptsNewAdmissions: boolean(
          readiness.acceptsNewAdmissions,
          "acceptsNewAdmissions",
        ),
        rolloutReady: boolean(readiness.rolloutReady, "rolloutReady"),
        enabledTenantCount: count(
          readiness.enabledTenantCount,
          "enabledTenantCount",
        ),
        credentialBindingReady: boolean(
          readiness.credentialBindingReady,
          "credentialBindingReady",
        ),
        startup: redactedStartup(readiness),
        supervisor: redactedSupervisor(readiness),
      });
    } catch {
      safeLog(
        dependencies.logError,
        "[leads-search-readiness] readiness lookup failed",
      );
      return res.status(500).json({
        error: "Leads search readiness unavailable",
      });
    }
  };
}

const defaultHandler = createLeadsSearchReadinessHandler({
  getSession: (req, res) => getServerSession(req, res, authOptions),
  getReadiness: () => getLeadsSearchOperationalReadiness(),
});

export default defaultHandler;
