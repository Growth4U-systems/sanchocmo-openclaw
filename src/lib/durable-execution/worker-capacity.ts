export const DEFAULT_DURABLE_EXECUTION_MAX_WORKERS = 32 as const;
export const MAX_DURABLE_EXECUTION_MAX_WORKERS = 256 as const;

export interface DurableExecutionWorkerCapacityReport {
  maxWorkers: number;
  activeWorkers: number;
  stoppingWorkers: number;
  occupiedWorkers: number;
  availableSlots: number;
  pendingDemands: number;
  fairnessYieldInProgress: boolean;
}

export class DurableExecutionWorkerCapacityError extends Error {
  readonly code = "durable_execution_worker_capacity_deferred" as const;

  constructor(readonly capacity: DurableExecutionWorkerCapacityReport) {
    super("Durable execution worker capacity is exhausted");
    this.name = "DurableExecutionWorkerCapacityError";
  }
}

export function isDurableExecutionWorkerCapacityError(
  error: unknown,
): error is DurableExecutionWorkerCapacityError {
  return (
    error instanceof DurableExecutionWorkerCapacityError ||
    (!!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "durable_execution_worker_capacity_deferred")
  );
}

export interface DurableExecutionWorkerCapacityReservation {
  readonly ownerId: string;
  readonly scopeKey: string;
  readonly demandId: string;
}

interface MutableCapacityReservation extends DurableExecutionWorkerCapacityReservation {
  state: "active" | "stopping";
}

interface DurableExecutionWorkerDemand {
  demandId: string;
  scopeKey: string;
}

export class DurableExecutionWorkerScopeReservedError extends Error {
  readonly code = "durable_execution_worker_scope_reserved" as const;

  constructor(readonly scopeKey: string) {
    super("Durable execution scope already has a process-local worker");
    this.name = "DurableExecutionWorkerScopeReservedError";
  }
}

export function isDurableExecutionWorkerScopeReservedError(
  error: unknown,
): error is DurableExecutionWorkerScopeReservedError {
  return (
    error instanceof DurableExecutionWorkerScopeReservedError ||
    (!!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "durable_execution_worker_scope_reserved")
  );
}

function normalizedIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty`);
  return normalized;
}

function normalizeMaxWorkers(value: number | undefined): number {
  const maxWorkers = value ?? DEFAULT_DURABLE_EXECUTION_MAX_WORKERS;
  if (
    !Number.isSafeInteger(maxWorkers) ||
    maxWorkers < 1 ||
    maxWorkers > MAX_DURABLE_EXECUTION_MAX_WORKERS
  ) {
    throw new Error(
      `maxWorkers must be an integer from 1 to ${MAX_DURABLE_EXECUTION_MAX_WORKERS}`,
    );
  }
  return maxWorkers;
}

/**
 * Process-local capacity authority shared by every durable runtime. A slot is
 * retained while a worker drains so stop/start races cannot exceed the bound.
 */
export class DurableExecutionWorkerCapacityLimiter {
  readonly maxWorkers: number;
  private readonly reservations = new Map<string, MutableCapacityReservation>();
  private readonly reservationOwnerByScope = new Map<string, string>();
  private readonly demands: DurableExecutionWorkerDemand[] = [];
  private readonly demandById = new Map<string, DurableExecutionWorkerDemand>();
  private readonly demandIdByScope = new Map<string, string>();
  private fairnessYieldOwnerId?: string;

  constructor(maxWorkers?: number) {
    this.maxWorkers = normalizeMaxWorkers(maxWorkers);
  }

  reserve(
    ownerId: string,
    scopeKey: string,
    demandId: string,
  ): DurableExecutionWorkerCapacityReservation {
    const normalizedOwnerId = normalizedIdentity(
      ownerId,
      "Durable worker capacity ownerId",
    );
    const normalizedScopeKey = normalizedIdentity(
      scopeKey,
      "Durable worker capacity scopeKey",
    );
    const normalizedDemandId = normalizedIdentity(
      demandId,
      "Durable worker capacity demandId",
    );
    if (this.reservations.has(normalizedOwnerId)) {
      throw new Error("Durable worker capacity ownerId is already reserved");
    }
    if (this.reservationOwnerByScope.has(normalizedScopeKey)) {
      throw new DurableExecutionWorkerScopeReservedError(normalizedScopeKey);
    }

    this.enqueueDemand(normalizedDemandId, normalizedScopeKey);
    const head = this.demands[0];
    if (
      this.reservations.size >= this.maxWorkers ||
      head?.demandId !== normalizedDemandId
    ) {
      throw new DurableExecutionWorkerCapacityError(this.report());
    }
    this.removeDemand(normalizedDemandId);
    const reservation: MutableCapacityReservation = {
      ownerId: normalizedOwnerId,
      scopeKey: normalizedScopeKey,
      demandId: normalizedDemandId,
      state: "active",
    };
    this.reservations.set(normalizedOwnerId, reservation);
    this.reservationOwnerByScope.set(normalizedScopeKey, normalizedOwnerId);
    return reservation;
  }

  cancelDemand(demandId: string): boolean {
    return this.removeDemand(demandId.trim());
  }

  /**
   * Globally admits at most one cooperative yield while capacity is full.
   * The yielded scope joins the FIFO tail and cannot reclaim the released slot
   * ahead of the demand that caused the handoff.
   */
  claimFairnessYield(
    reservation: DurableExecutionWorkerCapacityReservation,
  ): boolean {
    const current = this.reservations.get(reservation.ownerId);
    if (
      current !== reservation ||
      current.state !== "active" ||
      this.fairnessYieldOwnerId !== undefined ||
      this.demands.length === 0 ||
      this.reservations.size < this.maxWorkers
    ) {
      return false;
    }
    // A normal or fairness drain already in progress will release capacity;
    // yielding another worker would overshoot the single-slot handoff.
    for (const candidate of this.reservations.values()) {
      if (candidate.state === "stopping") return false;
    }
    current.state = "stopping";
    this.fairnessYieldOwnerId = current.ownerId;
    this.enqueueDemand(current.demandId, current.scopeKey);
    return true;
  }

  markStopping(
    reservation: DurableExecutionWorkerCapacityReservation,
  ): boolean {
    const current = this.reservations.get(reservation.ownerId);
    if (current !== reservation) return false;
    current.state = "stopping";
    return true;
  }

  release(reservation: DurableExecutionWorkerCapacityReservation): boolean {
    const current = this.reservations.get(reservation.ownerId);
    if (current !== reservation) return false;
    this.reservations.delete(reservation.ownerId);
    if (
      this.reservationOwnerByScope.get(current.scopeKey) === current.ownerId
    ) {
      this.reservationOwnerByScope.delete(current.scopeKey);
    }
    if (this.fairnessYieldOwnerId === current.ownerId) {
      this.fairnessYieldOwnerId = undefined;
    }
    return true;
  }

  report(): DurableExecutionWorkerCapacityReport {
    let activeWorkers = 0;
    let stoppingWorkers = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.state === "active") activeWorkers += 1;
      else stoppingWorkers += 1;
    }
    const occupiedWorkers = activeWorkers + stoppingWorkers;
    return {
      maxWorkers: this.maxWorkers,
      activeWorkers,
      stoppingWorkers,
      occupiedWorkers,
      availableSlots: Math.max(0, this.maxWorkers - occupiedWorkers),
      pendingDemands: this.demands.length,
      fairnessYieldInProgress: this.fairnessYieldOwnerId !== undefined,
    };
  }

  private enqueueDemand(demandId: string, scopeKey: string): void {
    const current = this.demandById.get(demandId);
    if (current) {
      if (current.scopeKey !== scopeKey) {
        throw new Error("Durable worker demandId changed exact scope");
      }
      return;
    }
    const scopeDemandId = this.demandIdByScope.get(scopeKey);
    if (scopeDemandId && scopeDemandId !== demandId) {
      // One exact scope needs one process-local poller and therefore only one
      // FIFO position. A competing runtime must not poison the queue.
      throw new DurableExecutionWorkerScopeReservedError(scopeKey);
    }
    const demand = { demandId, scopeKey };
    this.demands.push(demand);
    this.demandById.set(demandId, demand);
    this.demandIdByScope.set(scopeKey, demandId);
  }

  private removeDemand(demandId: string): boolean {
    const demand = this.demandById.get(demandId);
    if (!demand) return false;
    this.demandById.delete(demandId);
    if (this.demandIdByScope.get(demand.scopeKey) === demandId) {
      this.demandIdByScope.delete(demand.scopeKey);
    }
    const index = this.demands.indexOf(demand);
    if (index >= 0) this.demands.splice(index, 1);
    return true;
  }
}

type DurableExecutionCapacityGlobal = typeof globalThis & {
  __sanchoDurableExecutionWorkerCapacityLimiter?: DurableExecutionWorkerCapacityLimiter;
};

/** Shared by default across every DurableExecutionRuntime in this process. */
export function processDurableExecutionWorkerCapacityLimiter(): DurableExecutionWorkerCapacityLimiter {
  const globalState = globalThis as DurableExecutionCapacityGlobal;
  if (!globalState.__sanchoDurableExecutionWorkerCapacityLimiter) {
    globalState.__sanchoDurableExecutionWorkerCapacityLimiter =
      new DurableExecutionWorkerCapacityLimiter();
  }
  return globalState.__sanchoDurableExecutionWorkerCapacityLimiter;
}
