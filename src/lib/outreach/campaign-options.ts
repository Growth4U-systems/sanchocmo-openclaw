import fs from "node:fs";
import path from "node:path";
import { brandDir } from "@/lib/data/paths";

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

export function isOutboundCampaignStartPrompt(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return normalized === OUTBOUND_CAMPAIGN_START_PROMPT.toLowerCase()
    || normalized.startsWith("quiero crear una campaña b2b por linkedin.")
    || normalized.startsWith("quiero crear una campaña b2b por linkedin ");
}

export function buildOutboundCampaignOptions(slug: string): { ok: true; message: string } | { ok: false; message: string } {
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
  const operationalAccountDescription = accountLabel
    ? `Empresas de ${accountLabel.replace(/ · /g, ", ")}`
    : companyContext;
  const defaultBatchSize = process.env.NODE_ENV === "development" ? 3 : 1_000;
  const batchSize = Math.max(
    1,
    Math.min(2_000, Number(process.env.OUTBOUND_PREPARATION_BATCH_SIZE) || defaultBatchSize),
  );
  const options = groups.map((group, index) => ({
    id: group.id,
    label: `${group.name} · ${accountLabel || companyContext} · ${group.titles.join("/")}`,
    ...(index === 0 ? { recommended: true } : {}),
    workflowIntent: {
      schemaVersion: 1,
      channel: "linkedin",
      title: `${group.name} - LinkedIn`,
      ecpId: slugify(group.name),
      targetSegment: `${group.name} en ${operationalAccountDescription}`,
      contactReason: "Quiero compartir una idea concreta para simplificar su sistema de growth",
      batchSize,
      discoveryStrategy: "account_first_v1",
      accountTarget: {
        description: operationalAccountDescription,
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

  const question = {
    id: "outbound_ecp_v1",
    prompt: `¿Con qué audiencia empezamos? Prepararé un primer lote de hasta ${batchSize.toLocaleString("es-ES")} contactos para revisión.`,
    mode: "single",
    options,
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
