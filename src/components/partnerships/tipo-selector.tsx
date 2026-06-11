/**
 * Selector Tipo: Partnerships | B2B (SAN-78).
 *
 * Partnerships es un TIPO de campaña, no un módulo aparte: el selector filtra
 * la página Outreach (/yalc) por `campaign.type`. B2B muestra el cockpit YALC
 * de siempre (flujos intactos); Partnerships muestra Encuentra/Contactos/….
 */

"use client";

import { useRouter } from "next/router";
import { cn } from "@/lib/utils";

export type OutreachTipo = "partnerships" | "b2b";

export function tipoFromQuery(value: string | string[] | undefined): OutreachTipo {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "b2b" ? "b2b" : "partnerships";
}

export function TipoSelector({ tipo }: { tipo: OutreachTipo }) {
  const router = useRouter();

  function setTipo(next: OutreachTipo) {
    if (next === tipo) return;
    const { slug } = router.query;
    // Cambiar de tipo resetea los params de la vista Partnerships (tab/vista/busqueda).
    const query: Record<string, string> = { slug: String(slug || "") };
    if (next === "b2b") query.tipo = "b2b";
    void router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tipo</span>
      <div className="inline-flex overflow-hidden rounded-full border-2 border-ink bg-card shadow-comic-sm">
        {(
          [
            { key: "partnerships" as const, label: "Partnerships" },
            { key: "b2b" as const, label: "B2B" },
          ]
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTipo(option.key)}
            title={option.key === "b2b" ? "Campañas B2B (cockpit YALC)" : "Campañas de creators (Partnerships)"}
            className={cn(
              "px-3 py-1 text-xs font-bold transition-colors",
              tipo === option.key ? "bg-rust text-white" : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
