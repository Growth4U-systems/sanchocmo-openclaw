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
 * Las variables soportadas viven en `TEMPLATE_VARIABLE_OPTIONS`; cada una
 * declara la ruta exacta de su campo fuente. El editor, la API y el preflight
 * de contacto usan ese mismo catálogo y rechazan placeholders inventados.
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

export type TemplateVariableSource =
  | "scrapecreators"
  | "discovery-plan"
  | "yalc";

/**
 * Contrato canónico de variables de Outreach.
 *
 * Cada token apunta a un campo literal que ya existe en ScrapeCreators, en
 * el plan de discovery o en el Lead de Yalc. No se admiten variables que el
 * sistema tenga que inventar o inferir (por ejemplo `anchor_topic`).
 */
export interface TemplateVariableOption {
  key: string;
  token: string;
  label: string;
  description: string;
  source: "system" | "custom";
  sourceKind: TemplateVariableSource;
  /** Ruta exacta del campo de origen que se persiste en el lead. */
  sourcePath: string;
  example: string;
  aliases?: string[];
  campaignTypes?: TemplateCampaignType[];
}

export const TEMPLATE_VARIABLE_OPTIONS: TemplateVariableOption[] = [
  {
    key: "nombre_perfil",
    token: "{{nombre}}",
    label: "Nombre",
    description:
      "Nombre público literal del perfil; si falta, el envío queda bloqueado.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "data.user.full_name → campaign_leads.custom_variables.nombre_perfil",
    example: "Lucía Martínez",
    aliases: ["nombre", "name"],
  },
  {
    key: "handle",
    token: "{{handle}}",
    label: "Handle",
    description: "Usuario público de la cuenta social.",
    source: "system",
    sourceKind: "scrapecreators",
    sourcePath: "data.user.username → campaign_leads.handle",
    example: "@luciamartinez",
  },
  {
    key: "plataforma",
    token: "{{plataforma}}",
    label: "Plataforma",
    description: "Red de la que procede el perfil.",
    source: "system",
    sourceKind: "discovery-plan",
    sourcePath: "DiscoveryPlan.networks → campaign_leads.network",
    example: "Instagram",
    aliases: ["network"],
  },
  {
    key: "seguidores",
    token: "{{seguidores}}",
    label: "Seguidores",
    description: "Número de seguidores del perfil, formateado para el mensaje.",
    source: "system",
    sourceKind: "scrapecreators",
    sourcePath: "data.user.edge_followed_by.count → campaign_leads.followers",
    example: "84K",
    aliases: ["followers"],
  },
  {
    key: "categoria",
    token: "{{categoria}}",
    label: "Categoría de Instagram",
    description: "Categoría pública declarada por la cuenta; no se infiere.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "data.user.category_name → campaign_leads.custom_variables.categoria",
    example: "Health/Beauty",
  },
  {
    key: "biografia",
    token: "{{biografia}}",
    label: "Biografía",
    description: "Biografía pública completa del perfil.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "data.user.biography → campaign_leads.custom_variables.biografia",
    example: "Divulgación sobre salud y bienestar capilar.",
  },
  {
    key: "enlace_bio",
    token: "{{enlace_bio}}",
    label: "Enlace de la bio",
    description: "URL externa declarada en el perfil.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "data.user.external_url → campaign_leads.custom_variables.enlace_bio",
    example: "https://example.com",
  },
  {
    key: "email_publico",
    token: "{{email_publico}}",
    label: "Email público",
    description: "Email de negocio publicado por la cuenta, cuando existe.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "data.user.business_email → campaign_leads.custom_variables.email_publico",
    example: "hola@creator.es",
  },
  {
    key: "ultimo_post_texto",
    token: "{{ultimo_post_texto}}",
    label: "Texto del último post",
    description:
      "Caption literal del primer post devuelto por la API; no se resume ni interpreta.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "items[0].caption.text → campaign_leads.custom_variables.ultimo_post_texto",
    example: "Tres hábitos sencillos para cuidar tu salud capilar.",
  },
  {
    key: "ultimo_post_url",
    token: "{{ultimo_post_url}}",
    label: "URL del último post",
    description: "URL literal del primer post devuelto por la API.",
    source: "custom",
    sourceKind: "scrapecreators",
    sourcePath:
      "items[0].url → campaign_leads.custom_variables.ultimo_post_url",
    example: "https://www.instagram.com/p/ABC123/",
  },
  {
    key: "sector_plan",
    token: "{{sector}}",
    label: "Sectores de la búsqueda",
    description:
      "Sectores escritos explícitamente en el plan; es igual para los leads de esa búsqueda.",
    source: "custom",
    sourceKind: "discovery-plan",
    sourcePath:
      "DiscoveryPlan.sectors → campaign_leads.custom_variables.sector_plan",
    example: "salud capilar · divulgación",
    aliases: ["sector"],
  },
  {
    key: "quality_score",
    token: "{{quality_score}}",
    label: "Quality score",
    description: "Puntuación 0–100 ya calculada y persistida por Sancho.",
    source: "system",
    sourceKind: "yalc",
    sourcePath: "campaign_leads.quality_score",
    example: "87",
  },
  {
    key: "precio",
    token: "{{precio}}",
    label: "Precio acordado",
    description: "Precio ofertado o negociado; puede faltar antes de negociar.",
    source: "system",
    sourceKind: "yalc",
    sourcePath: "campaign_leads.offered_price",
    example: "1.500 €",
  },
  {
    key: "first_name",
    token: "{{first_name}}",
    label: "Nombre (campo Yalc)",
    description: "Nombre persistido del contacto.",
    source: "system",
    sourceKind: "yalc",
    sourcePath: "campaign_leads.first_name",
    example: "Lucía",
  },
  {
    key: "last_name",
    token: "{{last_name}}",
    label: "Apellido (campo Yalc)",
    description: "Apellido persistido del contacto, cuando existe.",
    source: "system",
    sourceKind: "yalc",
    sourcePath: "campaign_leads.last_name",
    example: "Martínez",
  },
  {
    key: "company",
    token: "{{company}}",
    label: "Empresa",
    description: "Empresa persistida en el lead, cuando existe.",
    source: "system",
    sourceKind: "yalc",
    sourcePath: "campaign_leads.company",
    example: "Estudio Lucía",
  },
];

export const TEMPLATE_VARIABLES = TEMPLATE_VARIABLE_OPTIONS.map(
  (item) => item.token,
);

const TEMPLATE_TOKEN_RE =
  /\{\{\s*([a-z][a-z0-9_]*)\s*(?:\|\s*"[^"]*"\s*)?\}\}/gi;

export function extractTemplateVariableKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(TEMPLATE_TOKEN_RE))
    keys.add(match[1].toLowerCase());
  return [...keys];
}

export function supportedTemplateVariableKeys(): Set<string> {
  const keys = new Set<string>();
  for (const variable of TEMPLATE_VARIABLE_OPTIONS) {
    for (const publicKey of extractTemplateVariableKeys(variable.token))
      keys.add(publicKey);
    for (const alias of variable.aliases || []) keys.add(alias.toLowerCase());
  }
  return keys;
}

export function findUnsupportedTemplateVariables(
  steps: readonly { subject?: string | null; body: string }[],
): string[] {
  const supported = supportedTemplateVariableKeys();
  const found = new Set<string>();
  for (const step of steps) {
    for (const text of [step.subject, step.body]) {
      if (!text) continue;
      for (const key of extractTemplateVariableKeys(text)) {
        if (!supported.has(key)) found.add(key);
      }
    }
  }
  return [...found].sort();
}

/** Toda expresión moustache que no tenga la gramática exacta soportada. */
export function findInvalidTemplateExpressions(
  steps: readonly { subject?: string | null; body: string }[],
): string[] {
  const invalid = new Set<string>();
  const expression = /\{\{([\s\S]*?)\}\}/g;
  const simple = /^\s*[a-z][a-z0-9_]*\s*$/i;
  const supportedFallback = /^\s*[a-z][a-z0-9_]*\s*\|\s*"[^"]*"\s*$/i;

  for (const step of steps) {
    for (const text of [step.subject, step.body]) {
      if (!text) continue;
      let match: RegExpExecArray | null;
      const covered: Array<[number, number]> = [];
      while ((match = expression.exec(text)) !== null) {
        covered.push([match.index, expression.lastIndex]);
        if (!simple.test(match[1]) && !supportedFallback.test(match[1])) {
          invalid.add(`{{${match[1]}}}`);
        }
      }

      // También rechaza delimitadores incompletos; nunca deben viajar como copy.
      const remainder = [...text]
        .map((char, index) =>
          covered.some(([start, end]) => index >= start && index < end)
            ? " "
            : char,
        )
        .join("");
      if (remainder.includes("{{") || remainder.includes("}}")) {
        invalid.add("delimitador {{…}} incompleto");
      }
    }
  }
  return [...invalid].sort();
}

/**
 * Yalc renderiza tokens simples (`{{campo}}`), pero no la sintaxis local
 * histórica de fallback (`{{campo | "texto"}}`). Detectarla antes de guardar
 * evita que el preview local prometa un valor que el envío real dejaría crudo.
 */
export function findUnsupportedTemplateFallbacks(
  steps: readonly { subject?: string | null; body: string }[],
): string[] {
  const found = new Set<string>();
  const fallbackToken = /\{\{\s*([a-z][a-z0-9_]*)\s*\|\s*"[^"]*"\s*\}\}/gi;
  for (const step of steps) {
    for (const text of [step.subject, step.body]) {
      if (!text) continue;
      for (const match of text.matchAll(fallbackToken))
        found.add(match[1].toLowerCase());
    }
  }
  return [...found].sort();
}

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
    lines.push(
      `## Paso ${index + 1} · ${step.title.replace(/\n/g, " ")}${delay}`,
    );
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
  const type: TemplateCampaignType =
    meta.type === "b2b" ? "b2b" : "partnerships";

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
    if (
      subject &&
      current.subject === null &&
      bodyLines.join("").trim() === ""
    ) {
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

export function templateSummary(
  template: PartnershipTemplate,
): TemplateSummary {
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
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  handle?: string | null;
  /** Red social: "Instagram" | "TikTok" | "YouTube"… */
  network?: string | null;
  followers?: number | null;
  sector?: string | null;
  /** Métrica INTERNA de priorización — soportada por compatibilidad, no es chip. */
  qualityScore?: number | null;
  /** Precio ya formateado ("3.500 €") o número (se formatea es-ES). */
  precio?: string | number | null;
  /** Campos literales persistidos en `campaign_leads.custom_variables`. */
  customVariables?: Record<string, string | null | undefined> | null;
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
  if (abs >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

export function renderTemplateText(
  text: string,
  context: TemplateRenderContext,
): string {
  const customValues = Object.fromEntries(
    Object.entries(context.customVariables || {}).map(([key, value]) => [
      key.trim().toLowerCase(),
      typeof value === "string" && value.trim() ? value.trim() : null,
    ]),
  ) as Record<string, string | null>;
  const exactProfileName = customValues.nombre_perfil || null;
  const values: Record<string, string | null> = {
    ...customValues,
    name: exactProfileName,
    nombre: exactProfileName,
    nombre_perfil: exactProfileName,
    first_name: context.firstName?.trim() || null,
    last_name: context.lastName?.trim() || null,
    company: context.company?.trim() || null,
    handle: context.handle?.trim() || null,
    network: context.network?.trim() || null,
    plataforma: context.network?.trim() || null,
    followers:
      typeof context.followers === "number" &&
      Number.isFinite(context.followers)
        ? fmtFollowers(context.followers)
        : null,
    seguidores:
      typeof context.followers === "number" &&
      Number.isFinite(context.followers)
        ? fmtFollowers(context.followers)
        : null,
    sector: customValues.sector_plan || null,
    sector_plan: customValues.sector_plan || null,
    quality_score:
      typeof context.qualityScore === "number" &&
      Number.isFinite(context.qualityScore)
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
export function toYalcSequence(
  template: Pick<PartnershipTemplate, "steps">,
): Array<{
  subject: string | null;
  body: string;
  delayDays: number;
}> {
  return template.steps.map((step) => ({
    subject: step.subject ? toYalcTemplateText(step.subject) : null,
    body: toYalcTemplateText(step.body),
    delayDays: step.delayDays,
  }));
}

/**
 * Evita los fallbacks internos de Yalc (`nombre`→handle y
 * `sector`→"tu temática") usando merge-fields literales propios.
 */
export function toYalcTemplateText(text: string): string {
  return text.replace(
    /\{\{\s*(nombre|name|sector)\s*\}\}/gi,
    (_raw, key: string) =>
      key.toLowerCase() === "sector" ? "{{sector_plan}}" : "{{nombre_perfil}}",
  );
}
