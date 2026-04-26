"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CronItem {
  id: string;
  name: string;
  baseName: string;
  description: string;
  enabled: boolean;
  schedule: string;
  scheduleHuman: string;
  timezone: string;
  model: string;
  lastExecution: { date: string; status: string } | null;
  promptPreview: string;
  promptFull: string;
}

interface CronStats {
  total: number;
  active: number;
  lastRun: string | null;
}

interface Props {
  slug: string;
}

const CRON_ICONS: Record<string, string> = {
  "News Monitor": "📰",
  "Competitor Monitor": "🕵️",
  "Classify + Ideas": "💡",
  "Editorial Dispatch": "📬",
  "PAA Monitor": "❓",
  "Keyword Research": "🔑",
  "POV Bank Refresh": "🧠",
};

export function InputsTab({ slug }: Props) {
  const [crons, setCrons] = useState<CronItem[]>([]);
  const [stats, setStats] = useState<CronStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCron, setSelectedCron] = useState<CronItem | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchCrons = useCallback(() => {
    fetch(`/api/content-engine/crons?slug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setCrons(data.crons || []);
          setStats(data.stats || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { fetchCrons(); }, [fetchCrons]);

  const toggleCron = useCallback(async (jobId: string, enabled: boolean) => {
    setToggling(jobId);
    await fetch("/api/content-engine/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fields: { enabled } }),
    });
    fetchCrons();
    setToggling(null);
  }, [fetchCrons]);

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando crons...</p>;

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-[#E8E2D9] rounded-lg px-4 py-3 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <p className="text-2xl font-bold text-[#2C3E50]">{stats?.active || 0}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Crons Activos</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-lg px-4 py-3 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <p className="text-2xl font-bold text-[#2C3E50]">{stats?.total || 0}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Configurados</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-lg px-4 py-3 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <p className="text-sm font-medium text-[#2C3E50]">{stats?.lastRun || "Nunca"}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Ultima Ejecucion</p>
        </div>
      </div>

      {/* Cron list */}
      {crons.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl mb-3 block">🔍</span>
          <p className="text-sm text-muted-foreground">No hay crons de contenido configurados para {slug}</p>
          <p className="text-xs text-muted-foreground mt-1">Ejecuta <code>node scripts/content-engine-setup.js --slug {slug}</code></p>
        </div>
      ) : (
        <div className="space-y-2">
          {crons.map((cron) => (
            <div
              key={cron.id}
              className="bg-white border border-[#E8E2D9] rounded-lg overflow-hidden hover:border-rust/30 transition-colors cursor-pointer"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
              onClick={() => setSelectedCron(cron)}
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <span className="text-lg flex-shrink-0">{CRON_ICONS[cron.baseName] || "⚙️"}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#2C3E50] truncate">{cron.baseName}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">{cron.scheduleHuman}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{cron.description}</p>
                </div>

                {/* Last execution */}
                <div className="text-right flex-shrink-0">
                  {cron.lastExecution ? (
                    <div>
                      <span className="text-[10px] text-green-600 font-medium">✓ {cron.lastExecution.date}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Sin ejecuciones</span>
                  )}
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCron(cron.id, !cron.enabled);
                  }}
                  disabled={toggling === cron.id}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors flex-shrink-0 relative",
                    cron.enabled ? "bg-green-500" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                      cron.enabled ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Slider */}
      {selectedCron && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[500]"
            onClick={() => setSelectedCron(null)}
          />
          <div className="fixed top-0 right-0 h-screen w-[600px] max-w-[90vw] z-[501] bg-white dark:bg-[#1E1E2E] shadow-[-4px_0_24px_rgba(0,0,0,.15)] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E5E2DC] bg-[#FAFAF8] shrink-0">
              <button type="button" onClick={() => setSelectedCron(null)} className="text-lg text-[#7A7A7A] hover:text-[#1A1A1A] px-2 py-1 rounded-md hover:bg-[#E5E2DC] transition-colors">
                ✕
              </button>
              <span className="text-lg">{CRON_ICONS[selectedCron.baseName] || "⚙️"}</span>
              <span className="text-sm font-bold text-[#1A1A1A] truncate">{selectedCron.baseName}</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCron(selectedCron.id, !selectedCron.enabled)}
                  className={cn(
                    "text-[11px] px-3 py-1.5 rounded-md font-medium transition-colors",
                    selectedCron.enabled
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-600 border border-red-200"
                  )}
                >
                  {selectedCron.enabled ? "✅ Activo" : "❌ Inactivo"}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Descripcion</h3>
                <p className="text-sm text-[#2C3E50]">{selectedCron.description}</p>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Horario</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#2C3E50]">{selectedCron.scheduleHuman}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded font-mono">{selectedCron.schedule}</span>
                  <span className="text-[10px] text-muted-foreground">{selectedCron.timezone}</span>
                </div>
              </div>

              {/* Model */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Modelo</h3>
                <span className="text-sm text-[#2C3E50] font-mono bg-muted/20 px-2 py-0.5 rounded">{selectedCron.model}</span>
              </div>

              {/* Last execution */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ultima Ejecucion</h3>
                {selectedCron.lastExecution ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-600 font-medium">✓ {selectedCron.lastExecution.date}</span>
                    <span className="text-[10px] text-muted-foreground">({selectedCron.lastExecution.status})</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Nunca ejecutado</span>
                )}
              </div>

              {/* Prompt */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</h3>
                <pre className="text-[11px] text-[#2C3E50] bg-[#FAFAF8] border border-[#E8E2D9] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                  {selectedCron.promptFull}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-[#E5E2DC] bg-[#FAFAF8] shrink-0 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">ID: {selectedCron.id.slice(0, 8)}...</span>
              <span className="text-[10px] text-muted-foreground">{selectedCron.name}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
