import { test } from "node:test";
import assert from "node:assert/strict";

// task-blueprints + skill-resolver are client-safe (no fs) → load directly.
const { instantiateTaskSet, getTaskSet, getTaskSetEntry, ownerCheckFindings, MANIFEST_TASK_SETS } = await import(
  "../data/task-blueprints"
);

// ── Owner-check: the guard that would have caught SAN-166 ──────────
test("every declared agent === the skill's owner (no SAN-166-class drift)", () => {
  assert.deepEqual(ownerCheckFindings(), [], `agent/owner mismatch: ${JSON.stringify(ownerCheckFindings(), null, 2)}`);
});

// ── Schema sanity per task set ────────────────────────────────────
for (const [key, set] of Object.entries(MANIFEST_TASK_SETS)) {
  test(`task set "${key}" — well-formed`, () => {
    assert.ok(set.tasks.length > 0, "has tasks");
    const ids = new Set<string>();
    for (const t of set.tasks) {
      for (const field of ["id", "name", "skill", "agent"] as const) {
        assert.ok(t[field], `task ${t.id || "?"} missing ${field}`);
      }
      assert.ok(!ids.has(t.id), `duplicate task id ${t.id}`);
      ids.add(t.id);
    }
    for (const t of set.tasks) {
      for (const dep of t.dependsOn ?? []) {
        assert.ok(ids.has(dep), `task ${t.id} depends on unknown id ${dep}`);
      }
    }
  });
}

test("channel-strategy is an on-demand entry (no taskKey) on dulcinea", () => {
  const ch = getTaskSetEntry("content", "channel-strategy");
  assert.ok(ch, "channel-strategy entry exists");
  assert.equal(ch?.agent, "dulcinea");
  assert.equal(ch?.taskKey, undefined, "on-demand → no taskKey");
});

// ── Equivalence: instantiateTaskSet("content") === the frozen legacy spec ──
// The previous hardcoded array in create-project.ts (then content-engine-tasks.ts)
// is the spec. The manifest-derived engine must reproduce it byte-for-byte, PLUS
// the co-located `agent`. Guards the create-project migration against drift.
test("instantiateTaskSet('content') reproduces the legacy create-project spec (+ agent)", () => {
  const slug = "growth4u";
  const projectId = "P07";
  const tid = (n: string) => `task-${projectId.toLowerCase()}-${n}`;

  const expected = [
    {
      id: "P07-T01",
      name: "Content Strategy (14 decisiones globales)",
      description: "Proceso 1 — Ejecutar content-strategy a nivel empresa. Define: nichos confirmados, Content Tilt, Villano, Trigger Events, canales activos, mix searchable/shareable, pillars a alto nivel, KPIs norte.",
      phase: 1,
      type: "foundation",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "Documento con las 14 decisiones estrategicas globales del Content Engine",
      deliverable_file: `brand/${slug}/content/strategy-decisions.md`,
      output_files: ["strategy-decisions.md"],
      depends_on: null,
      owner: "Sancho",
      skill: "content-strategy",
      agent: "dulcinea",
      mc_chat_thread_id: tid("t01"),
      discord_thread_id: null,
    },
    {
      id: "P07-T02",
      name: "Content Pillars (3-5 temas)",
      description: "Proceso 1 — Ejecutar content-pillars. Define 3-5 pillars (TEMAS, no POV). Lee Foundation completa + strategy-decisions.md. Asigna funnel_role per pillar. El humano confirma la lista final.",
      phase: 1,
      type: "foundation",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "Content pillars con funnel_role, pain_origin, expertise, related_topics",
      deliverable_file: `brand/${slug}/content/content-pillars.md`,
      output_files: ["content-pillars.md"],
      depends_on: "P07-T01",
      owner: "Sancho",
      skill: "content-pillars",
      agent: "dulcinea",
      mc_chat_thread_id: tid("t02"),
      discord_thread_id: null,
    },
    {
      id: "P07-T03",
      name: "Setup configs por pillar",
      description: `Rellena los configs existentes (news-prompts, paa-queries, keywords-seed, sources.json profiles, cadence-config.yml) con datos derivados de content-pillars.md + pov-bank.json + Foundation. Genera ademas un setup.md narrativo que explica el por que de cada decision y enlaza con los crones que consumen cada config. La infraestructura (carpetas + YAMLs + crons) ya existe — esta tarea solo MODIFICA los campos editables y DOCUMENTA. ORDEN DE EJECUCION: SE EJECUTA EL ULTIMO. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) + ${projectId}-T04 (POV Bank) en status:completed.`,
      phase: 1,
      type: "execution",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "Configs por pillar + cadence + sources.json profiles + setup.md narrativo",
      deliverable_file: `brand/${slug}/content/configs/setup.md`,
      output_files: [
        "setup.md",
        "cadence-config.yml",
        "news-prompts/*.yml",
        "paa-queries/*.yml",
        "keywords-seed/*.yml",
        "../../market-and-us/competitors/sources.json",
      ],
      depends_on: "P07-T04",
      owner: "Sancho",
      skill: "content-engine-setup",
      agent: "dulcinea",
      mc_chat_thread_id: tid("t03"),
      discord_thread_id: null,
    },
    {
      id: "P07-T04",
      name: "Build POV Bank",
      description: `Construye la BD de puntos de vista (pov-bank.json) per pillar: core_belief, we_say_yes_to/no_to, preferred_angles, evidence_we_cite. Lee brand-voice + content-pillars + clarify-history. El skill idea-builder consultara este doc para generar angle_drafts diferenciados (no genericos). Se refresca mensualmente con el cron POV Bank Refresh basado en patrones de clarify-history. ORDEN DE EJECUCION: VA ANTES que ${projectId}-T03 (Setup configs) — el POV se decide primero, despues se configuran los inputs alineados con esa postura. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) en status:completed.`,
      phase: 1,
      type: "execution",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "POV Bank con opiniones por pillar (core_belief, we_say_yes/no, preferred_angles, evidence)",
      deliverable_file: `brand/${slug}/content/pov-bank.json`,
      output_files: ["pov-bank.json", "pov-bank-history.json"],
      depends_on: "P07-T02",
      owner: "Sancho",
      skill: "pov-bank-builder",
      agent: "dulcinea",
      mc_chat_thread_id: tid("t04"),
      discord_thread_id: null,
    },
    {
      id: "P07-T05",
      name: "Visual Templates (5 plantillas HTML)",
      description: `Genera las 5 plantillas HTML brand-specific (linkedin-quote, linkedin-9-slide, instagram-3-slide, blog-post, blog-title) ejecutando el skill ${slug}-visual-generator. La skill lee design-tokens.json + visual-identity-current.md, decide qué personajes incluir, genera con nano-banana-pro los assets faltantes, y produce los HTMLs en brand/${slug}/brand-book/visual-identity/templates/{id}/. Ver SKILL.md de la skill para el flow completo. Prerequisito de runtime: visual-identity pillar 'approved' en Foundation L5.`,
      phase: 1,
      type: "foundation",
      channel: "visual",
      niche: null,
      status: "todo",
      deliverable: "5 plantillas HTML (template.html o slide-*.html) + meta.json por plantilla",
      deliverable_file: [
        `brand/${slug}/brand-book/visual-identity/templates/linkedin-quote/template.html`,
        `brand/${slug}/brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html`,
        `brand/${slug}/brand-book/visual-identity/templates/instagram-3-slide/slide-cover.html`,
        `brand/${slug}/brand-book/visual-identity/templates/blog-post/template.html`,
        `brand/${slug}/brand-book/visual-identity/templates/blog-title/template.html`,
      ],
      output_files: [
        "brand-book/visual-identity/templates/linkedin-quote/template.html",
        "brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html",
        "brand-book/visual-identity/templates/instagram-3-slide/slide-cover.html",
        "brand-book/visual-identity/templates/blog-post/template.html",
        "brand-book/visual-identity/templates/blog-title/template.html",
      ],
      depends_on: ["P07-T01", "P07-T02"],
      owner: "Sancho",
      skill: `${slug}-visual-generator`,
      agent: "maese-pedro",
      mc_chat_thread_id: tid("t05"),
      discord_thread_id: null,
    },
  ];

  assert.deepEqual(instantiateTaskSet("content", { slug, projectId }), expected);
});

test("unknown task set throws", () => {
  assert.throws(() => instantiateTaskSet("nope", { slug: "x", projectId: "P1" }));
  assert.equal(getTaskSet("nope"), undefined);
});
