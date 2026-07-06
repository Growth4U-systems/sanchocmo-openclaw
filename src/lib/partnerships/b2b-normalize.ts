/**
 * B2B outbound · normalizador de contactos company-DB (SAN-349, P1).
 *
 * Convierte una fila cruda de las finder skills (company-finder →
 * decision-maker-finder → contact-enrichment) en un `B2BCandidate` canónico y
 * su payload de Lead B2B para Yalc — el mismo `POST /campaigns/:id/leads/assign`
 * que usa Partnerships. Sin empresa o sin identidad de persona → fuera.
 *
 * El score B2B lo produce el finder (ICP-fit 0-100); aquí NO se recalcula (a
 * diferencia del camino creator, que puntúa con calc-creator-core). Yalc aplica
 * la decisión de entrada (Sourced/Disqualified) con `resolveEntryStatus`.
 */

import type { B2BCandidate, B2BLeadPayload } from "./b2b-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[,\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Normaliza una fila cruda B2B. `null` si falta empresa o identidad de persona. */
export function normalizeB2BContact(input: unknown): B2BCandidate | null {
  if (!isRecord(input)) return null;

  const company = asString(
    input.company ?? input.companyName ?? input.company_name ?? input.organization ?? input.org,
  );
  const email = asString(input.email);
  const linkedinUrl = asString(input.linkedinUrl ?? input.linkedin_url ?? input.linkedin);
  let firstName = asString(input.firstName ?? input.first_name);
  let lastName = asString(input.lastName ?? input.last_name);
  const fullName = asString(input.name ?? input.fullName ?? input.full_name);

  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0];
    if (parts.length > 1 && !lastName) lastName = parts.slice(1).join(" ");
  }

  const hasIdentity = Boolean(firstName || lastName || email || linkedinUrl);
  if (!company || !hasIdentity) return null;

  const candidate: B2BCandidate = { company };
  if (firstName) candidate.firstName = firstName;
  if (lastName) candidate.lastName = lastName;
  const title = asString(input.title ?? input.headline ?? input.role ?? input.jobTitle ?? input.job_title);
  if (title) candidate.title = title;
  if (email) candidate.email = email;
  if (linkedinUrl) candidate.linkedinUrl = linkedinUrl;
  const providerId = asString(input.providerId ?? input.provider_id ?? input.apolloId ?? input.apollo_id);
  if (providerId) candidate.providerId = providerId;
  const domain = asString(input.domain ?? input.website ?? input.companyDomain ?? input.company_domain);
  if (domain) candidate.domain = domain;
  const score = asNumber(
    input.qualificationScore,
    input.qualification_score,
    input.score,
    input.icpScore,
    input.icp_score,
    input.fitScore,
    input.fit_score,
  );
  if (score !== undefined) candidate.qualificationScore = score;

  return candidate;
}

export interface B2BNormalizeResult {
  candidates: B2BCandidate[];
  /** Nº de entradas descartadas por inválidas (sin empresa o sin identidad). */
  invalid: number;
}

/** Normaliza una lista cruda; acepta `[...]` o `{ candidates: [...] }`. Dedup por empresa+persona. */
export function normalizeB2BContacts(input: unknown): B2BNormalizeResult {
  const list = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.candidates)
      ? input.candidates
      : [];
  const candidates: B2BCandidate[] = [];
  let invalid = 0;
  const seen = new Set<string>();
  for (const item of list) {
    const candidate = normalizeB2BContact(item);
    if (!candidate) {
      invalid += 1;
      continue;
    }
    const identity = (
      candidate.email ??
      candidate.linkedinUrl ??
      [candidate.firstName, candidate.lastName].filter(Boolean).join(" ")
    ).toLowerCase();
    const key = `${candidate.company.toLowerCase()}:${identity}`;
    if (seen.has(key)) continue; // dedupe silently
    seen.add(key);
    candidates.push(candidate);
  }
  return { candidates, invalid };
}

/** Mapea un `B2BCandidate` al payload de Lead B2B para Yalc (source `company-db`). */
export function buildB2BLead(candidate: B2BCandidate, options: { searchId?: string } = {}): B2BLeadPayload {
  const personName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ");
  const scored = candidate.qualificationScore !== undefined;
  const tags = ["source:company-db"];
  if (options.searchId) tags.unshift(`search:${options.searchId}`);
  if (!scored) tags.push("score:neutral-default");

  return {
    name: personName || candidate.company,
    ...(candidate.firstName ? { firstName: candidate.firstName } : {}),
    ...(candidate.lastName ? { lastName: candidate.lastName } : {}),
    company: candidate.company,
    ...(candidate.title ? { headline: candidate.title } : {}),
    ...(candidate.email ? { email: candidate.email } : {}),
    ...(candidate.linkedinUrl ? { linkedinUrl: candidate.linkedinUrl } : {}),
    ...(candidate.providerId ? { providerId: candidate.providerId } : {}),
    ...(candidate.domain ? { domain: candidate.domain } : {}),
    qualificationScore: candidate.qualificationScore !== undefined ? clampScore(candidate.qualificationScore) : 50,
    source: "company-db",
    tags,
  };
}
