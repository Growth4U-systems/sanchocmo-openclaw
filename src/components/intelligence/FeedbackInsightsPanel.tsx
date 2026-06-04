import { useCallback, useEffect, useState } from "react";

type Category = "skill" | "client" | "form" | "other";

interface Insight {
  id: string;
  runId: string;
  docPath: string;
  skillId: string | null;
  category: Category;
  title: string;
  detail: string;
  proposedChange: string | null;
  status: string;
  createdAt: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  skill: "🛠️ Skill",
  client: "👤 Cliente",
  form: "📝 Formulario",
  other: "🤷 Otros",
};

const ORDER: Category[] = ["skill", "client", "form", "other"];

export function FeedbackInsightsPanel({ slug }: { slug: string }) {
  const [byCategory, setByCategory] = useState<Record<Category, Insight[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/clients/${slug}/feedback-insights`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo cargar");
        return data;
      })
      .then((data) => setByCategory(data.byCategory ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => load(), [load]);

  const act = useCallback(
    async (id: string, status: "accepted" | "dismissed") => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/clients/${slug}/feedback-insights/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Acción falló");
        }
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [slug, load],
  );

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Cargando sugerencias…</div>;
  if (error) return <div className="p-4 text-sm text-rust">{error}</div>;
  if (!byCategory) return <div className="p-4 text-sm text-muted-foreground">Sin datos.</div>;

  const total = ORDER.reduce((n, c) => n + byCategory[c].length, 0);
  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
        No hay sugerencias de mejora todavía. Se generan cuando un cliente deja feedback
        en un entregable y se corre el análisis.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ORDER.map((cat) => {
        const items = byCategory[cat];
        if (items.length === 0) return null;
        return (
          <section key={cat} className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 font-heading text-base text-navy">
              {CATEGORY_LABEL[cat]} <span className="text-muted-foreground">({items.length})</span>
            </h3>
            <div className="space-y-2">
              {items.map((ins) => (
                <div key={ins.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[13px] font-bold text-foreground">{ins.title}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">{ins.detail}</div>
                  {ins.proposedChange && (
                    <div className="mt-2 rounded border border-border bg-card p-2 text-[12px]">
                      <span className="font-bold">Cambio propuesto: </span>
                      {ins.proposedChange}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {ins.skillId ? `skill: ${ins.skillId} · ` : ""}
                    {ins.docPath}
                  </div>
                  {ins.status === "new" ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === ins.id}
                        onClick={() => act(ins.id, "accepted")}
                        className="rounded-md border border-border bg-rust/10 px-3 py-1 text-[12px] font-bold text-rust hover:bg-rust/15 disabled:opacity-50"
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === ins.id}
                        onClick={() => act(ins.id, "dismissed")}
                        className="rounded-md border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground hover:border-rust disabled:opacity-50"
                      >
                        Descartar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {ins.status}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
