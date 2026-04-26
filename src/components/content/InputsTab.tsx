"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ConfigItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  count: string;
  schedule?: string;
  scheduleHuman?: string;
  cronJobId?: string;
  cronEnabled?: boolean;
  content: string;
  filePath: string;
}

interface Props {
  slug: string;
}

export function InputsTab({ slug }: Props) {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<ConfigItem | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editSchedule, setEditSchedule] = useState<string>("");

  const fetchConfigs = useCallback(async () => {
    try {
      // Fetch cron data for schedules
      const cronRes = await fetch(`/api/content-engine/crons?slug=${slug}`);
      const cronData = cronRes.ok ? await cronRes.json() : { crons: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const crons = (cronData.crons || []) as any[];

      // Fetch config files
      const configFiles = [
        { id: "news-prompts", name: "News Prompts", icon: "📰", description: "Que noticias buscamos por pillar. Queries de WebSearch.", cronBase: "News Monitor", filePath: `brand/${slug}/content/configs/news-prompts/P1.yml` },
        { id: "competitors", name: "Competidores", icon: "🕵️", description: "Competidores y sus redes sociales que monitoreamos.", cronBase: "Competitor Monitor", filePath: `brand/${slug}/content/configs/competitors/all-pillars.yml` },
        { id: "reference-creators", name: "Creadores Referentes", icon: "👤", description: "Voces del sector que seguimos como inspiracion.", cronBase: "Competitor Monitor", filePath: `brand/${slug}/content/configs/reference-creators/all-pillars.yml` },
        { id: "keywords", name: "Keywords SEO", icon: "🔑", description: "Keywords por pillar para blog SEO. BOFU-first.", cronBase: "Keyword Research", filePath: `brand/${slug}/content/configs/keywords-seed/P1.yml` },
        { id: "paa", name: "People Also Ask", icon: "❓", description: "Queries seed para extraer preguntas reales de la audiencia.", cronBase: "PAA Monitor", filePath: `brand/${slug}/content/configs/paa-queries/P1.yml` },
        { id: "cadence", name: "Cadencia", icon: "⏰", description: "Frecuencia y horarios de publicacion por canal y perfil.", cronBase: null, filePath: `brand/${slug}/content/configs/cadence-config.yml` },
      ];

      const items: ConfigItem[] = [];
      for (const cfg of configFiles) {
        // Find matching cron
        const cron = crons.find((c: { baseName: string }) => c.baseName === cfg.cronBase);

        // Fetch the actual file content
        let content = "";
        let count = "";
        try {
          const res = await fetch(`/api/docs/${cfg.filePath}`);
          const data = await res.json();
          if (data.ok && data.content) {
            content = data.content;
            // Count items in the content
            if (cfg.id === "competitors") {
              const matches = content.match(/- name:/g);
              count = `${matches?.length || 0} competidores`;
            } else if (cfg.id === "reference-creators") {
              const matches = content.match(/- name:/g);
              count = `${matches?.length || 0} creadores`;
            } else if (cfg.id === "cadence") {
              const matches = content.match(/active: true/g);
              count = `${matches?.length || 0} canales activos`;
            } else {
              // For per-pillar configs, count the pillar files
              count = "5 pillars";
            }
          } else {
            count = "Sin configurar";
          }
        } catch {
          count = "Error";
        }

        items.push({
          id: cfg.id,
          name: cfg.name,
          icon: cfg.icon,
          description: cfg.description,
          count,
          schedule: cron?.schedule,
          scheduleHuman: cron?.scheduleHuman,
          cronJobId: cron?.id,
          cronEnabled: cron?.enabled,
          content,
          filePath: cfg.filePath,
        });
      }

      setConfigs(items);
    } catch { /* ignore */ }
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleSave = useCallback(async () => {
    if (!selectedConfig) return;
    setSaving(true);
    try {
      await fetch(`/api/docs/${selectedConfig.filePath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });

      // If schedule was changed, update cron
      if (editSchedule && editSchedule !== selectedConfig.schedule && selectedConfig.cronJobId) {
        await fetch("/api/content-engine/crons", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: selectedConfig.cronJobId, fields: { schedule: editSchedule } }),
        });
      }

      fetchConfigs();
      setSelectedConfig(null);
    } catch { /* ignore */ }
    setSaving(false);
  }, [selectedConfig, editContent, editSchedule, fetchConfigs]);

  const openConfig = (cfg: ConfigItem) => {
    setSelectedConfig(cfg);
    setEditContent(cfg.content);
    setEditSchedule(cfg.schedule || "");
  };

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando configuracion...</p>;

  return (
    <div>
      {/* Config list */}
      <div className="space-y-2">
        {configs.map((cfg) => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => openConfig(cfg)}
            className="w-full bg-white border border-[#E8E2D9] rounded-lg px-4 py-3 text-left hover:border-rust/40 transition-colors"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{cfg.icon}</span>
              <span className="text-sm font-semibold text-[#2C3E50] flex-1">{cfg.name}</span>
              <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">{cfg.count}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {cfg.description}
              {cfg.scheduleHuman && (
                <span className="ml-2 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">⏰ {cfg.scheduleHuman}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Detail slider */}
      {selectedConfig && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[500]" onClick={() => setSelectedConfig(null)} />
          <div className="fixed top-0 right-0 h-screen w-[600px] max-w-[90vw] z-[501] bg-white shadow-[-4px_0_24px_rgba(0,0,0,.15)] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E5E2DC] bg-[#FAFAF8] shrink-0">
              <button type="button" onClick={() => setSelectedConfig(null)} className="text-lg text-[#7A7A7A] hover:text-[#1A1A1A] px-2 py-1 rounded-md hover:bg-[#E5E2DC] transition-colors">
                ✕
              </button>
              <span className="text-lg">{selectedConfig.icon}</span>
              <span className="text-sm font-bold text-[#1A1A1A] truncate flex-1">{selectedConfig.name}</span>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Guardando..." : "💾 Guardar"}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-xs text-muted-foreground">{selectedConfig.description}</p>

              {/* Schedule (editable) */}
              {selectedConfig.scheduleHuman && (
                <div>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Horario del cron</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editSchedule}
                      onChange={(e) => setEditSchedule(e.target.value)}
                      className="text-sm font-mono bg-[#FAFAF8] border border-[#E8E2D9] rounded px-2 py-1 w-40"
                      title="Cron expression (ej: 0 7 * * 1-5)"
                    />
                    <span className="text-[10px] text-muted-foreground">{selectedConfig.scheduleHuman}</span>
                  </div>
                </div>
              )}

              {/* Config content (editable) */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Configuracion</h3>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-[calc(100vh-280px)] text-[12px] font-mono bg-[#FAFAF8] border border-[#E8E2D9] rounded-lg p-3 resize-none focus:outline-none focus:border-rust leading-relaxed"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[#E5E2DC] bg-[#FAFAF8] shrink-0 text-[10px] text-muted-foreground truncate">
              {selectedConfig.filePath}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
