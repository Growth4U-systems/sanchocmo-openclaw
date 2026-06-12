import type { FoundationState } from "@/types";
import { assembleBrandBrainState } from "./brand-brain-assembler";

/**
 * SAN-183 F5: el BrandBrainState ya no se lee de foundation-state.json — se
 * ensambla desde manifest + tasks (única fuente de status). Este módulo queda
 * como fachada de compatibilidad para los lectores server-side existentes.
 * `saveFoundationState` murió: nadie escribe el shape entero; el status se
 * escribe vía setPillarStatusViaTask (foundation-status.ts).
 */
export function loadFoundationState(slug: string): FoundationState {
  return assembleBrandBrainState(slug);
}
