/**
 * SAN-349 P1 · normalizador B2B (company-DB → B2B Lead payload para Yalc).
 *
 * Espejo de discovery.test.mts para el motion B2B: una fila company+decisor
 * enriquecida se normaliza y se mapea al MISMO modelo de Lead que Partnerships,
 * con `source: "company-db"`. Puro (sin HTTP/Yalc) — determinista.
 *
 * Import dinámico como el resto de tests de partnerships (el runtime de
 * `tsx --test` no enlaza named imports estáticos de forma fiable).
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";

type B2BMod = typeof import("../b2b-normalize");
let lib: B2BMod;

before(async () => {
  lib = await import("../b2b-normalize");
});

test("normalizeB2BContact exige empresa + identidad de persona", () => {
  assert.equal(lib.normalizeB2BContact(null), null);
  assert.equal(lib.normalizeB2BContact({ firstName: "Ana" }), null); // sin empresa
  assert.equal(lib.normalizeB2BContact({ company: "Acme" }), null); // sin identidad
  const ok = lib.normalizeB2BContact({ company: "Acme", firstName: "Ana", email: "ana@acme.com" });
  assert.ok(ok);
  assert.equal(ok!.company, "Acme");
  assert.equal(ok!.firstName, "Ana");
  assert.equal(ok!.email, "ana@acme.com");
});

test("normalizeB2BContact tolera alias/snake_case y parte fullName", () => {
  const c = lib.normalizeB2BContact({
    company_name: "Globex",
    full_name: "Marta Ruiz Díaz",
    job_title: "Head of Growth",
    linkedin_url: "https://linkedin.com/in/martaruiz",
    apollo_id: "apl_123",
    company_domain: "globex.com",
    icp_score: 82,
  })!;
  assert.equal(c.company, "Globex");
  assert.equal(c.firstName, "Marta");
  assert.equal(c.lastName, "Ruiz Díaz");
  assert.equal(c.title, "Head of Growth");
  assert.equal(c.linkedinUrl, "https://linkedin.com/in/martaruiz");
  assert.equal(c.providerId, "apl_123");
  assert.equal(c.domain, "globex.com");
  assert.equal(c.qualificationScore, 82);
});

test("normalizeB2BContacts deduplica por empresa+persona y cuenta inválidos", () => {
  const { candidates, invalid } = lib.normalizeB2BContacts([
    { company: "Acme", firstName: "Ana", email: "ana@acme.com" },
    { company_name: "acme", email: "ana@acme.com" }, // dupe (misma empresa+email)
    { company: "Beta", linkedinUrl: "https://linkedin.com/in/joe" },
    { firstName: "sinEmpresa" }, // invalid: sin empresa
    "garbage", // invalid
  ]);
  assert.equal(candidates.length, 2);
  assert.equal(invalid, 2);
  assert.equal(candidates[0].company, "Acme");
  assert.equal(candidates[1].company, "Beta");
});

test("buildB2BLead mapea al Lead Yalc con source company-db y score clampeado", () => {
  const lead = lib.buildB2BLead(
    { company: "Acme", firstName: "Ana", lastName: "Gil", title: "CMO", email: "ana@acme.com", qualificationScore: 140 },
    { searchId: "b2b-1" },
  );
  assert.equal(lead.name, "Ana Gil");
  assert.equal(lead.company, "Acme");
  assert.equal(lead.headline, "CMO");
  assert.equal(lead.source, "company-db");
  assert.equal(lead.qualificationScore, 100); // clamp 140 → 100
  assert.ok(lead.tags.includes("search:b2b-1"));
  assert.ok(lead.tags.includes("source:company-db"));
});

test("buildB2BLead usa 50 neutro sin score y cae al nombre de empresa", () => {
  const lead = lib.buildB2BLead({ company: "Acme", email: "info@acme.com" });
  assert.equal(lead.qualificationScore, 50);
  assert.equal(lead.name, "Acme"); // sin nombre de persona → empresa
  assert.ok(lead.tags.includes("score:neutral-default"));
});
