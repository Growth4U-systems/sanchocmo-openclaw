/**
 * Data Sync Panel — "Sync with Prod" (staging only).
 *
 * Rendered at /dashboard/admin/settings?tab=datasync. Lets an admin pull
 * production's real client data into THIS staging instance so new features
 * can be tested against real data before they reach production.
 *
 * Two gates: the tab/panel only render on staging (NEXT_PUBLIC_ENV_LABEL set),
 * and the work itself is admin-only + staging-only on the server. The sync
 * mirrors staging's brand/ to match prod and takes a backup first.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ComicCard } from "@/components/shared/comic-card";

type Mode = "A" | "B" | "C";

const MODES: { key: Mode; title: string; desc: string }[] = [
  {
    key: "A",
    title: "A · Solo archivos",
    desc: "Todo el contenido de cada cliente (Markdown, briefs, SWOT, voz de marca, presentaciones). Reemplaza los archivos de staging por los de producción.",
  },
  {
    key: "B",
    title: "B · Archivos + base de datos",
    desc: "Lo de A, y además restaura la base de datos de staging desde la de prod (tasks, banco de POVs, inteligencia de reuniones).",
  },
  {
    key: "C",
    title: "C · Todo (C-segura)",
    desc: "Lo de B, y además el estado de los agentes. Excluye credenciales / tokens / sesiones: staging nunca actúa sobre cuentas reales de clientes.",
  },
];

// Inlined at build time. Empty on prod, set (e.g. "STAGING") on staging.
const ENV_LABEL = (process.env.NEXT_PUBLIC_ENV_LABEL || "").trim();
const IS_STAGING = !!ENV_LABEL && !ENV_LABEL.toUpperCase().includes("PROD");

type SyncState = "idle" | "running" | "ok" | "failed";

export function DataSyncPanel() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [mode, setMode] = useState<Mode>("A");
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<SyncState>("idle");
  const [logTail, setLogTail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const poll = useCallback(
    (syncId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(
            `/api/system/sync-prod-to-staging?id=${encodeURIComponent(syncId)}`,
          );
          const data = await r.json();
          if (typeof data.logTail === "string") setLogTail(data.logTail);
          if (data.state === "ok" || data.state === "failed") {
            setState(data.state);
            stopPolling();
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    },
    [stopPolling],
  );

  const startSync = useCallback(async () => {
    setConfirming(false);
    setState("running");
    setError(null);
    setLogTail("");
    try {
      const r = await fetch("/api/system/sync-prod-to-staging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await r.json();
      if (!r.ok || !data.syncId) {
        setState("failed");
        setError(data.error || `HTTP ${r.status}`);
        return;
      }
      poll(data.syncId);
    } catch (e) {
      setState("failed");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [mode, poll]);

  if (!IS_STAGING) {
    return (
      <ComicCard>
        <p className="text-sm text-muted-foreground py-4 text-center">
          Esta herramienta solo está disponible en <strong>staging</strong>.
        </p>
      </ComicCard>
    );
  }
  if (sessionStatus === "loading") {
    return (
      <ComicCard>
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando sesión…</p>
      </ComicCard>
    );
  }
  if (!isAdmin) {
    return (
      <ComicCard>
        <p className="text-sm text-muted-foreground py-4 text-center">
          Esta vista es solo para administradores.
        </p>
      </ComicCard>
    );
  }

  const running = state === "running";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-xl text-navy">⬇️ Sync with Prod</h2>
        <p className="text-sm text-muted-foreground">
          Trae a staging los datos reales de los clientes que viven en producción, para
          probar funcionalidades contra datos reales. Se hace un backup de staging antes de
          reemplazar nada.
        </p>
      </div>

      <ComicCard>
        <div className="space-y-3">
          {MODES.map((m) => (
            <label
              key={m.key}
              className={`flex gap-3 items-start p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                mode === m.key ? "border-ink bg-muted" : "border-ink/30 hover:border-ink/60"
              }`}
            >
              <input
                type="radio"
                name="sync-mode"
                value={m.key}
                checked={mode === m.key}
                onChange={() => setMode(m.key)}
                disabled={running}
                className="mt-1"
              />
              <span>
                <span className="block font-bold text-sm text-navy">{m.title}</span>
                <span className="block text-xs text-muted-foreground">{m.desc}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={running}
              className="px-4 py-2 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-md text-[13px] font-bold disabled:opacity-50 hover:brightness-105 transition"
            >
              {running ? "Sincronizando…" : `⬇️ Sync from Prod (${mode})`}
            </button>
          ) : (
            <>
              <span className="text-[13px] font-bold text-rust">
                ⚠️ Esto reemplaza los datos de staging con los de prod. ¿Seguro?
              </span>
              <button
                type="button"
                onClick={startSync}
                className="px-3 py-1.5 bg-rust text-white border-2 border-ink rounded-md text-[13px] font-bold hover:brightness-105 transition"
              >
                Sí, sincronizar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 border-2 border-ink rounded-md text-[13px] font-bold bg-background hover:bg-muted transition"
              >
                Cancelar
              </button>
            </>
          )}

          {state === "ok" && <span className="text-[13px] font-bold text-green-700">✓ Sync completo</span>}
          {state === "failed" && (
            <span className="text-[13px] font-bold text-destructive">✗ Falló{error ? `: ${error}` : ""}</span>
          )}
        </div>
      </ComicCard>

      {(running || logTail) && (
        <ComicCard>
          <h3 className="font-heading text-sm text-navy mb-2">
            {running ? "🔄 Progreso" : "📋 Log"}
          </h3>
          <pre className="text-[11px] leading-snug bg-ink text-background rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-72">
            {logTail || "Iniciando…"}
          </pre>
        </ComicCard>
      )}
    </section>
  );
}
