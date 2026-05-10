/**
 * Parser de DESIGN.md (formato Open Design, 9 secciones + extensiones Sancho).
 *
 * Reemplaza al loader de design-tokens.json. Cada plantilla HTML del brand consume el objeto
 * que devuelve este parser — `{{ design_system.color.primary }}` se inyecta server-side al
 * renderizar.
 *
 * El DESIGN.md no es un schema estricto; es Markdown con secciones predecibles. Este parser
 * aplica heurísticas resilientes para extraer los campos que MC necesita:
 *   - color: { primary, accent, background, surface, text, ...named }
 *   - typography: { display, body, mono, sizes }
 *   - layout: { maxWidth, grid, sectionSpacing, contentPadding }
 *   - depth: { shadows, borders }
 *   - dosAndDonts: { dos[], donts[] }
 *   - responsive: { breakpoints }
 *   - mood: string
 *   - logoRules: Record<context, hex>     (Sancho extension)
 *   - socialSpecs: Record<channel, ...>   (Sancho extension)
 *   - illustrationDiscipline: string      (Sancho extension)
 */

import { promises as fs } from "fs";

export interface ParsedDesignSystem {
  raw: string;
  brandName?: string;
  mood?: string;
  color: {
    primary?: string;
    accent?: string;
    accentHover?: string;
    background?: string;
    surface?: string;
    text?: string;
    textSecondary?: string;
    /** Cualquier color con nombre detectado (ej: navy=#032149) */
    named: Record<string, string>;
  };
  typography: {
    display?: { family?: string; weight?: number | string; size?: string };
    body?: { family?: string; weight?: number | string; size?: string };
    mono?: { family?: string; weight?: number | string; size?: string };
    minSizes?: Record<string, Record<string, string>>;
  };
  layout: {
    maxWidth?: string;
    grid?: string;
    sectionSpacing?: string;
    contentPadding?: string;
  };
  depth: {
    shadows?: string;
    borders?: string;
  };
  dosAndDonts: {
    dos: string[];
    donts: string[];
  };
  responsive: {
    breakpoints?: Record<string, string>;
  };
  /** Sancho extension: logo color rules según fondo. */
  logoRules?: Record<string, string>;
  /** Sancho extension: social specs por canal. */
  socialSpecs?: Record<string, { width: number; height: number; background?: string }>;
  /** Sancho extension: illustration style guidance. */
  illustrationDiscipline?: string;
}

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

// ---------------------------------------------------------------------------
// Section extractor
// ---------------------------------------------------------------------------

function extractSection(md: string, sectionRegex: RegExp): string | undefined {
  const match = md.match(sectionRegex);
  if (!match) return undefined;
  const start = (match.index ?? 0) + match[0].length;
  // Próxima cabecera ## o ### del mismo nivel o superior
  const tail = md.slice(start);
  const nextHeading = tail.search(/\n##\s/);
  return nextHeading === -1 ? tail : tail.slice(0, nextHeading);
}

function firstHex(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(HEX_RE);
  return m?.[0];
}

function findColorAfterLabel(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`\\b${label}\\b[^#\\n]*?(${HEX_RE.source})`, "i");
    const m = text.match(re);
    if (m) return m[1];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Per-section parsers
// ---------------------------------------------------------------------------

function parseColors(md: string): ParsedDesignSystem["color"] {
  const section =
    extractSection(md, /##\s+Color Palette[^\n]*/i) ??
    extractSection(md, /##\s+Colors?[^\n]*/i) ??
    md;
  const named: Record<string, string> = {};
  // Matches: `- navy: #032149` or `**navy** #032149` or `navy = #032149`
  const namedRe = /[\-*]\s*\*?\*?(\w[\w-]*)\*?\*?\s*[:=]?\s*(#[0-9a-fA-F]{3,8})/g;
  let m;
  while ((m = namedRe.exec(section)) !== null) {
    const name = m[1].toLowerCase();
    if (!named[name]) named[name] = m[2];
  }
  return {
    primary: findColorAfterLabel(section, ["primary", "background"]),
    accent: findColorAfterLabel(section, ["accent"]),
    accentHover: findColorAfterLabel(section, ["accent hover", "hover"]),
    background: findColorAfterLabel(section, ["background"]),
    surface: findColorAfterLabel(section, ["surface"]),
    text: findColorAfterLabel(section, ["text primary", "text"]),
    textSecondary: findColorAfterLabel(section, ["text secondary", "secondary"]),
    named,
  };
}

function parseTypography(md: string): ParsedDesignSystem["typography"] {
  const section =
    extractSection(md, /##\s+Typography[^\n]*/i) ??
    extractSection(md, /##\s+Fonts?[^\n]*/i) ??
    "";
  function parseLine(label: string): { family?: string; weight?: number | string; size?: string } | undefined {
    const re = new RegExp(`\\b${label}\\b[^\\n]*`, "i");
    const m = section.match(re);
    if (!m) return undefined;
    const line = m[0];
    const familyMatch = line.match(/([A-Z][A-Za-z][A-Za-z0-9 _]+?)(?=,|\s+\d|$)/);
    const weightMatch = line.match(/\b(\d{3})\b/);
    const sizeMatch = line.match(/\b(\d+(?:\.\d+)?(?:px|rem|em))\b/);
    return {
      family: familyMatch?.[1]?.trim(),
      weight: weightMatch ? Number(weightMatch[1]) : undefined,
      size: sizeMatch?.[1],
    };
  }
  return {
    display: parseLine("display"),
    body: parseLine("body"),
    mono: parseLine("mono"),
  };
}

function parseLayout(md: string): ParsedDesignSystem["layout"] {
  const section = extractSection(md, /##\s+Layout[^\n]*/i) ?? "";
  function pick(label: string): string | undefined {
    const re = new RegExp(`\\b${label}\\b[^\\n]*?:\\s*([^\\n]+)`, "i");
    const m = section.match(re);
    return m?.[1]?.trim();
  }
  return {
    maxWidth: pick("max width"),
    grid: pick("grid"),
    sectionSpacing: pick("section spacing"),
    contentPadding: pick("content padding"),
  };
}

function parseDepth(md: string): ParsedDesignSystem["depth"] {
  const section = extractSection(md, /##\s+Depth[^\n]*/i) ?? "";
  function pick(label: string): string | undefined {
    const re = new RegExp(`\\b${label}\\b[^\\n]*?:\\s*([^\\n]+)`, "i");
    const m = section.match(re);
    return m?.[1]?.trim();
  }
  return {
    shadows: pick("shadows"),
    borders: pick("borders"),
  };
}

function parseDosAndDonts(md: string): ParsedDesignSystem["dosAndDonts"] {
  const section = extractSection(md, /##\s+Do(?:'s)?\s+and\s+Don(?:'?ts)?[^\n]*/i) ?? "";
  const dos: string[] = [];
  const donts: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) continue;
    const text = trimmed.replace(/^-\s*/, "");
    if (/^DO\s/i.test(text)) dos.push(text.replace(/^DO\s+/i, ""));
    else if (/^DON'?T\s/i.test(text)) donts.push(text.replace(/^DON'?T\s+/i, ""));
  }
  return { dos, donts };
}

function parseResponsive(md: string): ParsedDesignSystem["responsive"] {
  const section = extractSection(md, /##\s+Responsive[^\n]*/i) ?? "";
  const bp: Record<string, string> = {};
  const re = /\b(\d+px)\s*\(([a-z]+)\)/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    bp[m[2]] = m[1];
  }
  return { breakpoints: Object.keys(bp).length ? bp : undefined };
}

function parseLogoRules(md: string): Record<string, string> | undefined {
  const section = extractSection(md, /##\s+(?:Logo|Sancho)[^\n]*Logo[^\n]*/i) ?? extractSection(md, /###\s+Logo[^\n]*/i);
  if (!section) return undefined;
  const rules: Record<string, string> = {};
  const re = /\b(onWhite|onGradient|onDark|onAccent)\b[^#\n]*?(#[0-9a-fA-F]{3,8})/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    rules[m[1]] = m[2];
  }
  return Object.keys(rules).length ? rules : undefined;
}

function parseSocialSpecs(md: string): ParsedDesignSystem["socialSpecs"] {
  const section = extractSection(md, /###\s+Social Specs[^\n]*/i) ?? extractSection(md, /##\s+(?:Sancho)?\s*Extensions?[^\n]*/i);
  if (!section) return undefined;
  const specs: Record<string, { width: number; height: number; background?: string }> = {};
  const re = /\b(linkedin|instagram|blog|twitter|email)\b[^\n]*?(\d{3,4})\s*[×x]\s*(\d{3,4})/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    specs[m[1].toLowerCase()] = { width: Number(m[2]), height: Number(m[3]) };
  }
  return Object.keys(specs).length ? specs : undefined;
}

function parseMood(md: string): string | undefined {
  const section = extractSection(md, /##\s+Visual Theme[^\n]*/i) ?? "";
  const m = section.match(/Mood:\s*([^\n]+)/i);
  return m?.[1]?.trim();
}

function parseBrandName(md: string): string | undefined {
  const m = md.match(/^#\s+(.+?)(?:\s+Design System)?\s*$/m);
  return m?.[1]?.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseDesignMd(md: string): ParsedDesignSystem {
  return {
    raw: md,
    brandName: parseBrandName(md),
    mood: parseMood(md),
    color: parseColors(md),
    typography: parseTypography(md),
    layout: parseLayout(md),
    depth: parseDepth(md),
    dosAndDonts: parseDosAndDonts(md),
    responsive: parseResponsive(md),
    logoRules: parseLogoRules(md),
    socialSpecs: parseSocialSpecs(md),
    illustrationDiscipline: extractSection(md, /###\s+Illustration[^\n]*/i)
      ?.split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^[-*]\s*/, ""))
      .join(" · "),
  };
}

export async function loadDesignMd(filePath: string): Promise<ParsedDesignSystem> {
  const content = await fs.readFile(filePath, "utf8");
  return parseDesignMd(content);
}
