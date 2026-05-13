/**
 * Mis assets — réplica del patrón de Brand Brain (file-tree.tsx) aplicada al
 * directorio brand-book/visual-identity/. Cards blancas por sección + buscador
 * + filas con iconos de acción consistentes (⬇️ descargar, 📄 ver, 💬 chat,
 * 📋 task). Click en 📄 abre slide-over con preview.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useBrandAssets, type BrandAsset } from "@/hooks/useBrandAssets";
import { MediaAssetSlideover } from "./MediaAssetSlideover";
import { buildEditorHrefWithScope } from "@/lib/open-design/asset-scope";
import { cn } from "@/lib/utils";

const KIND_META: Record<BrandAsset["kind"], { label: string; icon: string; sortOrder: number }> = {
  "design-md": { label: "Design system", icon: "📐", sortOrder: 0 },
  tokens: { label: "Tokens (legacy)", icon: "🔢", sortOrder: 1 },
  preview: { label: "Previews", icon: "👁️", sortOrder: 2 },
  logo: { label: "Logos", icon: "🅱️", sortOrder: 3 },
  template: { label: "Plantillas", icon: "🧩", sortOrder: 4 },
  mockup: { label: "Mockups", icon: "🖼️", sortOrder: 5 },
  "style-reference": { label: "Style references", icon: "🎨", sortOrder: 6 },
  export: { label: "Exports", icon: "📤", sortOrder: 7 },
  misc: { label: "Otros", icon: "📄", sortOrder: 8 },
};

const STATUS_BADGE_DONE = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800";
const STATUS_BADGE_TODO = "bg-muted/50 text-muted-foreground border border-border";

interface Props {
  slug: string;
  onRequestEdit: (asset: BrandAsset) => void;
}

function relTime(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "ahora";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h`;
  return `${Math.floor(ms / 86_400_000)} d`;
}

function DownloadBtn({ slug, relativePath }: { slug: string; relativePath: string }) {
  return (
    <a
      href={`/api/brand-files/brand/${encodeURIComponent(slug)}/${relativePath}?download=1`}
      download
      onClick={(e) => e.stopPropagation()}
      className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40 no-underline"
      title="Descargar"
    >
      {"⬇️"}
    </a>
  );
}

// Helper compartido — ver `src/lib/open-design/asset-scope.ts`.
// Alias local para mantener legibilidad en este archivo y mantener compat
// con call-sites externos que puedan importar desde aquí.
const buildEditorHref = buildEditorHrefWithScope;
export { buildEditorHrefWithScope as buildEditorHrefForAsset };

function AssetRow({
  slug,
  asset,
  onOpen,
  onRequestEdit,
}: {
  slug: string;
  asset: BrandAsset;
  onOpen: (asset: BrandAsset) => void;
  onRequestEdit: (asset: BrandAsset) => void;
}) {
  const router = useRouter();
  const taskId = asset.meta?.task_id ? String(asset.meta.task_id) : null;

  const handleTaskClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!taskId) return;
    if (taskId.includes("-T")) {
      const projectId = taskId.split("-T")[0];
      router.push(`/dashboard/${slug}/projects/${projectId}/tasks/${taskId}`);
    }
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
      <span className="w-[9px] ml-4 flex-shrink-0" />

      <span className="flex-1 text-sm font-medium text-foreground/80 flex items-center gap-2 min-w-0">
        <span className="truncate">{asset.name}</span>
        {asset.modifiedAt && (
          <span className="text-[10px] text-muted-foreground font-normal whitespace-nowrap">{relTime(asset.modifiedAt)}</span>
        )}
      </span>

      <div className="flex items-center gap-1">
        <DownloadBtn slug={slug} relativePath={asset.relativePath} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(asset);
          }}
          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
          title="Ver"
        >
          {"📄"}
        </button>
        <a
          href={buildEditorHref(slug, asset)}
          onClick={(e) => e.stopPropagation()}
          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40 no-underline"
          title="Editar en Open Design"
        >
          {"✏️"}
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRequestEdit(asset);
          }}
          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
          title="Pídele a Maese Pedro"
        >
          {"💬"}
        </button>
        <button
          type="button"
          onClick={handleTaskClick}
          disabled={!taskId}
          className={cn(
            "text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40",
            !taskId && "opacity-30 cursor-not-allowed",
          )}
          title={taskId ? `Ir a la task ${taskId}` : "Sin task asociada"}
        >
          📋
        </button>
      </div>
    </div>
  );
}

export function MyAssetsGrid({ slug, onRequestEdit }: Props) {
  const { data, isLoading, error } = useBrandAssets(slug);
  const [selected, setSelected] = useState<BrandAsset | null>(null);
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();

  const grouped = useMemo(() => {
    if (!data) return [] as { kind: BrandAsset["kind"]; assets: BrandAsset[] }[];
    const filtered = q
      ? data.assets.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.relativePath.toLowerCase().includes(q) ||
            KIND_META[a.kind].label.toLowerCase().includes(q),
        )
      : data.assets;
    const byKind = new Map<BrandAsset["kind"], BrandAsset[]>();
    for (const a of filtered) {
      if (!byKind.has(a.kind)) byKind.set(a.kind, []);
      byKind.get(a.kind)!.push(a);
    }
    return [...byKind.entries()]
      .map(([kind, assets]) => ({ kind, assets }))
      .sort((a, b) => KIND_META[a.kind].sortOrder - KIND_META[b.kind].sortOrder);
  }, [data, q]);

  const totalCount = data?.count ?? 0;
  const filteredCount = grouped.reduce((acc, g) => acc + g.assets.length, 0);
  const noResults = q && filteredCount === 0;

  return (
    <>
      <div className="space-y-4">
        {/* Buscador — mismo patrón que Brand Brain */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            {"🔍"}
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en assets..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-border bg-white dark:bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rust/30 focus:border-rust transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs bg-transparent border-none cursor-pointer"
            >
              {"✕"}
            </button>
          )}
        </div>

        {/* Estados */}
        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Cargando assets…</p>}
        {error && <p className="text-sm text-red-600 py-8 text-center">Error cargando assets.</p>}
        {!isLoading && !error && totalCount === 0 && (
          <p className="text-sm text-muted-foreground py-12 text-center">
            Aún no hay assets en este brand. Pídele a Maese Pedro que cree el primero.
          </p>
        )}
        {noResults && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No se encontraron assets para &ldquo;{search}&rdquo;
          </p>
        )}

        {/* Cards por sección — mismo estilo que Brand Brain */}
        {grouped.length > 0 && (
          <div className="space-y-3">
            {grouped.map(({ kind, assets }) => {
              const meta = KIND_META[kind];
              return (
                <div key={kind} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                    <span className="text-xl">{meta.icon}</span>
                    <span className="text-base font-bold text-foreground">{meta.label}</span>
                    <span
                      className={cn(
                        "ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full",
                        assets.length > 0 ? STATUS_BADGE_DONE : STATUS_BADGE_TODO,
                      )}
                    >
                      {assets.length} archivo{assets.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {assets.map((a) => (
                      <AssetRow
                        key={a.path}
                        slug={slug}
                        asset={a}
                        onOpen={setSelected}
                        onRequestEdit={onRequestEdit}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MediaAssetSlideover
        slug={slug}
        asset={selected}
        onClose={() => setSelected(null)}
        onRequestEdit={(a) => {
          setSelected(null);
          onRequestEdit(a);
        }}
      />
    </>
  );
}
