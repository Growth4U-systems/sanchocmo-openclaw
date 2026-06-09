import { useState } from "react";
import { cn } from "@/lib/utils";

// Per-cron publish-channel picker for the Recurring Tasks page. Slack-only for
// now (the publish registry only registers slack); the saved `transport` field
// is explicit so a transport tab can be added later without a schema change.
// Reads/writes via /api/content-engine/cron-publish-config; channel list comes
// from /api/integrations/communication-options (same source as the Editorial
// Dispatch picker).

interface SlackChannel {
  id: string;
  name: string;
  is_private?: boolean;
  is_member?: boolean;
}

export function CronPublishChannel({ slug, cronKey }: { slug: string; cronKey: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string>("");
  const [currentName, setCurrentName] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [optRes, cfgRes] = await Promise.all([
        fetch(`/api/integrations/communication-options?slug=${slug}`).then((r) => r.json()),
        fetch(`/api/content-engine/cron-publish-config?slug=${slug}&cronKey=${cronKey}`).then((r) => r.json()),
      ]);
      const slackOpt = (optRes.transports || []).find((o: { transport: string }) => o.transport === "slack");
      setChannels(slackOpt?.channels || []);
      setChannelsError(slackOpt?.error || (slackOpt ? null : "Slack no está conectado para esta marca."));
      const cfg = cfgRes.config as { channel_id?: string; channel_name?: string } | null;
      setCurrentId(cfg?.channel_id || "");
      setCurrentName(cfg?.channel_name || "");
      setSelectedId(cfg?.channel_id || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && channels.length === 0 && !channelsError) load();
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    const name = channels.find((c) => c.id === selectedId)?.name;
    try {
      const res = await fetch("/api/content-engine/cron-publish-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, cronKey, transport: "slack", channel_id: selectedId, channel_name: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setCurrentId(selectedId);
      setCurrentName(name || "");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const label = currentId ? `📢 #${currentName || currentId}` : "📢 Canal";

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={toggle}
        title="Canal de publicación de este cron (Slack)"
        className={cn(
          "px-2 py-1 rounded text-xs font-semibold border-2 border-ink shadow-comic-sm transition-transform hover:-translate-y-0.5 max-w-[180px] truncate",
          currentId ? "bg-sage/20 text-ink" : "bg-card text-ink/70"
        )}
      >
        {label}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border-[3px] border-ink bg-card p-3 shadow-comic text-left">
          <div className="font-heading text-xs text-ink/70 uppercase tracking-wider mb-1">Canal de publicación (Slack)</div>
          {loading ? (
            <p className="text-xs text-ink/60 py-2">Cargando canales…</p>
          ) : channelsError ? (
            <p className="text-xs text-rust py-2">⚠️ {channelsError}</p>
          ) : channels.length === 0 ? (
            <p className="text-xs text-ink/60 py-2">Sin canales disponibles. Invitá al bot con <code>/invite @SanchoCMO</code>.</p>
          ) : (
            <>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="font-heading text-xs font-bold px-2 py-1.5 rounded-md border-2 border-ink bg-card text-ink w-full focus:outline-none"
              >
                <option value="">— elegí canal —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.is_private ? "🔒" : "#"}{c.name} {c.is_member === false ? "(no miembro)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink/55 mt-1">El bot debe estar invitado al canal para publicar.</p>
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setOpen(false)} className="text-xs font-semibold px-2 py-1 rounded border-2 border-ink bg-card">Cancelar</button>
                <button
                  onClick={save}
                  disabled={saving || !selectedId || selectedId === currentId}
                  className="text-xs font-semibold px-2 py-1 rounded border-2 border-ink bg-rust text-white disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </>
          )}
          {error && <p className="text-xs text-rust mt-2">❌ {error}</p>}
        </div>
      )}
    </div>
  );
}
