import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SalesEngineLeadsResponse } from "@/hooks/useMetrics";
import {
  drilldownStageForMatrixRow,
  SalesEngineLeadsContent,
  salesEngineDrilldownColumns,
} from "../SalesEngineDrilldown";

function leadsResponse(
  rows: SalesEngineLeadsResponse["rows"],
  overrides: Partial<SalesEngineLeadsResponse> = {},
): SalesEngineLeadsResponse {
  return {
    configured: true,
    slug: "acme",
    stage: "leads",
    bucket: "email",
    from: "2026-06-20",
    to: "2026-07-20",
    rows,
    total: rows.length,
    truncated: false,
    source: "ghl-live",
    ...overrides,
  };
}

test("cada fila de la matriz mapea a su lista GHL; € ganado abre las ganadas", () => {
  assert.equal(drilldownStageForMatrixRow("leads"), "leads");
  assert.equal(drilldownStageForMatrixRow("reuniones"), "meetings");
  assert.equal(drilldownStageForMatrixRow("oportunidades"), "opportunities");
  assert.equal(drilldownStageForMatrixRow("ganadas"), "won");
  assert.equal(drilldownStageForMatrixRow("valor"), "won");
  assert.equal(drilldownStageForMatrixRow("otracosa"), null);
});

test("las columnas base son Nombre/Empresa/Origen/Fecha más la específica por etapa", () => {
  assert.deepEqual(
    salesEngineDrilldownColumns("leads").map((column) => column.label),
    ["Nombre", "Empresa", "Origen", "Fecha"],
  );
  assert.deepEqual(
    salesEngineDrilldownColumns("meetings").map((column) => column.label),
    ["Nombre", "Empresa", "Origen", "Fecha", "Estado"],
  );
  assert.deepEqual(
    salesEngineDrilldownColumns("won").map((column) => column.label),
    ["Nombre", "Empresa", "Origen", "Fecha", "Etapa pipeline", "Valor"],
  );
});

test("el contenido del drill-down cubre loading, error, vacío y filas", () => {
  const loading = renderToStaticMarkup(
    createElement(SalesEngineLeadsContent, { stage: "leads", isLoading: true }),
  );
  assert.match(loading, /Consultando GoHighLevel/);

  const failed = renderToStaticMarkup(
    createElement(SalesEngineLeadsContent, {
      stage: "leads",
      errorMessage: "GoHighLevel respondió HTTP 503 en contacts/search",
    }),
  );
  assert.match(failed, /HTTP 503/);
  assert.match(failed, /role="alert"/);

  const empty = renderToStaticMarkup(
    createElement(SalesEngineLeadsContent, { stage: "leads", data: leadsResponse([]) }),
  );
  assert.match(empty, /Sin registros en GoHighLevel/);

  const rows = renderToStaticMarkup(
    createElement(SalesEngineLeadsContent, {
      stage: "won",
      data: leadsResponse([
        {
          name: "Sofía Prueba",
          email: "sofia@example.com",
          companyName: "Ciencia Capilar",
          source: "Explee AutoGTM",
          date: "2026-07-20T09:00:00.000Z",
          pipelineStage: "Cualificado",
          monetaryValue: 5000,
        },
      ], { stage: "won", from: null, to: null }),
    }),
  );
  assert.match(rows, /Sofía Prueba/);
  assert.match(rows, /sofia@example\.com/);
  assert.match(rows, /Ciencia Capilar/);
  assert.match(rows, /Explee AutoGTM/);
  assert.match(rows, /2026-07-20/);
  assert.match(rows, /Cualificado/);
  // es-ES no separa los miles en números de 4 cifras: "€5000".
  assert.match(rows, /€5\.?000/);
});

test("cuando el proveedor trunca la lista se declara en vez de fingir totalidad", () => {
  const markup = renderToStaticMarkup(
    createElement(SalesEngineLeadsContent, {
      stage: "leads",
      data: leadsResponse(
        [{
          name: "Uno",
          email: "uno@example.com",
          companyName: "",
          source: "Explee AutoGTM",
          date: "2026-07-20T09:00:00.000Z",
        }],
        { total: 140, truncated: true },
      ),
    }),
  );
  assert.match(markup, /Mostrando 1 de 140\+/);
});
