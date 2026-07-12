import fs from "node:fs";
import path from "node:path";
import { brandDir } from "@/lib/data/paths";
import { loadBrandSummary } from "@/lib/data/brand-brain-assembler";

const MAX_ECPS = 12;
const MAX_ITEMS = 6;
const MAX_CELL_LENGTH = 420;
const ECP_DIRECTORY_RE = /^ecp(\d+)-[a-z0-9-]+$/i;
const ECP_FILE_RE = /^ecp\d+-[a-z0-9-]+\.current\.md$/i;

export interface FoundationOutboundAngle {
  id: string;
  label: string;
  message: string;
  criterion?: string;
  proofAsset?: string;
}

export interface FoundationOutboundBrief {
  schemaVersion: 1;
  ecp: {
    id: string;
    name: string;
    status: string;
    score?: number;
    wave?: string;
    source: string;
  };
  target: {
    audience: string;
    need: string;
    situation: string;
    motivation: string;
    outcome: string;
    jtbd: string;
    alternatives: string;
  };
  positioning: {
    uvp: string;
    angles: FoundationOutboundAngle[];
    valueCriteria: string[];
    proofAssets: string[];
  };
  brand: {
    name: string;
    category: string;
    service: string;
    strengths: string[];
  };
  guardrails: {
    weaknesses: string[];
    activationConstraints: string[];
    prohibitedClaims: string[];
  };
  voice: {
    preferredTerms: string[];
    avoidedTerms: string[];
    principles: string[];
  };
  sources: string[];
}

export interface FoundationOutboundEcp {
  brief: FoundationOutboundBrief;
  blocked: boolean;
}

export interface FoundationOutboundCatalog {
  ecps: FoundationOutboundEcp[];
}

interface MarkdownTable {
  rows: Array<Record<string, string>>;
}

function compact(value: string, max = MAX_CELL_LENGTH): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function stripMarkdown(value: string): string {
  const clean = compact(value
    .replace(/<!--.*?-->/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^[\s#-]+/, ""));
  return clean.replace(/^["“](.*)["”]$/, "$1").trim();
}

function normalizedKey(value: string): string {
  return stripMarkdown(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(stripMarkdown);
}

function isTableDivider(line: string): boolean {
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function markdownTables(markdown: string): MarkdownTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|") || !isTableDivider(lines[index + 1])) continue;
    const headers = tableCells(lines[index]).map(normalizedKey);
    const rows: Array<Record<string, string>> = [];
    index += 2;
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      const cells = tableCells(lines[index]);
      if (cells.some(Boolean)) {
        rows.push(Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""])));
      }
      index += 1;
    }
    index -= 1;
    tables.push({ rows });
  }
  return tables;
}

function section(markdown: string, heading: RegExp, level = 2): string {
  const lines = markdown.split(/\r?\n/);
  const marker = "#".repeat(level);
  const start = lines.findIndex((line) => heading.test(line.replace(new RegExp(`^${marker}\\s+`), "").trim()));
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (new RegExp(`^#{1,${level}}\\s+`).test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

function rowValue(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[normalizedKey(key)];
    if (value) return value;
  }
  return "";
}

function firstTableRows(markdown: string): Array<Record<string, string>> {
  return markdownTables(markdown)[0]?.rows || [];
}

function allTableRows(markdown: string): Array<Record<string, string>> {
  return markdownTables(markdown).flatMap((table) => table.rows);
}

function unique(values: Array<string | null | undefined>, limit = MAX_ITEMS): string[] {
  return [...new Set(values.map((value) => value?.trim() || "").filter(Boolean))].slice(0, limit);
}

function relativeSource(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function safeRead(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const file = path.resolve(resolvedRoot, relative);
  if (file !== resolvedRoot && !file.startsWith(`${resolvedRoot}${path.sep}`)) return "";
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function metadataValue(markdown: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return stripMarkdown(markdown.match(new RegExp(`^>\\s*${escaped}:\\s*([^|\\n]+)`, "im"))?.[1] || "");
}

function parseScore(markdown: string): number | undefined {
  const value = markdown.match(/\bScore:\s*(\d+(?:\.\d+)?)/i)?.[1];
  const score = value ? Number(value) : Number.NaN;
  return Number.isFinite(score) ? score : undefined;
}

function parseWave(markdown: string): string | undefined {
  const value = markdown.match(/\bWave\s+([^\n|]+)/i)?.[1];
  return value ? stripMarkdown(value) : undefined;
}

function targetAudience(uvp: string, fallback: string): string {
  const match = uvp.match(/^Para\s+(.+?)(?:\s+que\b|\s+cuyo\b|,)/i);
  return compact(match?.[1] || fallback, 140);
}

function numberedItems(markdown: string): string[] {
  return unique(markdown.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*\d+\.\s+(.+)/);
    return match ? [stripMarkdown(match[1])] : [];
  }));
}

function parseSharedBrandContext(root: string): {
  strengths: string[];
  weaknesses: string[];
  preferredTerms: string[];
  avoidedTerms: string[];
  principles: string[];
  sources: string[];
} {
  const swotPath = "market-and-us/swot/current.md";
  const voicePath = "brand-book/brand-voice/current.md";
  const swot = safeRead(root, swotPath);
  const voice = safeRead(root, voicePath);
  const strengths = firstTableRows(section(swot, /strengths/i, 3))
    .map((row) => [rowValue(row, "Fortaleza"), rowValue(row, "Evidencia")].filter(Boolean).join(": "));
  const weaknesses = firstTableRows(section(swot, /weaknesses/i, 3))
    .map((row) => [rowValue(row, "Debilidad"), rowValue(row, "Evidencia")].filter(Boolean).join(": "));
  const preferredTerms = firstTableRows(section(voice, /words to use/i, 3))
    .map((row) => rowValue(row, "Palabra/Frase", "Palabra Frase"));
  const avoidedTerms = firstTableRows(section(voice, /words to avoid/i, 3))
    .map((row) => rowValue(row, "Palabra/Frase", "Palabra Frase"));
  const principles = numberedItems(section(voice, /boundaries/i));
  return {
    strengths: unique(strengths),
    weaknesses: unique(weaknesses),
    preferredTerms: unique(preferredTerms, 8),
    avoidedTerms: unique(avoidedTerms, 8),
    principles: unique(principles, 8),
    sources: [swot ? swotPath : "", voice ? voicePath : ""].filter(Boolean),
  };
}

export function parseFoundationOutboundEcp(args: {
  markdown: string;
  source: string;
  brand: FoundationOutboundBrief["brand"];
  shared?: ReturnType<typeof parseSharedBrandContext>;
}): FoundationOutboundEcp | null {
  const title = args.markdown.match(/^#\s+Positioning\s*[—–-]\s*ECP\s*(\d+)\s*:\s*["“]?([^"”\n]+)["”]?/im);
  if (!title) return null;
  const id = `ecp${title[1]}`;
  const name = stripMarkdown(title[2]);
  const jtbdRows = firstTableRows(section(args.markdown, /jtbd synthesis/i));
  const jtbd = new Map(jtbdRows.map((row) => [normalizedKey(rowValue(row, "Campo")), rowValue(row, "Contenido")]));
  const playbook = section(args.markdown, /messaging playbook/i);
  const uvp = stripMarkdown(playbook.match(/\*\*UVP:\*\*\s*\*?["“]?([^\n*]+?)["”]?\*?\s*$/im)?.[1] || "");
  const angleRows = allTableRows(playbook);
  const angles = angleRows.flatMap((row, index) => {
    const label = rowValue(row, "Cat.", "Cat", "Categoria");
    const message = rowValue(row, "Versión Corta", "Version Corta");
    if (!label || !message) return [];
    return [{
      id: `${id}-angle-${index + 1}`,
      label,
      message,
      ...(rowValue(row, "Criteria") ? { criterion: rowValue(row, "Criteria") } : {}),
      ...(rowValue(row, "Asset") ? { proofAsset: rowValue(row, "Asset") } : {}),
    }];
  }).slice(0, 5);

  const criteria = allTableRows(section(args.markdown, /top value criteria/i)).map((row) => {
    const criterion = rowValue(row, "Criteria");
    if (!criterion) return "";
    const importance = rowValue(row, "Imp.", "Imp");
    const zone = rowValue(row, "Zone");
    const asset = rowValue(row, "Asset clave");
    return compact([criterion, importance ? `importancia ${importance}` : "", zone, asset].filter(Boolean).join(" · "));
  });
  const proofAssets = allTableRows(section(args.markdown, /assets relevantes/i)).map((row) => {
    const asset = rowValue(row, "Asset");
    const relevance = rowValue(row, "Por qué importa en este ECP", "Por que importa en este ECP");
    return asset ? compact([asset, relevance].filter(Boolean).join(": ")) : "";
  });
  const weaknessSection = section(args.markdown, /debilidad a resolver/i);
  const localWeaknesses = unique([
    ...weaknessSection.split(/\r?\n/).filter((line) => line.trim() && !/^[-|]/.test(line.trim())).map(stripMarkdown),
    ...args.markdown.split(/\r?\n/)
      .filter((line) => /debilidad\s+cr[ií]tica|activable\s+solo|no\s+son\s+cases/i.test(line))
      .map(stripMarkdown),
  ]);
  const activationConstraints = unique([
    parseWave(args.markdown)?.match(/\([^)]*(?:cuando|case)[^)]*\)/i)?.[0],
    ...args.markdown.split(/\r?\n/)
      .filter((line) => /activable\s+(?:solo|cuando)|wave\s+\d+\s*\(cuando/i.test(line))
      .map(stripMarkdown),
  ]);
  const shared = args.shared || {
    strengths: [], weaknesses: [], preferredTerms: [], avoidedTerms: [], principles: [], sources: [],
  };
  const prohibitedClaims = unique([
    "No afirmar que el lead tiene el dolor del ECP sin una señal observable que lo demuestre.",
    "No convertir sector, tamaño, cargo, financiación o producto en un dolor supuesto.",
    "No inventar métricas, noticias, contratación, clientes, resultados ni capacidades.",
    ...activationConstraints.map((constraint) => `No usar como prueba ninguna afirmación bloqueada por: ${constraint}`),
    ...localWeaknesses
      .filter((weakness) => /cases|track record|social proof|review/i.test(weakness))
      .map((weakness) => `No presentar una debilidad como fortaleza: ${weakness}`),
  ]);
  const target = {
    audience: targetAudience(uvp, name),
    need: jtbd.get("need") || "",
    situation: jtbd.get("situation") || "",
    motivation: jtbd.get("motivation") || "",
    outcome: jtbd.get("outcome") || "",
    jtbd: jtbd.get("jtbd") || "",
    alternatives: jtbd.get("alternatives") || "",
  };
  if (!target.need || !target.outcome || !uvp || angles.length === 0) return null;
  const brief: FoundationOutboundBrief = {
    schemaVersion: 1,
    ecp: {
      id,
      name,
      status: metadataValue(args.markdown, "Status") || "unknown",
      ...(parseScore(args.markdown) !== undefined ? { score: parseScore(args.markdown) } : {}),
      ...(parseWave(args.markdown) ? { wave: parseWave(args.markdown) } : {}),
      source: args.source,
    },
    target,
    positioning: {
      uvp,
      angles,
      valueCriteria: unique(criteria),
      proofAssets: unique(proofAssets),
    },
    brand: { ...args.brand, strengths: unique([...args.brand.strengths, ...shared.strengths]) },
    guardrails: {
      weaknesses: unique([...localWeaknesses, ...shared.weaknesses]),
      activationConstraints,
      prohibitedClaims,
    },
    voice: {
      preferredTerms: shared.preferredTerms,
      avoidedTerms: shared.avoidedTerms,
      principles: shared.principles,
    },
    sources: unique([args.source, ...shared.sources], 10),
  };
  return { brief, blocked: activationConstraints.length > 0 };
}

export function loadFoundationOutboundCatalog(slug: string): FoundationOutboundCatalog {
  const root = path.resolve(brandDir(slug));
  const positioningRoot = path.join(root, "go-to-market", "positioning");
  const summary = loadBrandSummary(slug);
  const shared = parseSharedBrandContext(root);
  const brand: FoundationOutboundBrief["brand"] = {
    name: compact(summary.company_name || slug, 120),
    category: compact(summary.sector || "", 180),
    service: compact(summary.description || "", 500),
    strengths: [],
  };
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(positioningRoot, { withFileTypes: true });
  } catch {
    return { ecps: [] };
  }
  const files = entries
    .filter((entry) => entry.isDirectory() && ECP_DIRECTORY_RE.test(entry.name))
    .sort((left, right) => Number(left.name.match(ECP_DIRECTORY_RE)?.[1]) - Number(right.name.match(ECP_DIRECTORY_RE)?.[1]))
    .slice(0, MAX_ECPS)
    .flatMap((entry) => {
      let children: fs.Dirent[] = [];
      try {
        children = fs.readdirSync(path.join(positioningRoot, entry.name), { withFileTypes: true });
      } catch {
        return [];
      }
      const current = children.find((child) => child.isFile() && ECP_FILE_RE.test(child.name));
      return current ? [path.join(positioningRoot, entry.name, current.name)] : [];
    });
  const ecps = files.flatMap((file) => {
    const source = relativeSource(root, file);
    const markdown = safeRead(root, source);
    const parsed = markdown ? parseFoundationOutboundEcp({ markdown, source, brand, shared }) : null;
    return parsed ? [parsed] : [];
  });
  return { ecps };
}

export function recommendedFoundationOutboundEcps(catalog: FoundationOutboundCatalog, limit = 3): FoundationOutboundEcp[] {
  return catalog.ecps
    .filter((ecp) => !ecp.blocked)
    .sort((left, right) => (right.brief.ecp.score || 0) - (left.brief.ecp.score || 0))
    .slice(0, Math.max(1, Math.min(3, limit)));
}

export function foundationOfferContext(brief: FoundationOutboundBrief): string {
  return [
    `Empresa oferente: ${brief.brand.name}`,
    brief.brand.category ? `Categoría: ${brief.brand.category}` : "",
    brief.brand.service ? `Servicio: ${brief.brand.service}` : "",
    `ECP: ${brief.ecp.name}`,
    `Need: ${brief.target.need}`,
    `Outcome: ${brief.target.outcome}`,
    `UVP: ${brief.positioning.uvp}`,
  ].filter(Boolean).join("\n").slice(0, 8_000);
}
