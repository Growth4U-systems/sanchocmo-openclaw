/**
 * useCronLive — single source of truth for the cron panel.
 *
 * Wraps:
 *   - GET /api/recurring-tasks?slug=X&includeSystem=…   (full snapshot)
 *   - GET /api/system/cron-status?ids=…                 (cheap live polling)
 *   - POST /api/system/cron-run    { cronId }
 *   - POST /api/system/cron-toggle { cronId, enable }
 *
 * Provides:
 *   - `crons` (brand) and `systemCrons` (admin-only, when includeSystem)
 *   - `templates` (available templates not yet activated)
 *   - `flashByJob` (per-job transient feedback)
 *   - `nowTick` (advances every 1s while anything is running, else 30s)
 *   - `errorCount` (consecutive_errors > 0)
 *   - `run(cronId)` / `toggle(cronId, enable)` mutations with optimistic UX
 *
 * Polling cadence is adaptive:
 *   - idle:    snapshot @ 60s, status not polled
 *   - active:  status @ 5s, snapshot @ 20s
 * Active = any cron has `running` OR a recent local `pendingClickFresh`
 * buffer (90 s after a user click that hasn't surfaced server-side yet).
 *
 * Suspends polling while `document.hidden` to avoid background CPU.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CronApi, CronFlash } from "./types";
import { isEnabled } from "./types";

// Wire-side shape: /api/recurring-tasks groups by slug, so {[slug]: CronApi[]}.
interface RawSnapshot {
  [key: string]: unknown;
  _available_templates?: TemplateApi[];
  _system?: CronApi[];
}

export interface TemplateApi {
  template_key: string;
  name: string;
  description?: string;
  requires?: string;
  p00_task?: string | null;
}

interface LiveStatus {
  running: boolean;
  startedAtMs?: number;
  lastTouchMs?: number;
}

interface StatusResponse {
  statuses: Record<string, LiveStatus>;
}

const PENDING_CLICK_MS = 90_000;
const STATUS_POLL_MS = 5_000;
const SNAPSHOT_FAST_MS = 20_000;
const SNAPSHOT_IDLE_MS = 60_000;

export interface UseCronLiveResult {
  crons: CronApi[];
  systemCrons: CronApi[];
  templates: TemplateApi[];
  isLoading: boolean;
  isError: boolean;
  errorCount: number;
  flashByJob: Record<string, CronFlash>;
  pendingClicks: Record<string, number>;
  nowTick: number;
  run: (cronId: string) => Promise<void>;
  toggle: (cronId: string, enable: boolean) => Promise<void>;
  /** Force-refresh the snapshot — used by the manual reload button. */
  refetch: () => void;
  /** When true, the user is admin (server reports it in the snapshot). */
  canIncludeSystem: boolean;
}

export function useCronLive(
  slug: string | null,
  options: { includeSystem?: boolean } = {},
): UseCronLiveResult {
  const queryClient = useQueryClient();
  const includeSystem = !!options.includeSystem;

  // ── Snapshot query ──────────────────────────────────────────────
  const snapshotKey = useMemo(
    () => ["cron-snapshot", slug, includeSystem],
    [slug, includeSystem],
  );

  const snapshot = useQuery<{
    crons: CronApi[];
    systemCrons: CronApi[];
    templates: TemplateApi[];
  }>({
    queryKey: snapshotKey,
    enabled: !!slug,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      if (includeSystem) params.set("includeSystem", "1");
      const res = await fetch(`/api/recurring-tasks?${params.toString()}`);
      if (!res.ok) throw new Error(`Snapshot failed: ${res.status}`);
      const raw = (await res.json()) as RawSnapshot;
      const brand = slug && Array.isArray(raw[slug]) ? (raw[slug] as CronApi[]) : [];
      const system = Array.isArray(raw._system) ? raw._system : [];
      const templates = Array.isArray(raw._available_templates) ? raw._available_templates : [];
      return { crons: brand, systemCrons: system, templates };
    },
    refetchOnWindowFocus: true,
    retry: 2,
  });

  // Memoize array slices so downstream hooks don't see a "new" array every
  // render even when the snapshot hasn't changed.
  const crons = useMemo(() => snapshot.data?.crons ?? [], [snapshot.data]);
  const systemCrons = useMemo(() => snapshot.data?.systemCrons ?? [], [snapshot.data]);
  const templates = useMemo(() => snapshot.data?.templates ?? [], [snapshot.data]);

  const allIds = useMemo(
    () => [...crons, ...systemCrons].map((c) => c.id),
    [crons, systemCrons],
  );

  // ── Local "pending click" buffer ────────────────────────────────
  const [pendingClicks, setPendingClicks] = useState<Record<string, number>>({});
  const setPending = useCallback((id: string, expireAt: number) => {
    setPendingClicks((cur) => ({ ...cur, [id]: expireAt }));
  }, []);
  const clearPending = useCallback((id: string) => {
    setPendingClicks((cur) => {
      if (!(id in cur)) return cur;
      const next = { ...cur };
      delete next[id];
      return next;
    });
  }, []);

  // Compute "any cron is active" — used to gate fast polling.
  const anyActive = useMemo(() => {
    if (Object.keys(pendingClicks).length > 0) return true;
    return crons.some((c) => c.running) || systemCrons.some((c) => c.running);
  }, [crons, systemCrons, pendingClicks]);

  // ── Live status query (cheap, polled fast while active) ─────────
  // We only enable this query while `anyActive` is true. Idle panels rely on
  // the slower snapshot refresh.
  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["cron-status", allIds.join(",")],
    enabled: anyActive && allIds.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ ids: allIds.join(",") });
      const res = await fetch(`/api/system/cron-status?${params.toString()}`);
      // 403 means non-admin caller — fall back gracefully to empty.
      if (res.status === 403) return { statuses: {} };
      if (!res.ok) throw new Error(`Status failed: ${res.status}`);
      return (await res.json()) as StatusResponse;
    },
    refetchInterval: anyActive ? STATUS_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Merge live statuses INTO the cron objects so consumers see a unified
  // `cron.running` even when the snapshot is 20s stale.
  const mergedCrons = useMemo(
    () => mergeLive(crons, statusQuery.data?.statuses),
    [crons, statusQuery.data],
  );
  const mergedSystemCrons = useMemo(
    () => mergeLive(systemCrons, statusQuery.data?.statuses),
    [systemCrons, statusQuery.data],
  );

  // ── Snapshot refresh cadence ────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    const interval = anyActive ? SNAPSHOT_FAST_MS : SNAPSHOT_IDLE_MS;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      queryClient.invalidateQueries({ queryKey: snapshotKey });
    }, interval);
    return () => clearInterval(id);
  }, [slug, anyActive, queryClient, snapshotKey]);

  // ── Flash store ─────────────────────────────────────────────────
  const [flashByJob, setFlashByJob] = useState<Record<string, CronFlash>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const setFlash = useCallback((id: string, flash: CronFlash, autoDismissMs?: number) => {
    setFlashByJob((cur) => ({ ...cur, [id]: flash }));
    const prev = timersRef.current.get(id);
    if (prev) clearTimeout(prev);
    if (autoDismissMs && autoDismissMs > 0) {
      const t = setTimeout(() => {
        setFlashByJob((cur) => {
          if (cur[id]?.createdAt !== flash.createdAt) return cur;
          const next = { ...cur };
          delete next[id];
          return next;
        });
        timersRef.current.delete(id);
      }, autoDismissMs);
      timersRef.current.set(id, t);
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const map = timersRef.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // ── Detect run completions to flash success/error ───────────────
  const prevRunningRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentRunning = new Set(
      [...mergedCrons, ...mergedSystemCrons].filter((c) => c.running).map((c) => c.id),
    );
    for (const id of prevRunningRef.current) {
      if (currentRunning.has(id)) continue;
      const c = [...mergedCrons, ...mergedSystemCrons].find((c) => c.id === id);
      if (!c) continue;
      const ok = (c.last_status ?? "ok") === "ok";
      setFlash(
        id,
        {
          kind: ok ? "ok" : "error",
          message: ok
            ? c.last_finding || "✓ Terminó · última ejecución actualizada"
            : c.last_error || c.last_diagnostic_summary || "✗ Terminó con error",
          createdAt: Date.now(),
        },
        ok ? 6_000 : 10_000,
      );
      clearPending(id);
    }
    prevRunningRef.current = currentRunning;
  }, [mergedCrons, mergedSystemCrons, setFlash, clearPending]);

  // ── Expire pending clicks once server confirms or buffer elapses ─
  useEffect(() => {
    const now = Date.now();
    let changed = false;
    const next = { ...pendingClicks };
    for (const id of Object.keys(next)) {
      const expireAt = next[id];
      const cron = [...mergedCrons, ...mergedSystemCrons].find((c) => c.id === id);
      if ((cron?.running) || now > expireAt) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) setPendingClicks(next);
  }, [mergedCrons, mergedSystemCrons, pendingClicks]);

  // ── Now-tick for live counter ───────────────────────────────────
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const interval = anyActive ? 1_000 : 30_000;
    const id = setInterval(() => setNowTick((n) => n + 1), interval);
    return () => clearInterval(id);
  }, [anyActive]);

  // ── Mutations ───────────────────────────────────────────────────
  const runMut = useMutation({
    mutationFn: async (cronId: string) => {
      const res = await fetch("/api/system/cron-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Run failed (${res.status})`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return data;
    },
  });

  const run = useCallback(
    async (cronId: string) => {
      setPending(cronId, Date.now() + PENDING_CLICK_MS);
      setFlash(
        cronId,
        { kind: "queued", message: "Lanzada · esperando primer evento…", createdAt: Date.now() },
        12_000,
      );
      try {
        await runMut.mutateAsync(cronId);
        // Eagerly refresh snapshot to pick up state ASAP.
        queryClient.invalidateQueries({ queryKey: snapshotKey });
      } catch (err) {
        clearPending(cronId);
        const e = err as Error & { status?: number };
        const isConflict = e.status === 409;
        setFlash(
          cronId,
          {
            kind: "error",
            message: isConflict ? "Ya está corriendo" : (e.message || "No se pudo lanzar"),
            createdAt: Date.now(),
          },
          8_000,
        );
        // Sync UI with reality if we conflicted with a run already in flight.
        if (isConflict) queryClient.invalidateQueries({ queryKey: ["cron-status"] });
      }
    },
    [runMut, queryClient, snapshotKey, setFlash, setPending, clearPending],
  );

  const toggleMut = useMutation({
    mutationFn: async (vars: { cronId: string; enable: boolean }) => {
      const res = await fetch("/api/system/cron-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Toggle failed (${res.status})`);
      return data;
    },
  });

  const toggle = useCallback(
    async (cronId: string, enable: boolean) => {
      // Optimistic update: flip status in the cached snapshot.
      const prev = queryClient.getQueryData<{ crons: CronApi[]; systemCrons: CronApi[]; templates: TemplateApi[] }>(snapshotKey);
      if (prev) {
        const flip = (c: CronApi): CronApi => (c.id === cronId ? { ...c, status: enable ? "active" : "paused" } : c);
        queryClient.setQueryData(snapshotKey, {
          ...prev,
          crons: prev.crons.map(flip),
          systemCrons: prev.systemCrons.map(flip),
        });
      }
      try {
        await toggleMut.mutateAsync({ cronId, enable });
        setFlash(
          cronId,
          { kind: "ok", message: enable ? "Activado" : "Pausado", createdAt: Date.now() },
          4_000,
        );
        queryClient.invalidateQueries({ queryKey: snapshotKey });
      } catch (err) {
        // Revert.
        if (prev) queryClient.setQueryData(snapshotKey, prev);
        setFlash(
          cronId,
          { kind: "error", message: err instanceof Error ? err.message : "Falló el toggle", createdAt: Date.now() },
          8_000,
        );
      }
    },
    [toggleMut, queryClient, snapshotKey, setFlash],
  );

  const errorCount = useMemo(
    () => [...mergedCrons, ...mergedSystemCrons].filter((c) => (c.consecutive_errors ?? 0) > 0).length,
    [mergedCrons, mergedSystemCrons],
  );

  return {
    crons: mergedCrons,
    systemCrons: mergedSystemCrons,
    templates,
    isLoading: snapshot.isLoading,
    isError: snapshot.isError,
    errorCount,
    flashByJob,
    pendingClicks,
    nowTick,
    run,
    toggle,
    refetch: () => queryClient.invalidateQueries({ queryKey: snapshotKey }),
    canIncludeSystem: includeSystem,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

/** Overlay live statuses onto crons so `cron.running` reflects either the
 *  snapshot (20s) or the live status (5s), whichever is fresher. */
function mergeLive(crons: CronApi[], statuses: Record<string, LiveStatus> | undefined): CronApi[] {
  if (!statuses) return crons;
  return crons.map((c) => {
    const live = statuses[c.id];
    if (!live) return c;
    if (live.running) {
      return {
        ...c,
        running: {
          startedAtMs: live.startedAtMs ?? Date.now(),
          lastTouchMs: live.lastTouchMs ?? Date.now(),
          sessionId: c.running?.sessionId ?? null,
        },
      };
    }
    // Live says NOT running — but snapshot still has running. The snapshot
    // is stale (older read), so trust the live signal. (Inverse direction
    // is handled by the snapshot refresh itself.)
    if (c.running) return { ...c, running: null };
    return c;
  });
}

// Re-export so callers can use isEnabled without an extra import.
export { isEnabled };
