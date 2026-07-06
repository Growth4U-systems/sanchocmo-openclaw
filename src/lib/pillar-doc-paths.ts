// ============================================================
// Pillar Document Paths — ported from mission-control.html:5833-5863
// Maps foundation pillars to their output document paths.
// Used by the pinned document system in chat threads.
// ============================================================

import pillarManifest from "../../config/pillar-manifest.json";

/** Shape of one pillar entry in the single source of truth config/pillar-manifest.json.
 *  SAN-192 (W2b): un pilar ya NO declara skill/agente si una task lo cubre — se
 *  DERIVAN de su task (bloque `foundation` → `taskSets`). `skill`/`agent`
 *  explícitos solo para documentos-pilar SIN task aún (ej. estrategia de Content). */
type ManifestPillarEntry = {
  docPaths?: string[];
  /** Solo para documentos-pilar sin task cubriente (transitorio hasta convertirlos en task). */
  skill?: string;
  agent?: string;
};
/** The pillar map from config/pillar-manifest.json — edit the JSON, never this. */
export const MANIFEST_PILLARS = (
  pillarManifest as unknown as { pillars: Record<string, ManifestPillarEntry> }
).pillars;

// ---------------------------------------------------------------------------
// Derivación skill+agente desde la TASK cubriente (SAN-192 W2b)
// El manifest no duplica skill/agente: la task es la fuente. Aquí leemos el
// bloque `foundation` (pilar → {set,id}) + `taskSets` (task → skill/agent) del
// MISMO JSON (sin importar task-blueprints.ts, que importaría skill-resolver →
// ciclo). resolveCoveringTask y getTaskSetEntry hacen lo análogo en runtime.
// ---------------------------------------------------------------------------

type _TaskSetEntry = { id: string; skill?: string; agent?: string; deliverableFiles?: string[]; docPaths?: string[] };
type _FoundationPillarDecl = { key: string; task?: { set: string; id: string } };
const _MANIFEST_FOUNDATION = (
  pillarManifest as unknown as { foundation?: { sections?: { pillars?: _FoundationPillarDecl[] }[] } }
).foundation;
const _MANIFEST_TASKSETS = (
  pillarManifest as unknown as { taskSets?: Record<string, { tasks?: _TaskSetEntry[] }> }
).taskSets ?? {};

/** La task que cubre un pilar Foundation (skill/agent/deliverableFiles), o undefined. */
function coveringTask(pillar: string): _TaskSetEntry | undefined {
  for (const section of _MANIFEST_FOUNDATION?.sections ?? []) {
    const decl = (section.pillars ?? []).find((p) => p.key === pillar);
    if (decl?.task) {
      const t = (_MANIFEST_TASKSETS[decl.task.set]?.tasks ?? []).find((x) => x.id === decl.task!.id);
      if (t) return t;
    }
  }
  return undefined;
}

/** Default chat config (skill+skills+agent) por pilar, DERIVADO: task cubriente
 *  (Foundation) o skill/agent explícitos del pilar. Lo consumen chat-config.default.json
 *  y el golden; el resolver usa PILLAR_SKILL_ALIAS (abajo) + owner-map para el agente. */
export const PILLAR_CHAT_DEFAULTS: Record<string, { skill: string; skills: string[]; agent?: string }> = (() => {
  const out: Record<string, { skill: string; skills: string[]; agent?: string }> = {};
  for (const [key, entry] of Object.entries(MANIFEST_PILLARS)) {
    const cov = coveringTask(key);
    const skill = cov?.skill ?? entry.skill;
    if (!skill) continue;
    out[key] = { skill, skills: [skill], agent: cov?.agent ?? entry.agent };
  }
  return out;
})();

/** Pilar → skill (derivado). Fuente única para skill-resolver (sustituye al
 *  skillAlias/homonymous que vivían en el manifest). */
export const PILLAR_SKILL_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(PILLAR_CHAT_DEFAULTS).map(([k, v]) => [k, v.skill]),
);

/**
 * Default doc paths per pillar (fallback when foundation-state.json doesn't have
 * an output_file for the pillar). Each entry is an array of paths to try in order.
 *
 * DERIVED from the single source of truth `config/pillar-manifest.json` (F0) — do
 * NOT hand-edit; edit the manifest. Equivalence with the previous hardcoded map is
 * frozen in src/lib/__tests__/pillar-manifest.test.mts.
 *
 * SAN-192 (W3): la ruta canónica vive en la TASK (`deliverableFiles`). Para
 * pilares Foundation se DERIVA de su task cubriente; un pilar solo declara
 * `docPaths` cuando aporta rutas extra de resolución que la task no produce
 * (fallback `lite.md` del kickoff, ubicaciones legacy alternativas) o cuando no
 * tiene task (documentos-pilar de Content). `docPaths` explícito gana.
 *
 * Lite fallback convention: para pilares cuyo path canónico es también target de
 * fast-foundation, se lista `…current.md` (de la task) y el hermano `lite.md`
 * (en `docPaths` del pilar). `current.md` lo produce la skill full; `lite.md` el
 * kickoff como seed preliminar.
 */
export const PILLAR_DOC_PATHS: Record<string, string[]> = Object.fromEntries(
  Object.entries(MANIFEST_PILLARS)
    .map(([key, entry]) => {
      const paths = entry.docPaths ?? coveringTask(key)?.deliverableFiles ?? coveringTask(key)?.docPaths;
      return paths ? ([key, paths] as const) : null;
    })
    .filter((x): x is readonly [string, string[]] => x !== null),
);

/**
 * Resolve the doc path for a pillar, checking foundation-state.json first,
 * then falling back to PILLAR_DOC_PATHS.
 */
export function resolvePillarDocPath(
  pillarKey: string,
  foundationState?: { sections?: Record<string, { pillars?: Record<string, { output_file?: string }> }> }
): string | null {
  // Check foundation-state.json first (has exact output_file per pillar)
  if (foundationState?.sections) {
    for (const section of Object.values(foundationState.sections)) {
      const pillar = section.pillars?.[pillarKey];
      if (pillar?.output_file) return pillar.output_file;
    }
  }

  // Fallback to static mapping
  const paths = PILLAR_DOC_PATHS[pillarKey];
  return paths?.[0] || null;
}

/**
 * Resolve doc path(s) for a task. Tries multiple sources in priority order:
 *
 *   1. `task.deliverable_file` — explicit field set on the task. This is the
 *      authoritative source when present (skills know what file they write).
 *   2. `task.output_files` — legacy field, also explicit.
 *   3. `task.pillar` → `foundation-state.json.pillars[pillar].output_file`
 *   4. `task.pillar` → static `PILLAR_DOC_PATHS` fallback
 *
 * Returns an array of relative paths (relative to `brand/{slug}/`). Empty
 * array if nothing can be resolved. The first element is the primary.
 *
 * Why this exists:
 *   The old `resolvePillarDocPath` only knew how to map pillar → conventional
 *   `current.md` path. Skills like `competitor-intelligence` actually write
 *   `competitive-analysis.current.md`, breaking the convention. This resolver
 *   reads the explicit `deliverable_file` set by the skill (or by a migration
 *   script) so the UI never has to guess.
 */
export function resolveTaskDocPaths(
  task: {
    deliverable_file?: string | string[];
    output_files?: string[];
    pillar?: string;
  },
  foundationState?: { sections?: Record<string, { pillars?: Record<string, { output_file?: string }> }> }
): string[] {
  const stripBrand = (p: string) => p.replace(/^brand\/[^/]+\//, "");

  // 1) Explicit deliverable_file on the task (canonical when present)
  if (task.deliverable_file) {
    const arr = Array.isArray(task.deliverable_file) ? task.deliverable_file : [task.deliverable_file];
    const files = arr.filter((p) => !p.endsWith("/"));
    const dirs = arr.filter((p) => p.endsWith("/"));

    if (files.length > 0) return files.map(stripBrand);

    // Directory deliverables (e.g. `brand/X/brand-book/visual-identity/templates/`):
    // a single doc fetch would 404, so fall back to `output_files`. Skills emit
    // those as paths relative to the deliverable directory's parent (e.g.
    // `templates/blog-post/template.html` next to `brand-book/visual-identity/`),
    // so we resolve them against that parent here.
    if (dirs.length > 0 && task.output_files && task.output_files.length > 0) {
      const baseDir = stripBrand(dirs[0]).replace(/\/$/, "");
      const parent = baseDir.includes("/") ? baseDir.slice(0, baseDir.lastIndexOf("/")) : "";
      return task.output_files.map((f) => {
        const stripped = stripBrand(f);
        if (stripped.startsWith(`${baseDir}/`)) return stripped;
        return parent ? `${parent}/${stripped}` : stripped;
      });
    }
    // Bare directory with no output_files — fall through to other resolution.
  }

  // 2) Legacy output_files (no deliverable_file at all)
  if (task.output_files && task.output_files.length > 0) {
    return task.output_files.map(stripBrand);
  }

  // 3 & 4) Fall back to pillar-based resolution
  if (task.pillar) {
    const docPath = resolvePillarDocPath(task.pillar, foundationState);
    if (docPath) return [stripBrand(docPath)];
  }

  return [];
}
