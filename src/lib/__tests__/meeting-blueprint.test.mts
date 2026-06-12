import { test } from "node:test";
import assert from "node:assert/strict";

const { instantiateSingletonTask, ownerCheckFindings } = await import("../data/task-blueprints");

// Meeting Intelligence setup task: derived from the registry must reproduce the
// legacy buildSetupTask shape byte-for-byte, PLUS the co-located agent (hamete).
test("instantiateSingletonTask('meeting') === legacy buildSetupTask (+ agent)", () => {
  const slug = "growth4u";
  const id = "P00-Onboarding-T01";
  assert.deepEqual(instantiateSingletonTask("meeting", { slug, id }), {
    id,
    name: "Implementar/configurar Meeting Intelligence",
    description:
      "Configurar Meeting Intelligence desde el chat sidebar: verificar MCP/APIs, usar Google Workspace/GOG para buscar y validar carpetas de Drive, aceptar ID/URL solo como fallback, seleccionar Notion database/page, cargar filtros como clients relation y ejecutar un primer run.\n\nNo aplicar cambios sobre StrategyPlan, POV Bank ni documentos canónicos sin revisión humana explícita.",
    deliverable: "Meeting Intelligence configurado con fuentes aprobadas, filtros guardados, routing revisado y primer run documentado.",
    done_criteria:
      "Google Drive o Notion configurado; filtros/routing guardados; primer scan ejecutado con reuniones encontradas o reporte explícito de cero reuniones; setup.md actualizado.",
    depends_on: null,
    owner: "Sancho",
    status: "todo",
    channel: "intelligence",
    type: "foundation",
    skill: "meeting-intelligence",
    agent: "hamete",
    deliverable_file: "brand/growth4u/intelligence/setup.md",
    output_files: ["brand/growth4u/intelligence/config.json", "brand/growth4u/intelligence/setup.md"],
  });
});

// The dedupe/placement logic keys on this exact name — guard it.
test("meeting task name matches the dedupe constant", () => {
  assert.equal(
    instantiateSingletonTask("meeting", { slug: "x", id: "y" }).name,
    "Implementar/configurar Meeting Intelligence",
  );
});

test("owner-check still clean (now incl. meeting)", () => {
  assert.deepEqual(ownerCheckFindings(), []);
});
