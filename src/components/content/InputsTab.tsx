"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface NewsPromptConfig {
  file: string; pillarId: string; pillarName: string;
  prompts: string[]; sectorFilters: string[]; language: string[];
}
interface PaaConfig {
  file: string; pillarId: string; pillarName: string; queries: string[];
}
interface KeywordsConfig {
  file: string; pillarId: string; pillarName: string;
  keywords: string[]; target: string; language: string[];
}
interface Competitor {
  name: string; slug: string; tier?: string; web: string;
  linkedinCompany: string; founderName: string; founderLinkedin: string;
  pillarsRelevant: string[];
}
interface Creator {
  name: string; platforms: Record<string, string>; focus: string;
  pillarsRelevant: string[];
}
interface CadenceChannel {
  key: string; active: boolean; frequency: string;
  bestDays: string[]; bestTimes: string[];
  gating: string; contentTypes: string[];
  profiles: { name: string; handle: string; role: string; postsPerWeek: number }[];
}

interface AllConfigs {
  newsPrompts: NewsPromptConfig[];
  paaQueries: PaaConfig[];
  keywordsSeed: KeywordsConfig[];
  competitors: { direct: Competitor[]; indirect: Competitor[] };
  referenceCreators: Creator[];
  cadence: { businessModel: string; channels: CadenceChannel[] };
}

interface CronInfo { id: string; baseName: string; enabled: boolean; scheduleHuman: string; }

interface Props { slug: string; }

type Section = "news" | "competitors" | "creators" | "keywords" | "paa" | "cadence";

const SECTIONS: { key: Section; icon: string; label: string }[] = [
  { key: "news", icon: "📰", label: "News Prompts" },
  { key: "competitors", icon: "🕵️", label: "Competidores" },
  { key: "creators", icon: "👤", label: "Creadores Referentes" },
  { key: "keywords", icon: "🔑", label: "Keywords SEO" },
  { key: "paa", icon: "❓", label: "People Also Ask" },
  { key: "cadence", icon: "⏰", label: "Cadencia" },
];

export function InputsTab({ slug }: Props) {
  const [configs, setConfigs] = useState<AllConfigs | null>(null);
  const [crons, setCrons] = useState<CronInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section | null>(null);

  const fetchAll = useCallback(async () => {
    const [cfgRes, cronRes] = await Promise.all([
      fetch(`/api/content-engine/configs?slug=${slug}`).then(r => r.json()).catch(() => ({ configs: null })),
      fetch(`/api/content-engine/crons?slug=${slug}`).then(r => r.json()).catch(() => ({ crons: [] })),
    ]);
    setConfigs(cfgRes.configs || null);
    setCrons(cronRes.crons || []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleCron = useCallback(async (jobId: string, enabled: boolean) => {
    await fetch("/api/content-engine/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fields: { enabled } }),
    });
    fetchAll();
  }, [fetchAll]);

  const getCron = (baseName: string) => crons.find(c => c.baseName === baseName);

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando...</p>;
  if (!configs) return <p className="text-muted-foreground text-sm py-8 text-center">Sin configuracion</p>;

  const counts: Record<Section, string> = {
    news: `${configs.newsPrompts.length} pillars`,
    competitors: `${configs.competitors.direct.length + configs.competitors.indirect.length} monitoreados`,
    creators: `${configs.referenceCreators.length} creadores`,
    keywords: `${configs.keywordsSeed.length} pillars`,
    paa: `${configs.paaQueries.length} pillars`,
    cadence: `${configs.cadence.channels.filter(c => c.active).length} canales`,
  };

  const cronMap: Record<Section, string> = {
    news: "News Monitor", competitors: "Competitor Monitor",
    creators: "Competitor Monitor", keywords: "Keyword Research",
    paa: "PAA Monitor", cadence: "",
  };

  // Render list
  if (!activeSection) {
    return (
      <div className="space-y-2">
        {SECTIONS.map(sec => {
          const cron = cronMap[sec.key] ? getCron(cronMap[sec.key]) : null;
          return (
            <div key={sec.key} className="bg-white border border-[#E8E2D9] rounded-lg px-4 py-3" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setActiveSection(sec.key)} className="flex items-center gap-2 flex-1 text-left">
                  <span className="text-lg">{sec.icon}</span>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-[#2C3E50]">{sec.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{counts[sec.key]}</span>
                  </div>
                  {cron && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">⏰ {cron.scheduleHuman}</span>}
                  <span className="text-[#7A7A7A] text-xs">▸</span>
                </button>
                {cron && (
                  <button
                    type="button"
                    onClick={() => toggleCron(cron.id, !cron.enabled)}
                    className={cn("w-10 h-5 rounded-full transition-colors flex-shrink-0 relative", cron.enabled ? "bg-green-500" : "bg-gray-300")}
                  >
                    <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", cron.enabled ? "translate-x-5" : "translate-x-0.5")} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Render detail section
  return (
    <div>
      <button type="button" onClick={() => setActiveSection(null)} className="text-xs text-muted-foreground hover:text-rust mb-4 flex items-center gap-1">
        ← Volver a Inputs
      </button>

      {activeSection === "news" && <NewsPromptsForm configs={configs.newsPrompts} slug={slug} onSaved={fetchAll} />}
      {activeSection === "competitors" && <CompetitorsView competitors={configs.competitors} />}
      {activeSection === "creators" && <CreatorsView creators={configs.referenceCreators} />}
      {activeSection === "keywords" && <KeywordsForm configs={configs.keywordsSeed} slug={slug} onSaved={fetchAll} />}
      {activeSection === "paa" && <PaaForm configs={configs.paaQueries} slug={slug} onSaved={fetchAll} />}
      {activeSection === "cadence" && <CadenceView cadence={configs.cadence} />}
    </div>
  );
}

// ── NEWS PROMPTS FORM ─────────────────────────────────────────
function NewsPromptsForm({ configs, slug, onSaved }: { configs: NewsPromptConfig[]; slug: string; onSaved: () => void }) {
  const [data, setData] = useState(configs);
  const [saving, setSaving] = useState(false);

  const updatePrompt = (pi: number, qi: number, val: string) => {
    const next = [...data];
    next[pi] = { ...next[pi], prompts: [...next[pi].prompts] };
    next[pi].prompts[qi] = val;
    setData(next);
  };
  const addPrompt = (pi: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], prompts: [...next[pi].prompts, ""] };
    setData(next);
  };
  const removePrompt = (pi: number, qi: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], prompts: next[pi].prompts.filter((_, i) => i !== qi) };
    setData(next);
  };
  const save = async () => {
    setSaving(true);
    for (const p of data) {
      await fetch("/api/content-engine/configs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, configId: `news-prompts-${p.pillarId}`, data: p }),
      });
    }
    onSaved(); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">📰 News Prompts</h2>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50">
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
      {data.map((pillar, pi) => (
        <div key={pillar.pillarId} className="bg-white border border-[#E8E2D9] rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h3 className="text-xs font-semibold text-[#2C3E50] mb-2">{pillar.pillarId}: {pillar.pillarName}</h3>
          <div className="space-y-1.5">
            {pillar.prompts.map((q, qi) => (
              <div key={qi} className="flex items-center gap-1.5">
                <input
                  type="text" value={q} onChange={(e) => updatePrompt(pi, qi, e.target.value)}
                  className="flex-1 text-[12px] border border-[#E8E2D9] rounded px-2 py-1.5 focus:outline-none focus:border-rust"
                  placeholder="Query de busqueda..."
                />
                <button onClick={() => removePrompt(pi, qi)} className="text-red-400 hover:text-red-600 text-xs px-1">🗑️</button>
              </div>
            ))}
            <button onClick={() => addPrompt(pi)} className="text-[11px] text-rust hover:underline">+ Anadir query</button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-muted-foreground">Filtros:</span>
            {pillar.sectorFilters.map((f, i) => (
              <span key={i} className="text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">{f}</span>
            ))}
            <span className="text-[10px] text-muted-foreground ml-2">Idiomas:</span>
            {pillar.language.map((l, i) => (
              <span key={i} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{l}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── COMPETITORS VIEW ──────────────────────────────────────────
function CompetitorsView({ competitors }: { competitors: { direct: Competitor[]; indirect: Competitor[] } }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-[#2C3E50]">🕵️ Competidores</h2>
      <div>
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Directos ({competitors.direct.length})</h3>
        <div className="space-y-2">
          {competitors.direct.map((c) => (
            <div key={c.slug} className="bg-white border border-[#E8E2D9] rounded-lg p-3 text-xs" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-[#2C3E50]">{c.name}</span>
                {c.tier && <span className="text-[9px] bg-rust/10 text-rust px-1.5 py-0.5 rounded">Tier {c.tier}</span>}
              </div>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {c.web && <div>🌐 <a href={c.web} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{c.web.replace(/https?:\/\//, "")}</a></div>}
                {c.linkedinCompany && <div>💼 <a href={c.linkedinCompany} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a></div>}
                {c.founderName && <div>👤 {c.founderName} {c.founderLinkedin && <a href={c.founderLinkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>}</div>}
              </div>
              <div className="flex gap-1 mt-1.5">{c.pillarsRelevant.map((p, i) => <span key={i} className="text-[9px] bg-muted/40 px-1.5 py-0.5 rounded">{p}</span>)}</div>
            </div>
          ))}
        </div>
      </div>
      {competitors.indirect.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Indirectos ({competitors.indirect.length})</h3>
          <div className="space-y-2">
            {competitors.indirect.map((c) => (
              <div key={c.slug} className="bg-white border border-[#E8E2D9] rounded-lg p-3 text-xs" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <span className="font-semibold text-[#2C3E50]">{c.name}</span>
                <div className="flex gap-1 mt-1">{c.pillarsRelevant.map((p, i) => <span key={i} className="text-[9px] bg-muted/40 px-1.5 py-0.5 rounded">{p}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CREATORS VIEW ─────────────────────────────────────────────
function CreatorsView({ creators }: { creators: Creator[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-[#2C3E50]">👤 Creadores Referentes</h2>
      <div className="space-y-2">
        {creators.map((c, i) => (
          <div key={i} className="bg-white border border-[#E8E2D9] rounded-lg p-3 text-xs" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-[#2C3E50]">{c.name}</span>
              <div className="flex gap-1">{c.pillarsRelevant.map((p, j) => <span key={j} className="text-[9px] bg-muted/40 px-1.5 py-0.5 rounded">{p}</span>)}</div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-1">{c.focus}</p>
            <div className="flex gap-2 text-[10px]">
              {Object.entries(c.platforms).map(([platform, url]) => (
                <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{platform}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KEYWORDS FORM ─────────────────────────────────────────────
function KeywordsForm({ configs, slug, onSaved }: { configs: KeywordsConfig[]; slug: string; onSaved: () => void }) {
  const [data, setData] = useState(configs);
  const [saving, setSaving] = useState(false);

  const updateKw = (pi: number, ki: number, val: string) => {
    const next = [...data];
    next[pi] = { ...next[pi], keywords: [...next[pi].keywords] };
    next[pi].keywords[ki] = val;
    setData(next);
  };
  const addKw = (pi: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], keywords: [...next[pi].keywords, ""] };
    setData(next);
  };
  const removeKw = (pi: number, ki: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], keywords: next[pi].keywords.filter((_, i) => i !== ki) };
    setData(next);
  };
  const save = async () => {
    setSaving(true);
    for (const p of data) {
      await fetch("/api/content-engine/configs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, configId: `keywords-seed-${p.pillarId}`, data: p }),
      });
    }
    onSaved(); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">🔑 Keywords SEO</h2>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50">
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
      {data.map((pillar, pi) => (
        <div key={pillar.pillarId} className="bg-white border border-[#E8E2D9] rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h3 className="text-xs font-semibold text-[#2C3E50] mb-2">{pillar.pillarId}: {pillar.pillarName}</h3>
          <div className="space-y-1.5">
            {pillar.keywords.map((kw, ki) => (
              <div key={ki} className="flex items-center gap-1.5">
                <input type="text" value={kw} onChange={(e) => updateKw(pi, ki, e.target.value)}
                  className="flex-1 text-[12px] border border-[#E8E2D9] rounded px-2 py-1.5 focus:outline-none focus:border-rust" placeholder="Keyword..." />
                <button onClick={() => removeKw(pi, ki)} className="text-red-400 hover:text-red-600 text-xs px-1">🗑️</button>
              </div>
            ))}
            <button onClick={() => addKw(pi)} className="text-[11px] text-rust hover:underline">+ Anadir keyword</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PAA FORM ──────────────────────────────────────────────────
function PaaForm({ configs, slug, onSaved }: { configs: PaaConfig[]; slug: string; onSaved: () => void }) {
  const [data, setData] = useState(configs);
  const [saving, setSaving] = useState(false);

  const updateQ = (pi: number, qi: number, val: string) => {
    const next = [...data];
    next[pi] = { ...next[pi], queries: [...next[pi].queries] };
    next[pi].queries[qi] = val;
    setData(next);
  };
  const addQ = (pi: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], queries: [...next[pi].queries, ""] };
    setData(next);
  };
  const removeQ = (pi: number, qi: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], queries: next[pi].queries.filter((_, i) => i !== qi) };
    setData(next);
  };
  const save = async () => {
    setSaving(true);
    for (const p of data) {
      await fetch("/api/content-engine/configs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, configId: `paa-queries-${p.pillarId}`, data: p }),
      });
    }
    onSaved(); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">❓ People Also Ask</h2>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50">
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
      {data.map((pillar, pi) => (
        <div key={pillar.pillarId} className="bg-white border border-[#E8E2D9] rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h3 className="text-xs font-semibold text-[#2C3E50] mb-2">{pillar.pillarId}: {pillar.pillarName}</h3>
          <div className="space-y-1.5">
            {pillar.queries.map((q, qi) => (
              <div key={qi} className="flex items-center gap-1.5">
                <input type="text" value={q} onChange={(e) => updateQ(pi, qi, e.target.value)}
                  className="flex-1 text-[12px] border border-[#E8E2D9] rounded px-2 py-1.5 focus:outline-none focus:border-rust" placeholder="Query seed..." />
                <button onClick={() => removeQ(pi, qi)} className="text-red-400 hover:text-red-600 text-xs px-1">🗑️</button>
              </div>
            ))}
            <button onClick={() => addQ(pi)} className="text-[11px] text-rust hover:underline">+ Anadir query</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CADENCE VIEW ──────────────────────────────────────────────
function CadenceView({ cadence }: { cadence: { businessModel: string; channels: CadenceChannel[] } }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-[#2C3E50]">⏰ Cadencia</h2>
      <div className="space-y-2">
        {cadence.channels.map((ch) => (
          <div key={ch.key} className="bg-white border border-[#E8E2D9] rounded-lg p-3" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", ch.active ? "bg-green-500" : "bg-gray-300")} />
              <span className="text-sm font-semibold text-[#2C3E50] capitalize">{ch.key}</span>
              <span className="text-[10px] text-muted-foreground">{ch.frequency}</span>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded ml-auto", ch.gating === "ungated" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700")}>{ch.gating}</span>
            </div>
            {ch.profiles.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Perfiles: {ch.profiles.map(p => `${p.name} (${p.postsPerWeek}x/sem)`).join(", ")}
              </div>
            )}
            {ch.bestTimes.length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Horarios: {ch.bestTimes.join(", ")} · Dias: {ch.bestDays.join(", ")}
              </div>
            )}
            <div className="flex gap-1 mt-1.5">
              {ch.contentTypes.map((t, i) => <span key={i} className="text-[9px] bg-muted/40 px-1.5 py-0.5 rounded">{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
