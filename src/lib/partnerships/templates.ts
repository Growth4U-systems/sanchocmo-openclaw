/**
 * Plantillas de Outreach·Partnerships (SAN-80) · lógica PURA.
 *
 * Las plantillas (secuencias de contacto + briefs de campaña) son **assets
 * estilo Documents/Brand Brain**: cada una vive como UN fichero markdown en
 * `brand/{slug}/outreach/templates/{id}.md` — el MISMO fichero que se
 * descarga (⬇️), se abre renderizado en el doc-slideover (📄) y ancla el
 * chat con Sancho (💬). Una sola fuente de verdad, sin JSON paralelo.
 *
 * Formato (round-trip EXACTO serialize ⇄ parse, testeado):
 *
 *   ---
 *   id: primer-contacto-creators-fintech
 *   name: Primer contacto creators fintech
 *   kind: sequence | brief
 *   type: partnerships | b2b
 *   description: …una línea…
 *   updatedAt: ISO
 *   ---
 *
 *   ## Paso 1 · Intro
 *   **Asunto:** {{handle}} × Monzo
 *
 *   cuerpo…
 *
 *   ## Paso 2 · Follow-up (espera 3 días)
 *   …
 *
 * Variables soportadas: {{nombre}} · {{handle}} · {{plataforma}} · {{seguidores}} · {{sector}} · {{precio}} —
 * el render de preview/envío las sustituye; el motor de envío real es
 * `renderPartnerVariables` en Yalc (mismas claves). ({{quality_score}} sigue
 * siendo una clave de render válida pero interna, no se ofrece como chip.)
 *
 * CLIENT-SAFE: sin Node — lo importan componentes y tests (`tsx --test`).
 */

import { slugify } from "@/lib/slugify";

export type TemplateKind = "sequence" | "brief";
export type TemplateCampaignType = "partnerships" | "b2b";

export interface TemplateStep {
  /** Título corto del paso ("Intro", "Follow-up", "Contenido del brief"). */
  title: string;
  /** Días de espera respecto al paso anterior (paso 1 siempre 0). */
  delayDays: number;
  /** Asunto del email (las secuencias lo llevan; los briefs no). */
  subject: string | null;
  body: string;
}

export interface PartnershipTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  type: TemplateCampaignType;
  description: string;
  updatedAt: string;
  steps: TemplateStep[];
}

/** Resumen para listas (sin cuerpos). */
export interface TemplateSummary {
  id: string;
  name: string;
  kind: TemplateKind;
  type: TemplateCampaignType;
  description: string;
  updatedAt: string;
  stepCount: number;
  /** Ruta del .md relativa a brand/{slug}/ (para ⬇️/📄/💬). */
  docPath: string;
}

/** Instancia (copia) de una plantilla asignada a una búsqueda. */
export interface AssignedTemplate extends PartnershipTemplate {
  /** Id de la plantilla original de la biblioteca. */
  templateId: string;
  instanceId: string;
  assignedAt: string;
}

export interface TemplateVariableOption {
  key: string;
  token: string;
  label: string;
  description: string;
  source: "system" | "custom";
  aliases?: string[];
}

export const TEMPLATE_VARIABLE_OPTIONS: TemplateVariableOption[] = [
  {
    key: "nombre",
    token: "{{nombre}}",
    label: "Nombre visible",
    description: "Nombre, handle o identificador visible del creator.",
    source: "system",
    aliases: ["name"],
  },
  {
    key: "handle",
    token: "{{handle}}",
    label: "Handle",
    description: "Usuario social del creator.",
    source: "system",
  },
  {
    key: "plataforma",
    token: "{{plataforma}}",
    label: "Plataforma",
    description: "Red social del creator.",
    source: "system",
    aliases: ["network"],
  },
  {
    key: "seguidores",
    token: "{{seguidores}}",
    label: "Seguidores",
    description: "Número de seguidores formateado.",
    source: "system",
    aliases: ["followers"],
  },
  {
    key: "sector",
    token: "{{sector}}",
    label: "Sector",
    description: "Temática o vertical del contenido del creator.",
    source: "system",
    aliases: ["vertical", "category", "niche", "topic"],
  },
  {
    key: "precio",
    token: "{{precio}}",
    label: "Precio",
    description: "Precio ofertado/negociado en EUR si existe.",
    source: "system",
  },
];

export const TEMPLATE_VARIABLES = TEMPLATE_VARIABLE_OPTIONS.map((item) => item.token);

export function templateRelativePath(id: string): string {
  return `outreach/templates/${id}.md`;
}

export function slugifyTemplateName(name: string): string {
  return slugify(name, { maxLen: 64, fallback: "plantilla" });
}

// ── Serialize ───────────────────────────────────────────────────────────────

function escapeFrontmatterValue(value: string): string {
  // Una línea, sin romper el frontmatter. Comillas si lleva ':' o '#'.
  const oneLine = value.replace(/\s*\n\s*/g, " ").trim();
  if (/[:#]/.test(oneLine) || /^['"]/.test(oneLine)) {
    return JSON.stringify(oneLine);
  }
  return oneLine;
}

export function serializeTemplate(template: PartnershipTemplate): string {
  const lines: string[] = [
    "---",
    `id: ${escapeFrontmatterValue(template.id)}`,
    `name: ${escapeFrontmatterValue(template.name)}`,
    `kind: ${template.kind}`,
    `type: ${template.type}`,
    `description: ${escapeFrontmatterValue(template.description)}`,
    `updatedAt: ${template.updatedAt}`,
    "---",
    "",
  ];
  template.steps.forEach((step, index) => {
    const delay =
      index > 0 && step.delayDays > 0
        ? ` (espera ${step.delayDays} ${step.delayDays === 1 ? "día" : "días"})`
        : "";
    lines.push(`## Paso ${index + 1} · ${step.title.replace(/\n/g, " ")}${delay}`);
    lines.push("");
    if (step.subject) {
      lines.push(`**Asunto:** ${step.subject.replace(/\n/g, " ")}`);
      lines.push("");
    }
    lines.push(step.body.replace(/\s+$/g, ""));
    lines.push("");
  });
  return lines.join("\n").replace(/\n+$/g, "\n");
}

// ── Parse ───────────────────────────────────────────────────────────────────

function parseFrontmatterValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

const STEP_HEADING = /^## Paso (\d+) · (.+?)(?: \(espera (\d+) días?\))?\s*$/;

export function parseTemplate(markdown: string): PartnershipTemplate | null {
  const text = markdown.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;

  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
    if (match) meta[match[1]] = parseFrontmatterValue(match[2]);
  }
  if (!meta.id || !meta.name) return null;
  const kind: TemplateKind = meta.kind === "brief" ? "brief" : "sequence";
  const type: TemplateCampaignType = meta.type === "b2b" ? "b2b" : "partnerships";

  const body = text.slice(end + "\n---".length).replace(/^\n+/, "");
  const steps: TemplateStep[] = [];
  let current: TemplateStep | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (!current) return;
    current.body = bodyLines.join("\n").trim();
    steps.push(current);
    current = null;
    bodyLines = [];
  };

  for (const line of body.split("\n")) {
    const heading = line.match(STEP_HEADING);
    if (heading) {
      flush();
      current = {
        title: heading[2].trim(),
        delayDays: heading[3] ? parseInt(heading[3], 10) : 0,
        subject: null,
        body: "",
      };
      continue;
    }
    if (!current) continue; // prosa antes del primer paso → se ignora
    const subject = line.match(/^\*\*Asunto:\*\*\s*(.*)$/);
    if (subject && current.subject === null && bodyLines.join("").trim() === "") {
      current.subject = subject[1].trim();
      continue;
    }
    bodyLines.push(line);
  }
  flush();

  if (steps.length === 0) return null;

  return {
    id: meta.id,
    name: meta.name,
    kind,
    type,
    description: meta.description || "",
    updatedAt: meta.updatedAt || "",
    steps,
  };
}

export function templateSummary(template: PartnershipTemplate): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    kind: template.kind,
    type: template.type,
    description: template.description,
    updatedAt: template.updatedAt,
    stepCount: template.steps.length,
    docPath: templateRelativePath(template.id),
  };
}

// ── Render de variables (preview 📄 con datos demo / envío) ────────────────

export interface TemplateRenderContext {
  name?: string | null;
  handle?: string | null;
  /** Red social: "Instagram" | "TikTok" | "YouTube"… */
  network?: string | null;
  followers?: number | null;
  sector?: string | null;
  /** Métrica INTERNA de priorización — soportada por compatibilidad, no es chip. */
  qualityScore?: number | null;
  /** Precio ya formateado ("3.500 €") o número (se formatea es-ES). */
  precio?: string | number | null;
}

function fmtIntEs(value: number): string {
  const sign = value < 0 ? "-" : "";
  const raw = String(Math.abs(Math.round(value)));
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const fromEnd = raw.length - i;
    out += raw[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ".";
  }
  return `${sign}${out}`;
}

/** Compacta seguidores: 124000 → "124K", 1200000 → "1.2M". */
function fmtFollowers(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

export function renderTemplateText(text: string, context: TemplateRenderContext): string {
  const values: Record<string, string | null> = {
    name: context.name?.trim() || null,
    nombre: context.name?.trim() || null,
    handle: context.handle?.trim() || null,
    network: context.network?.trim() || null,
    plataforma: context.network?.trim() || null,
    followers:
      typeof context.followers === "number" && Number.isFinite(context.followers)
        ? fmtFollowers(context.followers)
        : null,
    seguidores:
      typeof context.followers === "number" && Number.isFinite(context.followers)
        ? fmtFollowers(context.followers)
        : null,
    sector: context.sector?.trim() || null,
    quality_score:
      typeof context.qualityScore === "number" && Number.isFinite(context.qualityScore)
        ? String(Math.round(context.qualityScore))
        : null,
    precio:
      typeof context.precio === "number"
        ? `${fmtIntEs(context.precio)} €`
        : context.precio?.trim() || null,
  };
  // {{key}} ó {{key | "fallback"}} — el fallback sólo se usa si falta el valor.
  return text.replace(
    /\{\{\s*([a-z_]+)\s*(?:\|\s*"([^"]*)"\s*)?\}\}/gi,
    (raw, key: string, fallback: string | undefined) => {
      const value = values[key.toLowerCase()];
      if (value !== null && value !== undefined) return value;
      return fallback !== undefined ? fallback : raw;
    },
  );
}

// ── Instanciación (asignar a búsqueda = copia con snapshot) ────────────────

export function instantiateTemplate(
  template: PartnershipTemplate,
  now: Date = new Date(),
): AssignedTemplate {
  const stamp = now.toISOString();
  return {
    ...template,
    steps: template.steps.map((step) => ({ ...step })),
    templateId: template.id,
    instanceId: `ti-${stamp.slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
    assignedAt: stamp,
  };
}

/** Pasos de la instancia → shape del motor de envío de Yalc (partner-contact). */
export function toYalcSequence(template: Pick<PartnershipTemplate, "steps">): Array<{
  subject: string | null;
  body: string;
  delayDays: number;
}> {
  return template.steps.map((step) => ({
    subject: step.subject,
    body: step.body,
    delayDays: step.delayDays,
  }));
}
