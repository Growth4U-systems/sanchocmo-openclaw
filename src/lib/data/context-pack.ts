/**
 * context-pack.ts — GROUNDING for directly-dispatched specialists (SAN-246).
 *
 * Instance of SAN-218: when a chat thread is dispatched straight to a
 * specialist (`agent:dulcinea`), nobody injects client context — the agent
 * starts blind. This module assembles a BOUNDED "context pack" that the
 * mc-chat gateway prepends to the dispatched user text so every specialist
 * starts GROUNDED (Foundation summary + resolved doc paths) or, when there is
 * no Foundation on disk, FAILS LOUD (verdict="missing") so the gateway can
 * route to kickoff instead of letting the agent invent context.
 *
 * Size discipline: the pack ships a compact SUMMARY (self-sufficient text from
 * the brand-brain view) + bounded excerpts of the required context. Resolved
 * paths stay in the payload for traceability, but agents do not need shared
 * filesystem access to start grounded.
 *
 * Boundary note: this is Next/TS land. The mc-chat plugin (ESM, cannot import
 * `src/lib/…`) reaches it over HTTP via `src/pages/api/chat/context-pack.ts`.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { assembleBrandBrainState, brandExists } from "@/lib/data/brand-brain-assembler";
import { cleanDocPath, normalizeBrandDocPath } from "@/lib/doc-paths";
import { parseSkillFrontmatter } from "@/lib/server/skill-frontmatter";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

export type ContextPackVerdict = "ok" | "partial" | "missing";

export interface ContextPackDocument {
  /** Workspace-relative canonical path, e.g. brand/acme/company-brief/current.md. */
  path: string;
  /** Absolute server-side path, kept for traceability/backwards compatibility. */
  absPath: string;
  kind: "file" | "directory";
  /** Bounded body or directory listing/excerpts. */
  content: string;
  truncated: boolean;
}

export interface ContextPack {
  slug: string;
  skill: string | null;
  /** Self-sufficient grounding text (positioning + brand snapshot + pillar state). */
  summary: string;
  /** RESOLVED absolute paths of the skill's `context_required` docs that exist on disk. */
  docPaths: string[];
  /** Bounded context that can be injected into specialist prompts. */
  documents: ContextPackDocument[];
  /** Required context entries that could not be resolved on the MC server. */
  missingRequired: string[];
  /** False only when brand/{slug} itself is absent. */
  brandFound: boolean;
  /** ok = all required docs present, partial = some, missing = no Foundation at all. */
  verdict: ContextPackVerdict;
}

// Cap the number of required docs we resolve+ship, so a skill with a long
// `context_required` list can't bloat the dispatched prompt. The top entries
// in a SKILL.md are the load-bearing pillars (company-brief, brand-voice,
// ecps, positioning, strategic-plan); the rest are enrichment.
const MAX_DOC_PATHS = 6;
const MAX_DOCUMENT_CHARS = 6_000;
const MAX_DIRECTORY_ENTRIES = 25;
const MAX_DIRECTORY_FILE_EXCERPTS = 4;

/** Runtime skills catalog root (same convention as src/pages/api/system/skills.ts). */
function skillsRoots(): string[] {
  const roots = [
    path.join(process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"), "skills"),
    // In packaged/dev checkouts the skills catalog may live with the app even
    // when OPENCLAW_HOME points at the runtime home.
    path.join(process.cwd(), "skills"),
    // In local OpenClaw homes BASE is usually ~/.openclaw/workspace-sancho.
    path.join(BASE, "..", "skills"),
  ];
  const seen = new Set<string>();
  return roots
    .map((root) => path.resolve(root))
    .filter((root) => {
      if (seen.has(root)) return false;
      seen.add(root);
      return true;
    });
}

/**
 * Read a skill's `context_required` entries (the path templates that contain
 * `{slug}`). Returns [] when the skill or its SKILL.md is absent — a missing
 * skill is not fatal: the summary alone still grounds the agent.
 */
function readSkillContextRequired(skill: string | null): string[] {
  if (!skill) return [];
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(skill)) return [];
  let content: string;
  for (const root of skillsRoots()) {
    const skillMdPath = path.join(root, skill, "SKILL.md");
    try {
      content = fs.readFileSync(skillMdPath, "utf-8");
      const { meta } = parseSkillFrontmatter(content);
      const required = Array.isArray(meta.context_required) ? meta.context_required : [];
      return required.filter((p) => typeof p === "string" && p.trim().length > 0);
    } catch {
      // Try the next catalog root.
    }
  }
  return [];
}

/**
 * Build the self-sufficient grounding summary from the brand-brain VIEW.
 * Pulls positioning + the brand snapshot (company / sector / north-star / ICPs
 * / competitors) and a one-line Foundation pillar-state rollup. Kept terse on
 * purpose — this is the text the agent reads BEFORE touching any file.
 */
function buildSummary(slug: string): string {
  const state = assembleBrandBrainState(slug);
  const s = state.brand_summary;
  const lines: string[] = [];

  const name = s.company_name?.trim() || slug;
  lines.push(`Cliente: ${name} (slug: ${slug})`);
  if (s.sector?.trim()) lines.push(`Sector: ${s.sector.trim()}`);
  if (s.description?.trim()) lines.push(`Modelo: ${s.description.trim()}`);
  if (s.north_star?.trim()) lines.push(`North star: ${s.north_star.trim()}`);
  if (s.positioning?.trim()) lines.push(`Positioning: ${s.positioning.trim()}`);
  // icps/competitors entries may be plain strings or { name, link } objects.
  const nameOf = (e: string | { name: string; link?: string }): string =>
    typeof e === "string" ? e : e.name;
  const icpNames = (s.icps ?? []).map(nameOf).filter(Boolean);
  if (icpNames.length) lines.push(`ICPs: ${icpNames.join(", ")}`);
  const competitorNames = (s.competitors ?? []).map(nameOf).filter(Boolean);
  if (competitorNames.length) lines.push(`Competidores: ${competitorNames.join(", ")}`);

  const hasUsableFoundationContext = Boolean(
    s.sector?.trim()
      || s.description?.trim()
      || s.north_star?.trim()
      || s.positioning?.trim()
      || icpNames.length
      || competitorNames.length,
  );

  // Task status is an execution tracker, not proof that Foundation documents
  // are absent. Legacy workspaces can contain complete context without the P00
  // tasks introduced by the current tracker.
  let total = 0;
  let completed = 0;
  for (const section of Object.values(state.sections)) {
    for (const pillar of Object.values(section.pillars ?? {})) {
      total += 1;
      if (pillar.status === "completed") completed += 1;
    }
  }
  if (total > 0) {
    lines.push(
      hasUsableFoundationContext
        ? `Contexto Foundation: disponible. Tracker de ejecución: ${completed}/${total} tareas marcadas como completadas; no interpretes este contador como ausencia de contexto.`
        : `Contexto Foundation: no verificado. Tracker de ejecución: ${completed}/${total} tareas marcadas como completadas.`,
    );
  }

  return lines.join("\n");
}

/**
 * Resolve a skill's `context_required` templates to RESOLVED ABSOLUTE paths on
 * disk, via the documents resolver (NOT raw `fs` on the literal frontmatter
 * path). The resolver handles layout drift: a request for the canonical
 * `…/x.current.md` transparently resolves to a legacy bare `…/current.md`
 * (and vice versa) when that's what exists on disk. Only existing files are
 * returned. Capped at MAX_DOC_PATHS.
 */
function safeWorkspaceAbs(relPath: string): string {
  const safeBase = path.resolve(BASE);
  const absPath = path.resolve(path.join(safeBase, relPath));
  if (absPath !== safeBase && !absPath.startsWith(`${safeBase}${path.sep}`)) {
    throw new Error("Forbidden");
  }
  return absPath;
}

function wildcardSegmentMatcher(segment: string): RegExp {
  let source = "";
  for (const char of segment) {
    if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function expandWorkspaceFilePattern(rawPattern: string): string[] {
  const safeBase = path.resolve(BASE);
  const absPattern = safeWorkspaceAbs(rawPattern);
  const segments = path.relative(safeBase, absPattern).split(path.sep).filter(Boolean);
  let candidates = [safeBase];

  for (const [index, segment] of segments.entries()) {
    const matcher = wildcardSegmentMatcher(segment);
    const isLast = index === segments.length - 1;
    const next: string[] = [];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) continue;
      for (const entry of fs.readdirSync(candidate, { withFileTypes: true })) {
        if (!matcher.test(entry.name)) continue;
        if (isLast ? !entry.isFile() : !entry.isDirectory()) continue;
        next.push(path.join(candidate, entry.name));
      }
    }
    candidates = next.sort((a, b) => a.localeCompare(b));
    if (candidates.length === 0) break;
  }

  return candidates;
}

function truncateContent(content: string, maxChars = MAX_DOCUMENT_CHARS): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };
  return {
    content: `${content.slice(0, maxChars).trimEnd()}\n\n[truncated]`,
    truncated: true,
  };
}

function readFileDocument(canonicalPath: string, absPath: string): ContextPackDocument {
  const raw = fs.readFileSync(absPath, "utf-8");
  const out = truncateContent(raw);
  return {
    path: canonicalPath,
    absPath,
    kind: "file",
    content: out.content,
    truncated: out.truncated,
  };
}

function readDirectoryDocument(canonicalPath: string, absPath: string): ContextPackDocument {
  const entries = fs
    .readdirSync(absPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const entryAbs = path.join(absPath, entry.name);
      const stat = fs.statSync(entryAbs);
      return { entry, entryAbs, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.entry.name.localeCompare(b.entry.name));

  const lines = [`Directorio: ${canonicalPath}`, "Entradas recientes:"];
  for (const { entry } of entries.slice(0, MAX_DIRECTORY_ENTRIES)) {
    lines.push(`- ${entry.name}${entry.isDirectory() ? "/" : ""}`);
  }
  if (entries.length > MAX_DIRECTORY_ENTRIES) {
    lines.push(`- ... ${entries.length - MAX_DIRECTORY_ENTRIES} entradas mas`);
  }

  let remaining = MAX_DOCUMENT_CHARS - lines.join("\n").length;
  let truncated = entries.length > MAX_DIRECTORY_ENTRIES;
  for (const { entry, entryAbs } of entries) {
    if (remaining <= 200) break;
    if (!entry.isFile() || !/\.(json|md|txt)$/i.test(entry.name)) continue;
    if (lines.filter((line) => line.startsWith("--- ")).length >= MAX_DIRECTORY_FILE_EXCERPTS) break;
    try {
      const raw = fs.readFileSync(entryAbs, "utf-8");
      const budget = Math.max(200, Math.min(remaining - 80, 1_500));
      const excerpt = truncateContent(raw, budget);
      truncated = truncated || excerpt.truncated;
      lines.push("");
      lines.push(`--- ${entry.name} ---`);
      lines.push(excerpt.content);
      remaining = MAX_DOCUMENT_CHARS - lines.join("\n").length;
    } catch {
      // Ignore unreadable entries; the listing is still useful context.
    }
  }

  const out = truncateContent(lines.join("\n"));
  return {
    path: canonicalPath,
    absPath,
    kind: "directory",
    content: out.content,
    truncated: truncated || out.truncated,
  };
}

function resolveRequiredDocPaths(slug: string, required: string[]): {
  abs: string[];
  documents: ContextPackDocument[];
  missingRequired: string[];
  resolvedCount: number;
  total: number;
} {
  const abs: string[] = [];
  const documents: ContextPackDocument[] = [];
  const missingRequired: string[] = [];
  let resolvedCount = 0;
  const boundedRequired = required.slice(0, MAX_DOC_PATHS);
  const total = boundedRequired.length;

  for (const [index, template] of boundedRequired.entries()) {
    const rawPath = template.replace(/\{slug\}/g, slug);
    const wantsDirectory = /\/\s*$/.test(rawPath);
    try {
      if (/[*?]/.test(rawPath)) {
        const matches = expandWorkspaceFilePattern(rawPath);
        if (matches.length === 0) {
          missingRequired.push(rawPath);
          continue;
        }

        resolvedCount += 1;
        const requiredAfterThis = boundedRequired.length - index - 1;
        const matchBudget = Math.max(1, MAX_DOC_PATHS - documents.length - requiredAfterThis);
        for (const absPath of matches.slice(0, matchBudget)) {
          const canonicalPath = path.relative(BASE, absPath).split(path.sep).join("/");
          abs.push(absPath);
          documents.push(readFileDocument(canonicalPath, absPath));
        }
        continue;
      }

      if (wantsDirectory) {
        const canonicalPath = normalizeBrandDocPath(slug, cleanDocPath(rawPath));
        const absPath = safeWorkspaceAbs(canonicalPath);
        if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
          resolvedCount += 1;
          abs.push(absPath);
          documents.push(readDirectoryDocument(canonicalPath, absPath));
        } else {
          missingRequired.push(canonicalPath);
        }
        continue;
      }

      const resolved = resolveWorkspaceDocPath(BASE, rawPath, { slug, requireBrand: true });
      if (resolved.exists && fs.statSync(resolved.absPath).isFile()) {
        resolvedCount += 1;
        abs.push(resolved.absPath);
        documents.push(readFileDocument(resolved.canonicalPath, resolved.absPath));
      } else {
        missingRequired.push(resolved.canonicalPath);
      }
    } catch {
      // unresolvable template (path traversal, different brand) — skip; the
      // summary still grounds the agent and verdict reflects the miss.
      missingRequired.push(rawPath);
    }
  }

  return { abs, documents, missingRequired, resolvedCount, total };
}

/**
 * Assemble the bounded context pack for a (slug, skill) dispatch.
 *
 * - No brand dir on disk → verdict="missing" (gateway should route to kickoff).
 * - Skill has required docs, all resolve → "ok"; some resolve → "partial".
 * - Skill declares no required docs (or none on disk but brand exists) → "ok"
 *   when the brand exists (the summary is sufficient grounding) — we only emit
 *   "missing" when there is genuinely no Foundation to ground on.
 */
export function assembleContextPack(slug: string, skill: string | null): ContextPack {
  const normalizedSkill = typeof skill === "string" && skill.trim() ? skill.trim() : null;

  if (!brandExists(slug)) {
    return {
      slug,
      skill: normalizedSkill,
      summary: `Cliente: ${slug}\nFoundation: AUSENTE (no existe brand/${slug} en disco).`,
      docPaths: [],
      documents: [],
      missingRequired: [],
      brandFound: false,
      verdict: "missing",
    };
  }

  const summary = buildSummary(slug);
  const required = readSkillContextRequired(normalizedSkill);
  const { abs, documents, missingRequired, resolvedCount, total } = resolveRequiredDocPaths(slug, required);

  let verdict: ContextPackVerdict;
  if (total === 0) {
    // Skill declares no required docs: the brand exists, summary grounds it.
    verdict = "ok";
  } else if (resolvedCount === 0) {
    // Brand exists but this skill's declared context is missing. Do not issue
    // a hard stop: the injected summary + missing list lets the specialist ask
    // for the missing context instead of crashing or inventing.
    verdict = "partial";
  } else if (resolvedCount < total) {
    verdict = "partial";
  } else {
    verdict = "ok";
  }

  return {
    slug,
    skill: normalizedSkill,
    summary,
    docPaths: abs,
    documents,
    missingRequired,
    brandFound: true,
    verdict,
  };
}
