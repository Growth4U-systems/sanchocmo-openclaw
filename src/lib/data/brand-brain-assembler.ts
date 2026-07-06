/**
 * brand-brain-assembler.ts — BrandBrainState como VISTA, no como fichero (SAN-183 F5).
 *
 * El shape legacy de `foundation-state.json` pervive como contrato de lectura
 * (GET /api/brand-brain/state, dashboard, file-tree, yalc/provision…), pero ya
 * NO se almacena: se ENSAMBLA al vuelo desde las tres fuentes vivas:
 *
 *   estructura  → config/pillar-manifest.json (bloque foundation + docPaths)
 *   status      → las tasks 1:1 de los proyectos P00 (única fuente de status)
 *   brand info  → parse de company-brief (cache por mtime) — siempre al día
 *   presentations → scan del directorio presentations/
 *
 * Sin reconcile-on-read: con una sola fuente no hay drift que reparar.
 * `regenerate.py` y el fichero foundation-state.json quedan deprecados
 * (la migración archiva el fichero; ver scripts/migrate-foundation-state.mts).
 */

import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { BrandBrainState, BrandSummary, Pillar, Section, Task, TaskStatus } from "@/types";
import { getFoundationManifest, foundationTaskIdForPillar, getTaskSet } from "./task-blueprints";
import { normalizeTaskStatusQuiet } from "@/lib/task-status";
import { PILLAR_DOC_PATHS } from "@/lib/pillar-doc-paths";
import { getTasksBackend } from "./tasks-backend";
import { loadClients } from "./clients";

// ---------------------------------------------------------------------------
// Brand summary — parse de company-brief con cache por mtime
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: BrandSummary = {
  company_name: "",
  sector: "",
  description: "",
  north_star: "",
  icps: [],
  competitors: [],
  positioning: "",
};

const summaryCache = new Map<string, { mtimeMs: number; file: string; summary: BrandSummary }>();

function companyBriefFile(slug: string): string | null {
  const dir = path.join(BASE, "brand", slug, "company-brief");
  for (const name of ["company-brief.current.md", "current.md"]) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/**
 * Extrae el Brand Snapshot (dashboard) parseando el company-brief canónico.
 * Port TS de la extracción que vivía en workspace-sancho/scripts/regenerate.py
 * (extract_brand_summary) — pero en MC, no en el workspace del agente, y
 * parse-on-read con cache por mtime: el snapshot se actualiza solo cuando el
 * doc evoluciona. (Mejora sobre el port: los competidores se detectan por su
 * path bajo market-and-us/competitors/, no por una lista hardcodeada.)
 */
export function loadBrandSummary(slug: string): BrandSummary {
  const file = companyBriefFile(slug);
  if (!file) {
    // Sin company-brief aún: al menos el nombre del cliente (clients.json),
    // para que el Brand Snapshot no salga vacío antes del kickoff.
    const client = loadClients().find((c) => c.slug === slug);
    return { ...EMPTY_SUMMARY, company_name: client?.name ?? "" };
  }

  const mtimeMs = fs.statSync(file).mtimeMs;
  const cached = summaryCache.get(slug);
  if (cached && cached.file === file && cached.mtimeMs === mtimeMs) return cached.summary;

  let content = "";
  try {
    content = fs.readFileSync(file, "utf-8");
  } catch {
    return { ...EMPTY_SUMMARY };
  }

  const summary: BrandSummary = { ...EMPTY_SUMMARY };

  // Nombre desde el título: "# Company Brief — {name}"
  const title = content.match(/^#\s+Company Brief\s*[—–-]\s*(.+)$/m);
  if (title) summary.company_name = title[1].trim();

  // Sección "## 1. La Empresa": **Nombre/Tipo/Modelo**
  const empresa = content.match(/##\s+1\.\s+La Empresa[^\n]*\n+((?:\*\*[^\n]+\n)*)/);
  if (empresa) {
    for (const line of empresa[1].trim().split("\n")) {
      const kv = line.match(/\*\*([^*]+)\*\*:?\s*(.*)/);
      if (!kv) continue;
      const key = kv[1].trim().toLowerCase();
      const val = kv[2].trim();
      if (key.includes("nombre") && !summary.company_name) summary.company_name = val;
      else if (key.includes("tipo")) summary.sector = val;
      else if (key.includes("modelo") && !summary.description) summary.description = val.slice(0, 200);
    }
  }
  if (!summary.company_name) {
    const client = loadClients().find((c) => c.slug === slug);
    summary.company_name = client?.name ?? "";
  }

  // Foundation Index: ICPs (Positioning — ECPn), competidores (por path) y positioning
  const index = content.match(/## Foundation Index.*?\n\n([\s\S]*?)(?:\n##\s|$)/);
  if (index) {
    const icps: { name: string; link: string }[] = [];
    const competitors: { name: string; link: string }[] = [];
    for (const line of index[1].split("\n")) {
      if (!line.trim().startsWith("|")) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 4) continue;
      const [layer, pilar, , archivo] = cells;
      if (layer.includes("Layer") || layer.includes("---")) continue;
      const link = archivo.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (!link) continue;
      const linkUrl = link[2].replace(/\.\.\//g, "");
      if (pilar.includes("Positioning — ECP")) {
        const name = pilar.includes("—") ? pilar.split("—")[1].trim() : pilar;
        icps.push({ name, link: linkUrl });
      } else if (linkUrl.includes("market-and-us/competitors/")) {
        competitors.push({ name: pilar, link: linkUrl });
      } else if (pilar.includes("Messaging Summary")) {
        summary.positioning = linkUrl; // link al doc; el snapshot lo abre
      }
    }
    if (icps.length) summary.icps = icps;
    if (competitors.length) summary.competitors = competitors;
  }

  // Fallback de positioning: "## 3. Cliente Ideal" → **En una frase:**
  if (!summary.positioning) {
    const icpSection = content.match(/##\s+3\.\s+Cliente Ideal[^\n]*\n([\s\S]*?)(?:\n##\s+\d+\.|$)/);
    const frase = icpSection?.[1].match(/\*\*En una frase:\*\*\s*(.+)/);
    if (frase) summary.positioning = frase[1].trim().slice(0, 200);
  }

  summaryCache.set(slug, { mtimeMs, file, summary });
  return summary;
}

// ---------------------------------------------------------------------------
// Presentations — scan del directorio (el array en el estado era huérfano)
// ---------------------------------------------------------------------------

const PRES_SECTION_MAP: Record<string, string[]> = {
  "market-and-us": ["foundation-report", "foundation-slides", "foundation-deck", "swot", "ope-canvas", "competitor", "mercado", "competidor", "market", "deep-dive"],
  "go-to-market": ["strategic-plan", "strategic", "gtm", "go-to-market", "channels", "pricing"],
  "brand-book": ["brand", "voice", "visual", "identity", "logo"],
  "company-brief": ["company", "brief", "business-model", "budget"],
};

export interface PresentationEntry {
  name: string;
  file: string;
  type: string;
  section: string;
}

/** Lista las presentaciones reales en disco (brand/{slug}/presentations/**.html). */
export function scanPresentations(slug: string): PresentationEntry[] {
  const presDir = path.join(BASE, "brand", slug, "presentations");
  if (!fs.existsSync(presDir)) return [];
  const out: PresentationEntry[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".html")) {
        const stem = e.name.replace(/\.html$/, "");
        const name = stem === "index" ? path.basename(path.dirname(full)) : stem;
        const file = path.relative(path.join(BASE), full); // brand/{slug}/presentations/...
        const fname = `${file} ${name}`.toLowerCase().replace(/ /g, "-");
        let section = "";
        for (const [secKey, keywords] of Object.entries(PRES_SECTION_MAP)) {
          if (keywords.some((kw) => fname.includes(kw))) {
            section = secKey;
            break;
          }
        }
        out.push({ name: name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), file, type: "html", section });
      }
    }
  };
  try {
    walk(presDir);
  } catch {
    return out;
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

// ---------------------------------------------------------------------------
// El ensamblador
// ---------------------------------------------------------------------------

/** Rollup de sección desde sus pilares (portado de computeSectionStatus). */
function computeSectionStatus(pillarStatuses: TaskStatus[]): TaskStatus {
  if (pillarStatuses.length === 0) return "todo";
  let completed = 0;
  let active = 0;
  for (const s of pillarStatuses) {
    if (s === "completed") {
      completed++;
      active++;
    } else if (s === "in-progress" || s === "pending-review") {
      active++;
    }
  }
  if (completed === pillarStatuses.length) return "completed";
  if (active > 0) return "in-progress";
  return "todo";
}

/** ¿Existe el cliente (dir de brand)? El endpoint usa esto para el 404. */
export function brandExists(slug: string): boolean {
  return fs.existsSync(path.join(BASE, "brand", slug));
}

/**
 * Ensambla el BrandBrainState legacy desde manifest + tasks. Una pasada por
 * los proyectos del cliente (vía tasks-backend, así sirve igual con backend
 * json o db); lookup O(1) por pilar.
 */
export function assembleBrandBrainState(slug: string): BrandBrainState {
  const projects = getTasksBackend().listProjectsWithTasks(slug);
  const byId = new Map<string, Task>();
  const byPillar = new Map<string, Task>();
  let latestTasksMtime = 0;
  for (const p of projects) {
    for (const t of p.tasks) {
      byId.set(t.id, t);
      const pillarKey =
        t.pillar ?? (Array.isArray((t as unknown as { pillars?: string[] }).pillars)
          ? (t as unknown as { pillars: string[] }).pillars[0]
          : undefined);
      if (pillarKey && !byPillar.has(pillarKey)) byPillar.set(pillarKey, t);
    }
  }
  // updated_at significativo: mtime más reciente de los tasks.json en disco.
  const projectsDir = path.join(BASE, "brand", slug, "projects");
  if (fs.existsSync(projectsDir)) {
    try {
      for (const d of fs.readdirSync(projectsDir)) {
        const f = path.join(projectsDir, d, "tasks.json");
        if (fs.existsSync(f)) latestTasksMtime = Math.max(latestTasksMtime, fs.statSync(f).mtimeMs);
      }
    } catch {
      /* best-effort */
    }
  }

  const sections: Record<string, Section> = {};
  for (const s of getFoundationManifest()) {
    const pillars: Record<string, Pillar> = {};
    for (const p of s.pillars) {
      const task = byId.get(foundationTaskIdForPillar(p.key) ?? "") ?? byPillar.get(p.key);
      const status = normalizeTaskStatusQuiet((task?.status as string) ?? "todo");
      const deliverable = task?.deliverable_file;
      const primaryDeliverable = Array.isArray(deliverable) ? deliverable[0] : deliverable;
      const fallbackDoc = PILLAR_DOC_PATHS[p.key]?.[0];
      const entry = getTaskSet(p.task.set)?.tasks.find((t) => t.id === p.task.id);
      pillars[p.key] = {
        status,
        layer: p.layer,
        skill: entry?.skill,
        output_file: primaryDeliverable ?? (fallbackDoc ? `brand/${slug}/${fallbackDoc}` : undefined),
        ...(p.optional ? { optional: true } : {}),
        ...(task?.completed ? { approved_at: task.completed, completed_at: task.completed } : {}),
        requires: [],
        enriches_with: [],
      };
    }
    sections[s.key] = {
      status: computeSectionStatus(Object.values(pillars).map((p) => p.status)),
      layer: s.layer,
      output_dir: `brand/${slug}/${s.key}/`,
      requires: [],
      enriches_with: [],
      pillars,
    };
  }

  const now = new Date().toISOString();
  return {
    version: "4.0",
    started_at: now,
    updated_at: latestTasksMtime ? new Date(latestTasksMtime).toISOString() : now,
    brand_summary: loadBrandSummary(slug),
    sections,
    presentations: scanPresentations(slug),
  };
}
