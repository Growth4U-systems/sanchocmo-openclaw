/**
 * Plantillas de Partnerships · store en disco (SAN-80).
 *
 * Los originales viven como markdown en `brand/{slug}/outreach/templates/`
 * (patrón documents — mismo fichero para ⬇️ descarga, 📄 doc-slideover y
 * 💬 chat). Las INSTANCIAS (copias asignadas a una búsqueda) viven dentro
 * del registro de la búsqueda (`DiscoverySearchRecord.templates`), igual que
 * el resto de su estado (SAN-79): cada búsqueda congela su copia.
 *
 * Biblioteca vacía → se siembran las 6 plantillas del mockup en el primer
 * `listTemplates` (workspace nuevo = biblioteca útil desde el minuto 1).
 */

import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { SEED_TEMPLATES } from "./template-seeds";
import {
  instantiateTemplate,
  parseTemplate,
  serializeTemplate,
  slugifyTemplateName,
  templateSummary,
  type AssignedTemplate,
  type PartnershipTemplate,
  type TemplateSummary,
} from "./templates";
import { getSearch, listSearches, saveSearch } from "./discovery-store";
import type { DiscoverySearchRecord } from "./discovery-types";

export function templatesDir(slug: string): string {
  return path.join(brandDir(slug), "outreach", "templates");
}

export function templateFile(slug: string, id: string): string {
  return path.join(templatesDir(slug), `${id}.md`);
}

function writeTemplateFile(slug: string, template: PartnershipTemplate): void {
  const dir = templatesDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(templateFile(slug, template.id), serializeTemplate(template), "utf-8");
}

/** Siembra las plantillas del mockup si la biblioteca no existe aún. */
export function ensureSeedTemplates(slug: string): void {
  const dir = templatesDir(slug);
  if (fs.existsSync(dir)) return;
  for (const template of SEED_TEMPLATES) {
    writeTemplateFile(slug, template);
  }
}

export function getTemplate(slug: string, id: string): PartnershipTemplate | null {
  const file = templateFile(slug, id);
  if (!fs.existsSync(file)) return null;
  return parseTemplate(fs.readFileSync(file, "utf-8"));
}

export function listTemplates(slug: string): PartnershipTemplate[] {
  ensureSeedTemplates(slug);
  const dir = templatesDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parseTemplate(fs.readFileSync(path.join(dir, file), "utf-8")))
    .filter((template): template is PartnershipTemplate => template !== null)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function listTemplateSummaries(slug: string): TemplateSummary[] {
  return listTemplates(slug).map(templateSummary);
}

export interface SaveTemplateInput {
  id?: string;
  name: string;
  kind?: PartnershipTemplate["kind"];
  type?: PartnershipTemplate["type"];
  description?: string;
  steps: Array<{ title?: string; delayDays?: number; subject?: string | null; body?: string }>;
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateValidationError";
  }
}

function normalizeSteps(input: SaveTemplateInput["steps"], kind: PartnershipTemplate["kind"]) {
  const steps = (Array.isArray(input) ? input : [])
    .map((step, index) => ({
      title: (step.title || "").trim() || (kind === "brief" ? "Contenido del brief" : `Paso ${index + 1}`),
      delayDays:
        index === 0
          ? 0
          : Math.max(0, Math.round(Number.isFinite(Number(step.delayDays)) ? Number(step.delayDays) : 0)),
      subject: typeof step.subject === "string" && step.subject.trim() ? step.subject.trim() : null,
      body: (step.body || "").trim(),
    }))
    .filter((step) => step.body.length > 0);
  if (steps.length === 0) {
    throw new TemplateValidationError("La plantilla necesita al menos un paso con contenido.");
  }
  return steps;
}

/** Crea o actualiza una plantilla (upsert por id). Devuelve la versión persistida. */
export function saveTemplate(slug: string, input: SaveTemplateInput): PartnershipTemplate {
  ensureSeedTemplates(slug);
  const name = (input.name || "").trim();
  if (!name) throw new TemplateValidationError("La plantilla necesita un nombre.");
  const kind = input.kind === "brief" ? "brief" : "sequence";

  let id = (input.id || "").trim();
  if (!id) {
    id = slugifyTemplateName(name);
    // colisión → sufijo incremental
    let candidate = id;
    let n = 2;
    while (fs.existsSync(templateFile(slug, candidate))) {
      candidate = `${id}-${n++}`;
    }
    id = candidate;
  }

  const template: PartnershipTemplate = {
    id,
    name,
    kind,
    type: input.type === "b2b" ? "b2b" : "partnerships",
    description: (input.description || "").trim(),
    updatedAt: new Date().toISOString(),
    steps: normalizeSteps(input.steps, kind),
  };
  writeTemplateFile(slug, template);
  return template;
}

// ── Asignación a búsquedas (instanciar copias) ─────────────────────────────

export interface AssignTemplateResult {
  search: DiscoverySearchRecord;
  instance: AssignedTemplate;
}

function searchTemplates(search: DiscoverySearchRecord): AssignedTemplate[] {
  if (!Array.isArray(search.templates)) search.templates = [];
  return search.templates;
}

/** Plantillas instanciadas de una búsqueda (lectura). */
export function listAssignedTemplates(search: DiscoverySearchRecord): AssignedTemplate[] {
  return Array.isArray(search.templates) ? search.templates : [];
}

function resolveSearch(slug: string, ref: { searchId?: string; campaignId?: string }): DiscoverySearchRecord {
  if (ref.searchId) {
    const search = getSearch(slug, ref.searchId);
    if (search) return search;
    throw new TemplateValidationError(`Búsqueda no encontrada: ${ref.searchId}`);
  }
  if (ref.campaignId) {
    const search = listSearches(slug).find((item) => item.campaignId === ref.campaignId);
    if (search) return search;
    throw new TemplateValidationError(
      `Ninguna búsqueda apunta a la campaña ${ref.campaignId} — crea la búsqueda desde el chat (SAN-79).`,
    );
  }
  throw new TemplateValidationError("searchId o campaignId requerido.");
}

/**
 * Instancia una COPIA de la plantilla en la búsqueda (decisión de diseño
 * 2026-06-11 nº 2/3: la biblioteca guarda originales; cada búsqueda congela
 * sus copias). Re-asignar la misma plantilla crea otra instancia solo si la
 * anterior se eliminó; por defecto es idempotente por templateId.
 */
export function assignTemplateToSearch(
  slug: string,
  templateId: string,
  ref: { searchId?: string; campaignId?: string },
): AssignTemplateResult {
  const template = getTemplate(slug, templateId);
  if (!template) throw new TemplateValidationError(`Plantilla no encontrada: ${templateId}`);
  const search = resolveSearch(slug, ref);

  const assigned = searchTemplates(search);
  const existing = assigned.find((item) => item.templateId === templateId);
  if (existing) {
    return { search, instance: existing };
  }

  const instance = instantiateTemplate(template);
  assigned.push(instance);
  const saved = saveSearch(search);
  return { search: saved, instance };
}

/** Primera secuencia instanciada de la búsqueda (el motor de Contacto la usa). */
export function findSearchSequence(search: DiscoverySearchRecord): AssignedTemplate | null {
  return listAssignedTemplates(search).find((item) => item.kind === "sequence") ?? null;
}

/** Búsqueda (con plantillas) por campaignId — el camino UI/MCP más común. */
export function findSearchByCampaign(slug: string, campaignId: string): DiscoverySearchRecord | null {
  return listSearches(slug).find((item) => item.campaignId === campaignId) ?? null;
}

/**
 * Conecta la fila "Plantillas" del plan del chat (SAN-79): al crear la
 * búsqueda, asigna por NOMBRE las plantillas de la biblioteca que coincidan
 * (case-insensitive, también por id). Tolerante: nombres desconocidos se
 * devuelven en `missing` (el chat los puede ofrecer como "crear nueva").
 */
export function assignTemplatesFromPlan(
  slug: string,
  search: DiscoverySearchRecord,
): { assigned: AssignedTemplate[]; missing: string[] } {
  const names = Array.isArray(search.plan?.templates) ? search.plan.templates : [];
  if (names.length === 0) return { assigned: [], missing: [] };

  const library = listTemplates(slug);
  const assigned: AssignedTemplate[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const needle = name.trim().toLowerCase();
    if (!needle) continue;
    const match = library.find(
      (template) => template.name.toLowerCase() === needle || template.id === slugifyTemplateName(name),
    );
    if (!match) {
      missing.push(name);
      continue;
    }
    const result = assignTemplateToSearch(slug, match.id, { searchId: search.id });
    assigned.push(result.instance);
  }
  return { assigned, missing };
}
