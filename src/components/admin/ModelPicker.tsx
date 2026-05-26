import { useMemo, useState } from "react";
import { useModelCatalog, type CatalogModel, type CatalogProvider } from "@/hooks/useModels";
import { cn } from "@/lib/utils";

interface ModelPickerProps {
  value: string | null;
  onChange: (model: string | null) => void;
  allowInherit?: boolean;
  inheritLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

function authBadge(p: CatalogProvider): string {
  if (!p.configured) return "missing";
  if (p.authKind === "oauth" || p.authKind === "token") return "sub";
  if (p.authKind === "env") return "env key";
  if (p.authKind === "apiKey") return "api key";
  return p.authKind;
}

function groupModelsByProvider(
  models: CatalogModel[],
  providers: CatalogProvider[],
  showAll: boolean,
  alwaysIncludeId: string | null
): Array<{ provider: CatalogProvider; models: CatalogModel[] }> {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const groups = new Map<string, CatalogModel[]>();
  for (const m of models) {
    const isAlwaysIncluded = alwaysIncludeId !== null && m.id === alwaysIncludeId;
    if (!showAll && !m.curated && !isAlwaysIncluded) continue;
    if (!groups.has(m.provider)) groups.set(m.provider, []);
    groups.get(m.provider)!.push(m);
  }
  const result: Array<{ provider: CatalogProvider; models: CatalogModel[] }> = [];
  for (const [pid, list] of groups) {
    const provider = byId.get(pid);
    if (!provider) continue;
    list.sort((a, b) => a.id.localeCompare(b.id));
    result.push({ provider, models: list });
  }
  result.sort((a, b) => {
    if (a.provider.configured && !b.provider.configured) return -1;
    if (!a.provider.configured && b.provider.configured) return 1;
    return a.provider.id.localeCompare(b.provider.id);
  });
  return result;
}

export function ModelPicker({
  value,
  onChange,
  allowInherit = false,
  inheritLabel = "(default)",
  disabled = false,
  size = "md",
  className,
}: ModelPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const fast = useModelCatalog();
  const full = useModelCatalog({ all: showAll });

  const active = showAll ? full : fast;
  const data = active.data;

  const groups = useMemo(() => {
    if (!data) return [];
    return groupModelsByProvider(data.models, data.providers, showAll, value);
  }, [data, showAll, value]);

  const valueInCatalog = useMemo(() => {
    if (!data || !value) return true;
    return data.models.some((m) => m.id === value);
  }, [data, value]);

  if (active.isLoading && !data) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        cargando modelos…
      </span>
    );
  }

  if (active.error || !data) {
    return <span className={cn("text-xs text-destructive", className)}>error catálogo</span>;
  }

  const handleChange = (next: string) => {
    if (next === "__inherit__") onChange(null);
    else onChange(next);
  };

  const fullLoading = showAll && full.isFetching;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <select
        value={value ?? "__inherit__"}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "rounded-md border-2 border-ink bg-card font-mono",
          size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      >
        {allowInherit && <option value="__inherit__">{inheritLabel}</option>}
        {!valueInCatalog && value && (
          <option value={value}>{value} (fuera de catálogo)</option>
        )}
        {groups.map(({ provider, models }) => (
          <optgroup
            key={provider.id}
            label={`${provider.id} (${authBadge(provider)})${provider.configured ? "" : " — sin auth"}`}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!provider.configured}>
                {m.id}
                {m.contextWindow ? ` · ${Math.round(m.contextWindow / 1000)}k` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        disabled={disabled || fullLoading}
        title={
          showAll
            ? "Volver al listado curado"
            : "Cargar el catálogo completo (tarda ~20s la primera vez)"
        }
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        {fullLoading ? "cargando…" : showAll ? "curados" : "todos"}
      </button>
    </div>
  );
}
