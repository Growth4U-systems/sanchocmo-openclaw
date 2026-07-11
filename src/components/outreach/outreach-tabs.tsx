import { TipoSelector } from "@/components/partnerships/tipo-selector";
import { cn } from "@/lib/utils";

export type OutreachTabKey = "encuentra" | "contactos" | "inbox" | "plantillas";

const OUTREACH_TABS: Array<{ key: OutreachTabKey; label: string; icon: string }> = [
  { key: "encuentra", label: "Encuentra", icon: "🔎" },
  { key: "contactos", label: "Contactos", icon: "▦" },
  { key: "inbox", label: "Inbox", icon: "✉" },
  { key: "plantillas", label: "Plantillas", icon: "✎" },
];

export function OutreachTabs({
  active,
  tipo,
  testId,
  hidden = [],
  onChange,
}: {
  active: OutreachTabKey | null;
  tipo: "partnerships" | "b2b";
  testId: string;
  hidden?: OutreachTabKey[];
  onChange: (tab: OutreachTabKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav className="flex flex-wrap gap-2 overflow-x-auto" data-testid={testId}>
        {OUTREACH_TABS.filter((item) => !hidden.includes(item.key)).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all",
              active === item.key
                ? "border-rust bg-rust text-white"
                : "border-border hover:border-rust",
            )}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto">
        <TipoSelector tipo={tipo} />
      </div>
    </div>
  );
}
