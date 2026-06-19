// Meeting → Foundation-document detectors, expressed as engine rules (DATA).
//
// These are the rules behind `documentsForText()` (meeting-intelligence-runner):
// the keyword matcher that flags which canonical docs a meeting insight may
// impact. Moving it here is the first instance of "documentsForText becomes a
// text rule of the engine" (SAN-270) — the regexes are copied VERBATIM from the
// original so behavior is byte-identical.
//
// POV Bank is intentionally TWO rules: a direct signal (medium) and a mineable
// signal (low). The runner collapses duplicate documentNames keeping the highest
// severity, which reproduces the original `severity = direct ? "medium" : "low"`.

import type { Rule } from "../engine";

export const meetingDocumentRules: Rule[] = [
  {
    id: "doc-strategyplan",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      anyOf: [/\b(strategyplan|strategy plan|estrategia|prioridad|roadmap|go[- ]?to[- ]?market|gtm)\b/i],
    },
    proposal: {
      documentName: "StrategyPlan",
      severity: "high",
      reason: "Afecta estrategia, prioridades o roadmap.",
    },
  },
  {
    id: "doc-pov-direct",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      anyOf: [/\b(pov|proof point|creencia|belief|objecion|objeción|argumento|customer language|lenguaje de cliente)\b/i],
    },
    proposal: {
      documentName: "POV Bank",
      severity: "medium",
      reason: "Afecta POV, proof points u objeciones.",
    },
  },
  {
    id: "doc-pov-mineable",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      // OR of the two original mineable matchers (keyword set + numeric metric).
      anyOf: [
        /\b(aha|insight|nos dimos cuenta|realizamos que|problema resuelto|solucionamos|framework|proceso|sistema|ritual|contrario|mito|best practice|pasamos de|fuimos de|mrr|cac|ltv|payback|conversion|conversión|frustracion|frustración|fallo|duda)\b/i,
        /\b\d+\s*(%|x|€|\$)\b/i,
      ],
    },
    proposal: {
      documentName: "POV Bank",
      severity: "low",
      reason: "Contiene una señal mineable para POV: insight, proceso, métrica, conflicto o lenguaje de cliente.",
    },
  },
  {
    id: "doc-positioning",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      anyOf: [/\b(posicionamiento|positioning|diferenciacion|diferenciación|competidor|competencia)\b/i],
    },
    proposal: {
      documentName: "Positioning",
      severity: "medium",
      reason: "Afecta posicionamiento o diferenciación.",
    },
  },
  {
    id: "doc-content-pillars",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      anyOf: [/\b(contenido|content|pilar|pillar|editorial)\b/i],
    },
    proposal: {
      documentName: "Content Pillars",
      severity: "low",
      reason: "Afecta temas o ángulos de contenido.",
    },
  },
  {
    id: "doc-brand-voice",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      anyOf: [/\b(tono|voice|mensaje|copy|lenguaje)\b/i],
    },
    proposal: {
      documentName: "Brand Voice",
      severity: "low",
      reason: "Afecta tono o lenguaje de marca.",
    },
  },
  {
    id: "doc-company-brief",
    domain: "meeting",
    primitive: "textMatch",
    category: "meeting",
    params: {
      anyOf: [/\b(company brief|empresa|producto|cliente|oferta)\b/i],
    },
    proposal: {
      documentName: "Company Brief",
      severity: "low",
      reason: "Afecta contexto canónico de compañía o producto.",
    },
  },
];
