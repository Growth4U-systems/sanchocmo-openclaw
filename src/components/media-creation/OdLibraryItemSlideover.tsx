/**
 * Slide-over para un item del Open Design Library (skill / design system /
 * prompt template / craft guide). Reusa `SettingsSlideOver` (mismo componente
 * que usa el panel Skills de Settings) para mantener consistencia visual.
 *
 * Carga el SKILL.md / DESIGN.md / .md en lectura, muestra metadata como header
 * y ofrece dos acciones primarias:
 *  - "Usar en este brand"  → dispara chat con Maese Pedro
 *  - "Open in VS Code"     → opcional, vía link vscode://file
 */

"use client";

import { useMemo } from "react";
import { SettingsSlideOver } from "@/components/settings/settings-slideover";
import { useOdFile } from "@/hooks/useOdFile";

export interface OdLibraryItem {
  id: string;
  title: string;
  filePath: string;
  /** Línea de subtítulo: ej. "skill · template · video" o "design-system · brand". */
  subtitle?: string;
  /** Etiquetas secundarias renderizadas debajo del header. */
  badges?: { label: string; tone?: "rust" | "muted" | "amber" }[];
  /** Descripción/summary para el header del slide-over. */
  summary?: string;
}

interface Props {
  item: OdLibraryItem | null;
  onClose: () => void;
  onUse: () => void;
}

export function OdLibraryItemSlideover({ item, onClose, onUse }: Props) {
  const { data, isLoading } = useOdFile(item?.filePath ?? null);

  const files = useMemo(() => {
    if (!item) return [];
    if (data?.isDirectory) {
      return [
        {
          name: "Directorio",
          fileName: item.filePath,
          content:
            `# ${item.title}\n\nEste item es un directorio (\`${item.filePath}\`). Contiene:\n\n` +
            (data.entries?.map((e) => `- ${e.isDirectory ? "📁" : "📄"} \`${e.name}\``).join("\n") ?? "_(vacío)_"),
        },
      ];
    }
    if (isLoading || !data?.content) {
      return [
        {
          name: "Cargando…",
          fileName: item.filePath,
          content: isLoading ? "Cargando contenido…" : "Sin contenido.",
        },
      ];
    }
    const fileName = item.filePath.split("/").pop() ?? "FILE.md";
    return [{ name: fileName, fileName: item.filePath, content: data.content }];
  }, [item, data, isLoading]);

  if (!item) return null;

  const headerContent = (
    <div className="flex flex-col gap-2">
      {item.subtitle && (
        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
      )}
      {item.summary && (
        <p className="text-sm text-foreground/80">{item.summary}</p>
      )}
      {item.badges && item.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.badges.map((b, i) => (
            <span
              key={i}
              className={
                b.tone === "rust"
                  ? "text-[10px] px-1.5 py-0.5 rounded bg-rust/10 text-rust font-semibold"
                  : b.tone === "amber"
                    ? "text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                    : "text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              }
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onUse}
          className="text-sm px-3 py-1.5 rounded-md bg-rust text-white font-semibold hover:opacity-90"
        >
          💬 Usar en este brand
        </button>
        <a
          href={`vscode://file${item.filePath}`}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted/40 no-underline"
        >
          Abrir en VS Code
        </a>
      </div>
    </div>
  );

  return (
    <SettingsSlideOver
      open={true}
      onClose={onClose}
      title={item.title}
      subtitle={item.id}
      files={files}
      editable={false}
      copyPathPrefix={item.filePath}
      headerContent={headerContent}
    />
  );
}
