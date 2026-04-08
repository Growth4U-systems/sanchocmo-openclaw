/** Brand summary card for Dashboard V2 — pixel-perfect port of legacy .bs-* styles */

interface BrandSummary {
  company_name: string;
  sector: string;
  description: string;
  north_star: string;
  icps: (string | { name: string; link?: string })[];
  competitors: (string | { name: string; link?: string })[];
  positioning: string;
}

function toLabel(item: string | { name: string; link?: string }): string {
  return typeof item === "string" ? item : item.name;
}

interface BrandSnapshotProps {
  summary: BrandSummary;
  /** Slug used to prefix doc paths with brand/{slug}/ */
  slug?: string;
  onOpenDoc?: (docPath: string) => void;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Returns a relative doc path (without brand/{slug}/ prefix) */
function icpDocPath(item: string | { name: string; link?: string }): string {
  if (typeof item === "object" && item.link) return item.link;
  const name = typeof item === "string" ? item : item.name;
  return `go-to-market/ecp-validation/${toSlug(name)}/current.md`;
}

/** Returns a relative doc path (without brand/{slug}/ prefix) */
function competitorDocPath(item: string | { name: string; link?: string }): string {
  if (typeof item === "object" && item.link) return item.link;
  const name = typeof item === "string" ? item : item.name;
  return `market-and-us/competitors/${toSlug(name)}/current.md`;
}

export function BrandSnapshot({ summary, slug, onOpenDoc }: BrandSnapshotProps) {
  const prefix = slug ? `brand/${slug}/` : "";
  return (
    <div>
      {/* bs-card */}
      <div className="bg-[#F8F8F6] dark:bg-[#252538] border border-[#E5E2DC] dark:border-[#313244] rounded-[10px] px-3.5 py-3 mb-2.5">
        <div className="text-[15px] font-extrabold text-foreground mb-0.5">
          {summary.company_name}
        </div>
        {summary.sector && (
          <div className="text-[11px] text-muted-foreground">{summary.sector}</div>
        )}
        {summary.description && (
          <div className="text-[11px] text-foreground mt-1.5 leading-snug">
            {summary.description}
          </div>
        )}
      </div>

      {/* bs-nsm */}
      {summary.north_star && (
        <div className="bg-gradient-to-br from-[#FEF3EE] to-[#FFF8F0] dark:from-[#2A1F1A] dark:to-[#251E18] border-2 border-rust rounded-[10px] px-3.5 py-2.5 mb-2.5">
          <div className="text-[9px] font-bold text-rust uppercase tracking-wide">
            🎯 North Star Metric
          </div>
          <div className="text-[13px] font-bold text-foreground dark:text-[#cdd6f4] mt-0.5">
            {summary.north_star}
          </div>
        </div>
      )}

      {/* ICPs */}
      {summary.icps.length > 0 && (
        <div className="mb-2.5">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            👥 Perfiles de Cliente (ICP)
          </div>
          <div className="flex flex-wrap gap-1">
            {summary.icps.map((icp, i) => (
              <span
                key={i}
                className="inline-block px-2 py-[3px] text-[10px] font-semibold rounded-xl bg-[#EAE6FF] text-[#403294] border border-[#C0B6F2] cursor-pointer hover:bg-[#DDD6FF]"
                onClick={() => onOpenDoc?.(prefix + icpDocPath(icp))}
              >
                {toLabel(icp)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Competitors */}
      {summary.competitors.length > 0 && (
        <div className="mb-2.5">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            ⚔️ Competidores
          </div>
          <div className="flex flex-wrap gap-1">
            {summary.competitors.map((comp, i) => (
              <span
                key={i}
                className="inline-block px-2 py-[3px] text-[10px] font-semibold rounded-xl bg-[#DEEBFF] text-[#0747A6] border border-[#B3D4FF] cursor-pointer hover:bg-[#B3D4FF]"
                onClick={() => onOpenDoc?.(prefix + competitorDocPath(comp))}
              >
                {toLabel(comp)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Positioning */}
      {summary.positioning && (
        <div className="mb-2.5">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            🎯 Posicionamiento
          </div>
          <div className="text-[11px] italic text-foreground dark:text-[#bac2de] leading-snug px-3 py-2 border-l-[3px] border-rust bg-[#FEF3EE] dark:bg-[#2A1F1A] rounded-r-lg">
            {summary.positioning}
          </div>
        </div>
      )}
    </div>
  );
}
