/**
 * questions.ts — Hardcoded v1 intake questionnaire (SAN-17).
 *
 * Single source of truth used by: the public page (render), the POST endpoint
 * (validation), and the markdown renderer (seed doc). Curated subset (~17
 * substantive fields) derived from the G4U "Form Inicial Cliente" template.
 *
 * `contact_name` / `contact_email` are META: they identify the respondent and
 * are stored in dedicated columns, NOT in the answers JSON.
 */

export type IntakeFieldType = "text" | "textarea" | "email";

export interface IntakeQuestion {
  id: string;
  section: string;
  label: string;
  help?: string;
  type: IntakeFieldType;
  required: boolean;
  /** Foundation pillar this answer seeds (indicative). "meta" = respondent id. */
  pillar: string;
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { id: "contact_name", section: "Contacto", label: "Tu nombre", type: "text", required: true, pillar: "meta" },
  { id: "contact_email", section: "Contacto", label: "Tu email", type: "email", required: true, pillar: "meta" },

  { id: "company_name", section: "Empresa y oferta", label: "Nombre de la empresa", type: "text", required: true, pillar: "company-brief" },
  { id: "website", section: "Empresa y oferta", label: "Web", type: "text", required: false, pillar: "company-brief" },
  { id: "elevator_pitch", section: "Empresa y oferta", label: "¿Qué hacéis? (en una o dos frases)", type: "textarea", required: true, pillar: "company-brief" },
  { id: "business_lines", section: "Empresa y oferta", label: "Líneas de negocio / productos principales", type: "textarea", required: true, pillar: "company-brief" },
  { id: "markets", section: "Empresa y oferta", label: "Mercados donde operáis (actual y objetivo)", type: "textarea", required: true, pillar: "company-brief" },

  { id: "problem", section: "Propuesta de valor", label: "¿Qué problema resolvéis y para quién?", type: "textarea", required: true, pillar: "brand" },
  { id: "differentiation", section: "Propuesta de valor", label: "Diferencial vs alternativas (¿por qué vosotros?)", type: "textarea", required: true, pillar: "brand" },
  { id: "brand_values", section: "Propuesta de valor", label: "Valores / pilares de marca y tono", type: "textarea", required: true, pillar: "brand" },

  { id: "ideal_customer", section: "Cliente / ICP", label: "¿Quién es vuestro cliente ideal? (segmentos prioritarios)", type: "textarea", required: true, pillar: "icp" },
  { id: "acquisition", section: "Cliente / ICP", label: "¿Cómo llegan los clientes hoy? (canales actuales)", type: "textarea", required: true, pillar: "icp" },
  { id: "objections", section: "Cliente / ICP", label: "Objeciones frecuentes del cliente", type: "textarea", required: false, pillar: "icp" },

  { id: "competitors", section: "Competencia", label: "Competidores principales (uno por línea, con su web)", help: "Formato: Nombre — https://web.com (uno por línea). La web nos deja medir tu Trust Score frente a ellos.", type: "textarea", required: true, pillar: "competitor-analysis" },

  { id: "metrics", section: "Métricas y objetivos", label: "Métricas actuales clave (revenue, usuarios… lo que tengáis)", type: "textarea", required: false, pillar: "north-star" },
  { id: "goals", section: "Métricas y objetivos", label: "Objetivos a 3 / 6 / 12 meses", type: "textarea", required: true, pillar: "north-star" },

  { id: "online_presence", section: "Presencia y activos", label: "Presencia online (web, redes, newsletter) + accesos", type: "textarea", required: false, pillar: "brand-voice" },
  { id: "social_proof", section: "Presencia y activos", label: "Prueba social / casos / testimonios disponibles", type: "textarea", required: false, pillar: "brand-voice" },
];

/** Ordered, de-duplicated section names (for grouped rendering). */
export const INTAKE_SECTIONS: string[] = INTAKE_QUESTIONS.reduce<string[]>((acc, q) => {
  if (!acc.includes(q.section)) acc.push(q.section);
  return acc;
}, []);
