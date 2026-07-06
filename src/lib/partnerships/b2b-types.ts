/**
 * B2B outbound · tipos del lead company-DB (SAN-349, P1).
 *
 * Espejo B2B de `discovery-types.ts` (creator): una fila company + decision-maker
 * enriquecida (que producen las finder skills) se normaliza a un `B2BLeadPayload`
 * y se ingesta como Lead en la MISMA campaign Yalc (`type=B2B`) que usa
 * Partnerships — comparten spine (score → sequence → send → learn).
 */

/**
 * Candidato B2B crudo que producen las finder skills (company-finder →
 * decision-maker-finder → contact-enrichment). El normalizador tolera alias y
 * snake_case; `qualificationScore` es el ICP-fit 0-100 que produce el finder.
 */
export interface B2BCandidate {
  /** Empresa objetivo. Obligatorio. */
  company: string;
  firstName?: string;
  lastName?: string;
  /** Cargo / headline del decisor. */
  title?: string;
  email?: string;
  linkedinUrl?: string;
  /** Id del proveedor de datos (Apollo/Clay). */
  providerId?: string;
  /** Dominio de la empresa. */
  domain?: string;
  /** ICP-fit 0-100 del finder (score, no decisión — Yalc aplica la entrada). */
  qualificationScore?: number;
}

/**
 * Payload de Lead B2B que el runner envía a Yalc
 * (`POST /campaigns/:id/leads/assign`). Espejo B2B de `DiscoveryLeadPayload`;
 * los creator-fields (handle/network/quality) quedan ausentes.
 */
export interface B2BLeadPayload {
  name: string;
  firstName?: string;
  lastName?: string;
  company: string;
  headline?: string;
  email?: string;
  linkedinUrl?: string;
  providerId?: string;
  domain?: string;
  /** ICP-fit 0-100 (Yalc lo usa en `resolveEntryStatus`). */
  qualificationScore: number;
  source: "company-db";
  tags: string[];
}
