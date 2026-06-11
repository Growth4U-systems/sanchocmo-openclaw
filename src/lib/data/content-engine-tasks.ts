// ============================================================
// Content Engine task seed (SAN-167 F2)
// ============================================================
// Builds the canonical 5-task Content Engine project from the declarative
// section manifest (config/sections/content.json) instead of a hardcoded
// array. The manifest owns the structural contract per task — id, name, skill,
// AGENT (co-located), deliverable path(s), output_files, type/channel, deps —
// so "who runs this and where it writes" lives in one place (the fix for the
// SAN-166 class of bug). The prose (description/deliverable text) stays here,
// where {slug}/{projectId} interpolation is ergonomic.
//
// Consumed by api/content-creation/create-project.ts. Equivalence with the
// previous hardcoded array is frozen in
// src/lib/__tests__/section-manifest.test.mts.
// ============================================================

import { getSectionManifest, type SectionTask } from "../section-manifest";
import type { TaskCreateInput } from "./task-create-helpers";

/** Per-task prose, keyed by manifest taskKey. */
function descriptions(slug: string, projectId: string): Record<string, { description: string; deliverable: string }> {
  return {
    T01: {
      description:
        "Proceso 1 — Ejecutar content-strategy a nivel empresa. Define: nichos confirmados, Content Tilt, Villano, Trigger Events, canales activos, mix searchable/shareable, pillars a alto nivel, KPIs norte.",
      deliverable: "Documento con las 14 decisiones estrategicas globales del Content Engine",
    },
    T02: {
      description:
        "Proceso 1 — Ejecutar content-pillars. Define 3-5 pillars (TEMAS, no POV). Lee Foundation completa + strategy-decisions.md. Asigna funnel_role per pillar. El humano confirma la lista final.",
      deliverable: "Content pillars con funnel_role, pain_origin, expertise, related_topics",
    },
    T03: {
      description: `Rellena los configs existentes (news-prompts, paa-queries, keywords-seed, sources.json profiles, cadence-config.yml) con datos derivados de content-pillars.md + pov-bank.json + Foundation. Genera ademas un setup.md narrativo que explica el por que de cada decision y enlaza con los crones que consumen cada config. La infraestructura (carpetas + YAMLs + crons) ya existe — esta tarea solo MODIFICA los campos editables y DOCUMENTA. ORDEN DE EJECUCION: SE EJECUTA EL ULTIMO. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) + ${projectId}-T04 (POV Bank) en status:completed.`,
      deliverable: "Configs por pillar + cadence + sources.json profiles + setup.md narrativo",
    },
    T04: {
      description: `Construye la BD de puntos de vista (pov-bank.json) per pillar: core_belief, we_say_yes_to/no_to, preferred_angles, evidence_we_cite. Lee brand-voice + content-pillars + clarify-history. El skill idea-builder consultara este doc para generar angle_drafts diferenciados (no genericos). Se refresca mensualmente con el cron POV Bank Refresh basado en patrones de clarify-history. ORDEN DE EJECUCION: VA ANTES que ${projectId}-T03 (Setup configs) — el POV se decide primero, despues se configuran los inputs alineados con esa postura. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) en status:completed.`,
      deliverable: "POV Bank con opiniones por pillar (core_belief, we_say_yes/no, preferred_angles, evidence)",
    },
    T05: {
      description: `Genera las 5 plantillas HTML brand-specific (linkedin-quote, linkedin-9-slide, instagram-3-slide, blog-post, blog-title) ejecutando el skill ${slug}-visual-generator. La skill lee design-tokens.json + visual-identity-current.md, decide qué personajes incluir, genera con nano-banana-pro los assets faltantes, y produce los HTMLs en brand/${slug}/brand-book/visual-identity/templates/{id}/. Ver SKILL.md de la skill para el flow completo. Prerequisito de runtime: visual-identity pillar 'approved' en Foundation L5.`,
      deliverable: "5 plantillas HTML (template.html o slide-*.html) + meta.json por plantilla",
    },
  };
}

/** Format `depends_on` exactly as the legacy seeder did: null for 0 deps,
 *  a bare string for 1, an array for ≥2. */
function formatDependsOn(deps: string[], keyById: Map<string, string>, projectId: string): null | string | string[] {
  const ids = deps.map((d) => {
    const key = keyById.get(d);
    if (!key) throw new Error(`content manifest: dependsOn references unknown task "${d}"`);
    return `${projectId}-${key}`;
  });
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];
  return ids;
}

/**
 * Build the 5 canonical Content Engine tasks for a brand + projectId, derived
 * from config/sections/content.json. Ordered by taskKey (T01…T05). Pure — no fs.
 */
export function buildContentEngineTasks(slug: string, projectId: string): TaskCreateInput[] {
  const manifest = getSectionManifest("content");
  if (!manifest) throw new Error("content section manifest not found");

  const seeded = manifest.tasks
    .filter((t): t is SectionTask & { taskKey: string } => Boolean(t.taskKey))
    .sort((a, b) => a.taskKey.localeCompare(b.taskKey));

  const keyById = new Map(seeded.map((t) => [t.id, t.taskKey]));
  const prose = descriptions(slug, projectId);

  return seeded.map((t) => {
    const rel = (t.deliverableFiles ?? [t.docPath]).map((p) => `brand/${slug}/${p}`);
    const deliverable_file = rel.length === 1 ? rel[0] : rel;
    const skill = t.skill.replace(/\{slug\}/g, slug);

    return {
      id: `${projectId}-${t.taskKey}`,
      name: t.name,
      description: prose[t.taskKey].description,
      phase: t.phase,
      type: t.type,
      channel: t.channel,
      niche: null,
      status: "todo",
      deliverable: prose[t.taskKey].deliverable,
      deliverable_file,
      output_files: t.outputFiles,
      depends_on: formatDependsOn(t.dependsOn, keyById, projectId),
      owner: "Sancho",
      skill,
      agent: t.agent,
      mc_chat_thread_id: `task-${projectId.toLowerCase()}-${t.taskKey.toLowerCase()}`,
      discord_thread_id: null,
    };
  });
}
