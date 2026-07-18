import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyAccountType,
  classifyCandidateAccountType,
} from "../account-type-classifier";
import {
  AMBIGUOUS_ACCOUNT_REVIEW_NOTE,
  BUSINESS_ACCOUNT_DISQUALIFY_NOTE,
  qualifyCandidate,
} from "../qualify-enrich";
import type { RawDiscoveryCandidate } from "../discovery-types";

// ── Casos reales de la búsqueda de staging (SAN-480, 2026-07-18) ────────────
// Cuentas de empresa que se colaron en la cola de outreach:

test("@svenson (clínica capilar corporativa) → business", () => {
  const result = classifyAccountType({
    username: "svenson",
    fullName: "Svenson España",
    biography:
      "Expertos en salud capilar desde 1959. Más de 30 centros en España. Pide tu cita y diagnóstico gratuito ☎️",
    categoryName: "Health/beauty",
    isBusinessAccount: true,
  });
  assert.equal(result.verdict, "business");
  assert.ok(result.reasons.length > 0);
});

test("@ventapelucas (tienda de pelucas) → business", () => {
  const result = classifyAccountType({
    username: "ventapelucas",
    fullName: "Venta Pelucas Online",
    biography: "Pelucas oncológicas y de fibra. Envíos a toda España 📦 Pedidos por WhatsApp",
    categoryName: "Producto/servicio",
    isBusinessAccount: true,
  });
  assert.equal(result.verdict, "business");
});

test("@remindhairclinics (clínica) → business incluso sin flags del proveedor", () => {
  const result = classifyAccountType({
    username: "remindhairclinics",
    fullName: "Remind Hair Clinics",
    biography: "Injerto capilar y tratamientos. Primera consulta gratuita. Sedes en Madrid y Valencia.",
  });
  assert.equal(result.verdict, "business");
});

// Creadoras reales que deben pasar:

test("@sofiacienciacapilar_ (creadora, bio en primera persona) → creator", () => {
  const result = classifyAccountType({
    username: "sofiacienciacapilar_",
    fullName: "Sofia ❤️",
    biography: "Te enseño a cuidar tu pelo con ciencia 🔬 Divulgación capilar sin humo",
    categoryName: "Digital creator",
    isBusinessAccount: false,
    isProfessionalAccount: true,
    followers: 18_000,
  });
  assert.equal(result.verdict, "creator");
});

test("@dra.ameliamoralestoquero (médica creadora) → creator pese al título dra.", () => {
  const result = classifyAccountType({
    username: "dra.ameliamoralestoquero",
    fullName: "Amelia Morales Toquero",
    biography: "Dermatóloga. Divulgación sobre salud capilar y tricología. Comparto lo que veo en consulta.",
    categoryName: "Médico",
  });
  assert.equal(result.verdict, "creator");
});

test("una médica con clínica-organización sí es business", () => {
  const result = classifyAccountType({
    username: "clinicadragarcia",
    fullName: "Clínica Dra. García",
    biography: "Somos tu clínica de medicina estética. Pide cita: 910 000 000. Horario L-V 9-20h.",
    categoryName: "Health/beauty",
    isBusinessAccount: true,
  });
  assert.equal(result.verdict, "business");
});

test("solo is_business_account + categoría ambigua → ambiguous, nunca descartada directa", () => {
  const result = classifyAccountType({
    username: "capilarbienestar",
    fullName: "Capilar Bienestar",
    biography: "Salud capilar y bienestar 🌿",
    categoryName: "Health/beauty",
    isBusinessAccount: true,
  });
  assert.equal(result.verdict, "ambiguous");
});

test("perfil personal sin señales de negocio → creator por defecto", () => {
  const result = classifyAccountType({
    username: "lauragarcia",
    fullName: "Laura García",
    biography: "🌸 Madrid",
  });
  assert.equal(result.verdict, "creator");
});

test("los matchers no disparan por subcadenas (aventuras≠venta, sandra≠dra, sedentario≠sede)", () => {
  const result = classifyAccountType({
    username: "aventurasdesandra",
    fullName: "Sandra Ruiz",
    biography: "Vida sedentaria no, gracias 🏃‍♀️ Rutinas y pelo sano",
  });
  assert.equal(result.verdict, "creator");
  assert.ok(
    !result.reasons.some((reason) => reason.includes("venta")),
    `no debe leer "venta" en "aventuras": ${result.reasons.join(" · ")}`,
  );
});

test("forma legal en la bio pesa como empresa", () => {
  const result = classifyAccountType({
    username: "capilarpro",
    fullName: "CapilarPro S.L.",
    biography: "Distribuidor oficial de tratamientos capilares.",
  });
  assert.equal(result.verdict, "business");
});

// ── Integración con la etapa qualify (SAN-480) ──────────────────────────────

function candidate(
  overrides: Partial<RawDiscoveryCandidate> & Pick<RawDiscoveryCandidate, "handle">,
): RawDiscoveryCandidate {
  return {
    network: "instagram",
    followers: 20_000,
    engagementRatePct: 4.5,
    ...overrides,
  } as RawDiscoveryCandidate;
}

test("qualify: cuenta de empresa → score 0 con razón visible y tag de descarte", () => {
  const qualified = qualifyCandidate(
    candidate({
      handle: "@remindhairclinics",
      name: "Remind Hair Clinics",
      customVariables: {
        biografia:
          "Injerto capilar y tratamientos. Primera consulta gratuita. Sedes en Madrid y Valencia.",
        categoria: "Clínica",
      },
      account: { businessAccount: true },
    }),
    { searchId: "search-test" },
  );
  assert.equal(qualified.accountType.verdict, "business");
  assert.equal(qualified.lead.qualityScore, 0);
  assert.equal(qualified.score.total, 0);
  assert.equal(qualified.score.band, "low");
  assert.equal(
    qualified.lead.qualityComponents.accountType?.note,
    BUSINESS_ACCOUNT_DISQUALIFY_NOTE,
  );
  assert.ok(
    (qualified.lead.qualityComponents.accountType?.reasons.length ?? 0) > 0,
  );
  assert.ok(qualified.lead.tags.includes("descartada:cuenta-empresa"));
});

test("qualify: cuenta ambigua NO se descarta, se marca a revisar", () => {
  const qualified = qualifyCandidate(
    candidate({
      handle: "@capilarbienestar",
      name: "Capilar Bienestar",
      customVariables: {
        biografia: "Salud capilar y bienestar 🌿",
        categoria: "Health/beauty",
      },
      account: { businessAccount: true },
    }),
  );
  assert.equal(qualified.accountType.verdict, "ambiguous");
  assert.ok(qualified.lead.qualityScore > 0);
  assert.equal(
    qualified.lead.qualityComponents.accountType?.note,
    AMBIGUOUS_ACCOUNT_REVIEW_NOTE,
  );
  assert.ok(qualified.lead.tags.includes("revisar:posible-negocio"));
});

test("qualify: creadora intacta — sin nota de cuenta ni tags extra", () => {
  const qualified = qualifyCandidate(
    candidate({
      handle: "@sofiacienciacapilar_",
      name: "Sofia ❤️",
      customVariables: {
        biografia: "Te enseño a cuidar tu pelo con ciencia 🔬",
        categoria: "Digital creator",
      },
      account: { businessAccount: false, professionalAccount: true },
    }),
  );
  assert.equal(qualified.accountType.verdict, "creator");
  assert.ok(qualified.lead.qualityScore > 0);
  assert.equal(qualified.lead.qualityComponents.accountType, undefined);
  assert.ok(!qualified.lead.tags.some((tag) => tag.startsWith("descartada:")));
  assert.ok(!qualified.lead.tags.some((tag) => tag.startsWith("revisar:")));
});

test("classifyCandidateAccountType lee bio/categoría de customVariables y flags de account", () => {
  const result = classifyCandidateAccountType(
    candidate({
      handle: "@ventapelucas",
      name: "Venta Pelucas Online",
      customVariables: {
        biografia: "Envíos a toda España 📦 Pedidos por WhatsApp",
        categoria: "Producto/servicio",
      },
      account: { businessAccount: true },
    }),
  );
  assert.equal(result.verdict, "business");
});
