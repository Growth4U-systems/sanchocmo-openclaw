import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";

// ============================================================
// Changelog Page — Faithful replica of legacy renderChangelog()
// Parses Keep a Changelog markdown into structured entries
// ============================================================

interface ChangelogEntry {
  version: string;
  date: string;
  sections: { title: string; items: string[] }[];
}

const SECTION_ICONS: Record<string, string> = {
  Added: "✨",
  Changed: "🔄",
  Fixed: "🐛",
  Removed: "🗑️",
  Merged: "🔀",
  Deprecated: "⚠️",
};

const SECTION_COLORS: Record<string, string> = {
  Added: "text-green-500",
  Changed: "text-blue-500",
  Fixed: "text-amber-500",
  Removed: "text-red-500",
  Merged: "text-violet-500",
  Deprecated: "text-gray-500",
};

function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of md.split("\n")) {
    // ## [2.9.0] — 2026-03-29
    const versionMatch = line.match(/^## \[([^\]]+)\]\s*[—–-]\s*(.+)/);
    if (versionMatch) {
      if (current) entries.push(current);
      current = { version: versionMatch[1], date: versionMatch[2].trim(), sections: [] };
      currentSection = null;
      continue;
    }

    // ### Added
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && current) {
      currentSection = { title: sectionMatch[1].trim(), items: [] };
      current.sections.push(currentSection);
      continue;
    }

    // - **Item** — description
    if (line.match(/^- /) && currentSection) {
      currentSection.items.push(line.slice(2).trim());
    }
  }
  if (current) entries.push(current);
  return entries;
}

export default function ChangelogPage() {
  const { data, isLoading } = useQuery<string | null>({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch("/api/system/changelog");
      if (!res.ok) return null;
      const d = await res.json();
      return d.content || null;
    },
    staleTime: 120_000,
  });

  const entries = data ? parseChangelog(data) : [];

  return (
    <DashboardLayout>
      <Head><title>Changelog — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">📜 Changelog</h1>
      <p className="text-sm text-muted-foreground mb-6">Historial de versiones</p>

      {isLoading ? (
        <ComicCard>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </ComicCard>
      ) : entries.length === 0 ? (
        <ComicCard>
          <p className="text-sm text-muted-foreground">No se encontró CHANGELOG.md</p>
        </ComicCard>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <ComicCard key={entry.version}>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="font-heading text-lg text-rust font-bold">v{entry.version}</span>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              <div className="space-y-3">
                {entry.sections.map((section) => (
                  <div key={section.title}>
                    <div className={cn("text-xs font-bold uppercase tracking-wider mb-1.5", SECTION_COLORS[section.title] || "text-muted-foreground")}>
                      {SECTION_ICONS[section.title] || "📌"} {section.title}
                    </div>
                    <ul className="space-y-1">
                      {section.items.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-4 relative before:content-['·'] before:absolute before:left-1 before:text-muted-foreground/50">
                          <ChangelogItem text={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </ComicCard>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

/** Renders a changelog item with inline bold/code formatting */
function ChangelogItem({ text }: { text: string }) {
  // Split on **bold** and `code` patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="text-[10px] bg-muted px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
