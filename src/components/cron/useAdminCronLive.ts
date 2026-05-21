/**
 * useAdminCronLive — admin-only cross-brand snapshot of every cron.
 *
 * Parallel to useCronLive but consumes GET /api/recurring-tasks WITHOUT
 * a slug, which returns { [slug]: CronApi[], _system: CronApi[] }.
 *
 * Same polling cadence, flash store, mutations, and pending-click buffer
 * as useCronLive — kept in lockstep on purpose. If you change the polling
 * model in one, change it in the other (or extract a shared core).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CronApi, CronFlash } from "./types";
import { isEnabled } from "./types";

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

export interface UseAdminCronLiveResult {
  /** Brand crons grouped by slug. Excludes _system (see systemCrons). */
  cronsByBrand: Record<string, CronApi[]>;
  /** Brand slugs in insertion order. Useful for stable rendering order. */
  brandSlugs: string[];
  systemCrons: CronApi[];
  isLoading: boolean;
  isError: boolean;
  errorCount: number;
  flashByJob: Record<string, CronFlash>;
  pendingClicks: Record<string, number>;
  nowTick: number;
  run: (cronId: string) => Promise<void>;
  toggle: (cronId: string, enable: boolean) => Promise<void>;
  refetch: () => void;
}

export function useAdminCronLive(): UseAdminCronLiveResult {
  const queryClient = useQueryClient();

  const snapshotKey = useMemo(() => ["admin-cron-snapshot"] as const, []);

  const snapshot = useQuery<{
    cronsByBrand: Record<string, CronApi[]>;
    brandSlugs: string[];
    systemCrons: CronApi[];
  }>({
    queryKey: snapshotKey,
    queryFn: async () => {
      const res = await fetch("/api/recurring-tasks");
      if (!res.ok) throw new Error(`Admin snapshot failed: ${res.status}`);
      const raw = (await res.json()) as Record<string, unknown>;
      const cronsByBrand: Record<string, CronApi[]> = {};
      const brandSlugs: string[] = [];
      let systemCrons: CronApi[] = [];
      for (const [key, value] of Object.entries(raw)) {
        if (!Array.isArray(value)) continue;
        if (key === "_system") {
          systemCrons = value as CronApi[];
        } else {
          cronsByBrand[key] = value as CronApi[];
          brandSlugs.push(key);
        }
      }
      brandSlugs.sort();
      return { cronsByBrand, brandSlugs, systemCrons };
    },
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const cronsByBrand = useMemo(() => snapshot.data?.cronsByBrand ?? {}, [snapshot.data]);
  const brandSlugs = useMemo(() => snapshot.data?.brandSlugs ?? [], [snapshot.data]);
  const systemCrons = useMemo(() => snapshot.data?.systemCrons ?? [], [snapshot.data]);

  const allCrons = useMemo(
    () => [...brandSlugs.flatMap((s) => cronsByBrand[s] || []), ...systemCrons],
    [cronsByBrand, brandSlugs, systemCrons],
  );
  const allIds = useMemo(() => allCrons.map((c) => c.id), [allCrons]);

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

  const anyActive = useMemo(() => {
    if (Object.keys(pendingClicks).length > 0) return true;
    return allCrons.some((c) => c.running);
  }, [allCrons, pendingClicks]);

  // ── Live status query (cheap, polled fast while active) ─────────
  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["cron-status", allIds.join(",")],
    enabled: anyActive && allIds.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ ids: allIds.join(",") });
      const res = await fetch(`/api/system/cron-status?${params.toString()}`);
      if (res.status === 403) return { statuses: {} };
      if (!res.ok) throw new Error(`Status failed: ${res.status}`);
      return (await res.json()) as StatusResponse;
    },
    refetchInterval: anyActive ? STATUS_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const mergedCronsByBrand = useMemo(() => {
    if (!statusQuery.data?.statuses) return cronsByBrand;
    const statuses = statusQuery.data.statuses;
    const merged: Record<string, CronApi[]> = {};
    for (const slug of brandSlugs) {
      merged[slug] = mergeLive(cronsByBrand[slug] || [], statuses);
    }
    return merged;
  }, [cronsByBrand, brandSlugs, statusQuery.data]);

  const mergedSystemCrons = useMemo(
    () => mergeLive(systemCrons, statusQuery.data?.statuses),
    [systemCrons, statusQuery.data],
  );

  // ── Snapshot refresh cadence ────────────────────────────────────
  useEffect(() => {
    const interval = anyActive ? SNAPSHOT_FAST_MS : SNAPSHOT_IDLE_MS;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      queryClient.invalidateQueries({ queryKey: snapshotKey });
    }, interval);
    return () => clearInterval(id);
  }, [anyActive, queryClient, snapshotKey]);

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

  useEffect(() => {
    const map = timersRef.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // ── Detect run completions to flash success/error ───────────────
  const prevRunningRef = useRef<Set<string>>(new Set());
  const mergedAll = useMemo(
    () => [...brandSlugs.flatMap((s) => mergedCronsByBrand[s] || []), ...mergedSystemCrons],
    [mergedCronsByBrand, brandSlugs, mergedSystemCrons],
  );

  useEffect(() => {
    const currentRunning = new Set(mergedAll.filter((c) => c.running).map((c) => c.id));
    for (const id of prevRunningRef.current) {
      if (currentRunning.has(id)) continue;
      const c = mergedAll.find((c) => c.id === id);
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
  }, [mergedAll, setFlash, clearPending]);

  // ── Expire pending clicks ───────────────────────────────────────
  useEffect(() => {
    const now = Date.now();
    let changed = false;
    const next = { ...pendingClicks };
    for (const id of Object.keys(next)) {
      const expireAt = next[id];
      const cron = mergedAll.find((c) => c.id === id);
      if (cron?.running || now > expireAt) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) setPendingClicks(next);
  }, [mergedAll, pendingClicks]);

  // ── Now-tick ────────────────────────────────────────────────────
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
      const prev = queryClient.getQueryData<{
        cronsByBrand: Record<string, CronApi[]>;
        brandSlugs: string[];
        systemCrons: CronApi[];
      }>(snapshotKey);
      if (prev) {
        const flip = (c: CronApi): CronApi => (c.id === cronId ? { ...c, status: enable ? "active" : "paused" } : c);
        const flippedByBrand: Record<string, CronApi[]> = {};
        for (const slug of prev.brandSlugs) {
          flippedByBrand[slug] = (prev.cronsByBrand[slug] || []).map(flip);
        }
        queryClient.setQueryData(snapshotKey, {
          ...prev,
          cronsByBrand: flippedByBrand,
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
    () => mergedAll.filter((c) => (c.consecutive_errors ?? 0) > 0).length,
    [mergedAll],
  );

  return {
    cronsByBrand: mergedCronsByBrand,
    brandSlugs,
    systemCrons: mergedSystemCrons,
    isLoading: snapshot.isLoading,
    isError: snapshot.isError,
    errorCount,
    flashByJob,
    pendingClicks,
    nowTick,
    run,
    toggle,
    refetch: () => queryClient.invalidateQueries({ queryKey: snapshotKey }),
  };
}

// Re-export for convenience.
export { isEnabled };

// ── Helpers ───────────────────────────────────────────────────────

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
    if (c.running) return { ...c, running: null };
    return c;
  });
}
