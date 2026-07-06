/** Brand Brain warning banner — surfaces below-100% completion. */

interface WarningsBannerProps {
  approved: number;
  total: number;
  onNavigate?: () => void;
}

export function WarningsBanner({ approved, total, onNavigate }: WarningsBannerProps) {
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  if (pct >= 100) return null;

  const remaining = total - approved;
  const isLow = pct < 40;
  const icon = isLow ? "\uD83D\uDEA8" : "\u26A0\uFE0F";

  return (
    <button
      type="button"
      onClick={onNavigate}
      className={
        isLow
          ? "w-full mb-4 px-4 py-2.5 rounded-lg text-sm font-semibold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors text-left"
          : "w-full mb-4 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#FFF7ED] border border-[#FFD699] text-[#8B6914] hover:bg-[#FFF0DB] transition-colors text-left"
      }
    >
      {icon} Brand Brain {pct}% completo &mdash; {remaining}{" "}
      {remaining === 1 ? "pilar pendiente" : "pilares pendientes"}
    </button>
  );
}
