/** Brand summary card for Dashboard V2 showing company info, NSM, ICPs, competitors, and positioning. */

interface BrandSummary {
  company_name: string;
  sector: string;
  description: string;
  north_star: string;
  icps: string[];
  competitors: string[];
  positioning: string;
}

interface BrandSnapshotProps {
  summary: BrandSummary;
}

export function BrandSnapshot({ summary }: BrandSnapshotProps) {
  return (
    <div>
      {/* Company name & sector */}
      <h3 className="font-semibold text-[15px] text-foreground">
        {summary.company_name}
      </h3>
      <span className="text-[11px] text-muted-foreground uppercase">
        {summary.sector}
      </span>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground mt-2">
        {summary.description}
      </p>

      {/* North Star Metric */}
      <div className="bg-gradient-to-r from-rust/5 to-transparent border-l-[3px] border-rust p-3 rounded-r-lg mt-3">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          North Star Metric
        </span>
        <p className="text-sm font-semibold text-foreground">
          {summary.north_star}
        </p>
      </div>

      {/* ICPs */}
      {summary.icps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {summary.icps.map((icp) => (
            <span
              key={icp}
              className="text-[10px] px-2 py-0.5 bg-sage/15 text-sage rounded-full font-medium"
            >
              {icp}
            </span>
          ))}
        </div>
      )}

      {/* Competitors */}
      {summary.competitors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {summary.competitors.map((comp) => (
            <span
              key={comp}
              className="text-[10px] px-2 py-0.5 bg-navy/10 text-navy rounded-full font-medium"
            >
              {comp}
            </span>
          ))}
        </div>
      )}

      {/* Positioning */}
      {summary.positioning && (
        <p className="text-[11px] italic text-muted-foreground border-l-[3px] border-rust pl-3 mt-3">
          {summary.positioning}
        </p>
      )}
    </div>
  );
}
