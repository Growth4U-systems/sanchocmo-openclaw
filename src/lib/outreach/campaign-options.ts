import fs from "node:fs";
import path from "node:path";
import { brandDir } from "@/lib/data/paths";
import { loadBrandSummary } from "@/lib/data/brand-brain-assembler";

export const OUTBOUND_CAMPAIGN_START_PROMPT = "Quiero crear una campaña B2B por LinkedIn.";

interface FoundationOutboundConfig {
  country?: unknown;
  icp?: {
    role_keywords?: unknown;
    company_context?: unknown;
  };
}

interface RoleGroup {
  id: string;
  name: string;
  titles: string[];
}

export interface OutboundCampaignAudienceOption {
  id: string;
  title: string;
  label: string;
  description: string;
  accountDescription: string;
  declaredAccountDescription: string;
  roles: string[];
  unappliedCriteria: string[];
  companyUniverseKey: string;
  recommended?: boolean;
  workflowIntent: Record<string, unknown>;
}

export interface OutboundCampaignChoiceSet {
  id: "outbound_ecp_v1";
  channel: "linkedin";
  objective: "start_conversations";
  prompt: string;
  batchSize: number;
  options: OutboundCampaignAudienceOption[];
}

export type OutboundCampaignChoiceResult =
  | { ok: true; choices: OutboundCampaignChoiceSet }
  | { ok: false; message: string };

const COUNTRY_NAMES: Record<string, string> = {
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  IT: "Italy",
  MX: "Mexico",
  PT: "Portugal",
  US: "United States",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : [];
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readFoundationConfig(slug: string): FoundationOutboundConfig | null {
  const file = path.join(brandDir(slug), "go-to-market", "ecps", "config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed as FoundationOutboundConfig : null;
  } catch {
    return null;
  }
}

function canonicalRole(value: string): string | null {
  const role = value.toLowerCase();
  if (/fundador|founder/.test(role)) return "Founder";
  if (/\bceo\b|chief executive/.test(role)) return "CEO";
  if (/head of growth/.test(role)) return "Head of Growth";
  if (/vp\s+(of\s+)?growth|vice president.*growth/.test(role)) return "VP Growth";
  if (/\bcmo\b|chief marketing/.test(role)) return "CMO";
  if (/director.*marketing|marketing director/.test(role)) return "Marketing Director";
  if (/responsable.*marketing|head of marketing/.test(role)) return "Head of Marketing";
  return null;
}

function roleGroups(roleKeywords: string[]): RoleGroup[] {
  const roles = [...new Set(roleKeywords.map(canonicalRole).filter((role): role is string => !!role))];
  const candidates: RoleGroup[] = [
    {
      id: "founders-ceos",
      name: "Founders y CEOs",
      titles: roles.filter((role) => role === "Founder" || role === "CEO"),
    },
    {
      id: "growth-leaders",
      name: "Responsables de Growth",
      titles: roles.filter((role) => role.includes("Growth")),
    },
    {
      id: "marketing-leaders",
      name: "Responsables de Marketing",
      titles: roles.filter((role) => role === "CMO" || role.includes("Marketing")),
    },
  ];
  return candidates.filter((candidate) => candidate.titles.length > 0).slice(0, 3);
}

function industryFor(companyContext: string): string | null {
  const value = companyContext.toLowerCase();
  if (/fintech|financial|finance|banca|crypto/.test(value)) return "Financial Services";
  if (/healthtech|health care|healthcare|salud/.test(value)) return "Hospitals and Health Care";
  if (/saas|software|tech|startup|digital/.test(value)) return "Software Development";
  return null;
}

function employeeRange(companyContext: string): string | null {
  const match = companyContext.match(/(\d[\d.]*)\s*[-–—]\s*(\d[\d.]*)\s*(?:emplead|personas|employees)/i);
  if (!match) return null;
  const min = match[1].replace(/\./g, "");
  const max = match[2].replace(/\./g, "");
  return `${min},${max}`;
}

function compactAccountLabel(industry: string | null, range: string | null, country: string | null): string {
  return [
    industry === "Software Development" ? "software" : industry,
    range ? `${range.replace(",", "-")} empleados` : null,
    country === "Spain" ? "España" : country,
  ].filter(Boolean).join(" · ");
}

function unappliedCompanyCriteria(companyContext: string): string[] {
  const criteria: string[] = [];
  if (/\bpost[-\s]?pmf\b/i.test(companyContext)) criteria.push("Post-PMF");
  const recurringRevenue = companyContext.match(/[<>≥≤]\s*[\d.,]+\s*[km]?\s*€?\s*(?:mrr|arr)\b/i);
  if (recurringRevenue) criteria.push(recurringRevenue[0].replace(/\s+/g, " ").trim());
  if (/\bjourney\s+digital\b/i.test(companyContext)) criteria.push("Journey digital");
  return [...new Set(criteria)];
}

function readPositioningContext(slug: string, value: string): string {
  if (!value || !/\.(?:md|txt)$/i.test(value)) return value;
  const root = path.resolve(brandDir(slug));
  const file = path.resolve(root, value.replace(/^brand\/[^/]+\//, ""));
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return "";
  try {
    return fs.readFileSync(file, "utf8").slice(0, 6_000);
  } catch {
    return "";
  }
}

export function getOutboundOfferContext(slug: string): string {
  const summary = loadBrandSummary(slug);
  const positioning = readPositioningContext(slug, text(summary.positioning));
  return [
    summary.company_name ? `Empresa oferente: ${summary.company_name}` : null,
    summary.sector ? `Categoría: ${summary.sector}` : null,
    summary.description ? `Servicio: ${summary.description}` : null,
    positioning ? `Posicionamiento y mensajes:\n${positioning}` : null,
  ].filter(Boolean).join("\n\n").slice(0, 8_000);
}

export function isOutboundCampaignStartPrompt(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return normalized === OUTBOUND_CAMPAIGN_START_PROMPT.toLowerCase()
    || normalized.startsWith("quiero crear una campaña b2b por linkedin.")
    || normalized.startsWith("quiero crear una campaña b2b por linkedin ");
}

export function getOutboundCampaignChoices(slug: string): OutboundCampaignChoiceResult {
  const config = readFoundationConfig(slug);
  const companyContext = text(config?.icp?.company_context);
  const groups = roleGroups(strings(config?.icp?.role_keywords));
  if (!config || !companyContext || groups.length === 0) {
    return {
      ok: false,
      message: "No pude construir audiencias operables desde Foundation. Falta `go-to-market/ecps/config.json` con `icp.company_context` y `icp.role_keywords`. No inicié ninguna campaña.",
    };
  }

  const industry = industryFor(companyContext);
  const range = employeeRange(companyContext);
  const countryCode = text(config.country).toUpperCase();
  const country = COUNTRY_NAMES[countryCode] || text(config.country) || null;
  const accountLabel = compactAccountLabel(industry, range, country);
  const unappliedCriteria = unappliedCompanyCriteria(companyContext);
  const operationalAccountDescription = accountLabel
    ? `Empresas de ${accountLabel.replace(/ · /g, ", ")}`
    : companyContext;
  const offerContext = getOutboundOfferContext(slug);
  const companyUniverseKey = slugify(JSON.stringify({ industry, range, country, companyContext }));
  const defaultBatchSize = process.env.NODE_ENV === "development" ? 3 : 1_000;
  const batchSize = Math.max(
    1,
    Math.min(2_000, Number(process.env.OUTBOUND_PREPARATION_BATCH_SIZE) || defaultBatchSize),
  );
  const options = groups.map((group, index) => ({
    id: group.id,
    title: group.name,
    label: `${group.name} · ${accountLabel || companyContext} · ${group.titles.join("/")}`,
    description: `${operationalAccountDescription}. Roles: ${group.titles.join(", ")}.`,
    accountDescription: operationalAccountDescription,
    declaredAccountDescription: companyContext,
    roles: group.titles,
    unappliedCriteria,
    companyUniverseKey,
    ...(index === 0 ? { recommended: true } : {}),
    workflowIntent: {
      schemaVersion: 1,
      channel: "linkedin",
      title: `${group.name} - LinkedIn`,
      ecpId: slugify(group.name),
      targetSegment: `${group.name} en ${operationalAccountDescription}`,
      contactReason: "Quiero compartir una idea concreta para simplificar su sistema de growth",
      ...(offerContext ? { offerContext, approach: "conversational" } : {}),
      batchSize,
      discoveryStrategy: "account_first_v1",
      accountTarget: {
        description: operationalAccountDescription,
        declaredDescription: companyContext,
        ...(unappliedCriteria.length > 0 ? { unappliedCriteria } : {}),
        ...(industry ? { industries: [industry] } : { keywords: companyContext }),
        ...(country ? { locations: [country] } : {}),
        ...(range ? { employeeRanges: [range] } : {}),
      },
      personTarget: {
        description: group.name,
        titles: group.titles,
      },
    },
  }));

  return {
    ok: true,
    choices: {
      id: "outbound_ecp_v1",
      channel: "linkedin",
      objective: "start_conversations",
      prompt: `¿Con qué audiencia empezamos? Prepararé un primer lote de hasta ${batchSize.toLocaleString("es-ES")} contactos para revisión.`,
      batchSize,
      options,
    },
  };
}

export function buildOutboundCampaignOptions(slug: string): { ok: true; message: string } | { ok: false; message: string } {
  const result = getOutboundCampaignChoices(slug);
  if (!result.ok) return result;
  const question = {
    id: result.choices.id,
    prompt: result.choices.prompt,
    mode: "single",
    options: result.choices.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.recommended ? { recommended: true } : {}),
      workflowIntent: option.workflowIntent,
    })),
  };
  return {
    ok: true,
    message: [
      "Primero buscaré empresas que encajen y después los cargos dentro de esas empresas. No se enviará ningún mensaje sin tu aprobación final.",
      "",
      ":::ask",
      JSON.stringify(question),
      ":::",
    ].join("\n"),
  };
}
