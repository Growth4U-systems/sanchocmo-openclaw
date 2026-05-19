/**
 * Slide-over para un item del Open Design Library (skill / design system /
 * prompt template / craft guide). Reusa `SettingsSlideOver` (mismo componente
 * que usa el panel Skills de Settings) para mantener consistencia visual.
 *
 * El cuerpo (SKILL.md / DESIGN.md / .md) se hidrata desde el daemon vía
 * `useOdItemBody`, no desde el filesystem de MC — en el deploy VPS el repo
 * de OD vive dentro del container del daemon, no junto a MC.
 *
 * Acción primaria: "Usar en este brand" → dispara chat con Maese Pedro.
 * (Eliminamos "Abrir en VS Code" porque sólo tenía sentido en el deploy
 * laptop original donde MC, OD y VS Code compartían filesystem.)
 */

"use client";

import { useMemo } from "react";
import { SettingsSlideOver } from "@/components/settings/settings-slideover";
import { useOdItemBody, type OdItemType } from "@/hooks/useOdItemBody";

export interface OdLibraryItem {
  id: string;
  title: string;
  /** Tipo del item — determina el endpoint daemon que sirve el body. */
  type: OdItemType;
  /** Sólo prompt-templates: surface (image|video|audio) requerida para
   *  construir la URL del daemon `/api/prompt-templates/<surface>/<id>`. */
  surface?: "image" | "video" | "audio" | string;
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

const FILE_NAME_BY_TYPE: Record<OdItemType, string> = {
  skill: "SKILL.md",
  "design-system": "DESIGN.md",
  "prompt-template": "PROMPT.md",
  "craft-guide": "GUIDE.md",
};

export function OdLibraryItemSlideover({ item, onClose, onUse }: Props) {
  const { data, isLoading, error } = useOdItemBody(
    item?.type ?? null,
    item?.id ?? null,
    item?.surface,
  );

  const files = useMemo(() => {
    if (!item) return [];
    const fileName = FILE_NAME_BY_TYPE[item.type] ?? "FILE.md";
    if (isLoading) {
      return [{ name: fileName, fileName, content: "Cargando contenido…" }];
    }
    if (error) {
      return [
        {
          name: fileName,
          fileName,
          content: `# ${item.title}\n\nNo se pudo cargar el contenido (${error instanceof Error ? error.message : String(error)}).`,
        },
      ];
    }
    if (!data?.body) {
      return [{ name: fileName, fileName, content: "Sin contenido." }];
    }
    return [{ name: fileName, fileName, content: data.body }];
  }, [item, data, isLoading, error]);

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
      headerContent={headerContent}
    />
  );
}
