export const LINKEDIN_MESSAGE_VARIABLES = [
  { token: "{{first_name}}", label: "Nombre" },
  { token: "{{company}}", label: "Empresa" },
  { token: "{{contact_reason}}", label: "Motivo" },
  { token: "{{hook}}", label: "Hook individual" },
] as const;

export interface LinkedInMessageSuggestion {
  id: string;
  name: string;
  description: string;
  template: string;
  recommended?: boolean;
}

export const LINKEDIN_MESSAGE_SUGGESTIONS: LinkedInMessageSuggestion[] = [
  {
    id: "direct_reason_v1",
    name: "Directa y relevante",
    description: "Explica el motivo y lo conecta con su empresa.",
    template: "Hola {{first_name}}, te contacto porque {{contact_reason}} Creo que puede ser relevante para {{company}}. ¿Te parece si conectamos?",
    recommended: true,
  },
  {
    id: "hook_first_v1",
    name: "Hook primero",
    description: "Abre con la personalización de cada contacto.",
    template: "Hola {{first_name}}, {{hook}} Te contacto porque {{contact_reason}} ¿Te apetece conectar?",
  },
  {
    id: "question_company_v1",
    name: "Pregunta breve",
    description: "Inicia la conversación con una pregunta sobre la empresa.",
    template: "Hola {{first_name}}, te contacto porque {{contact_reason}} ¿Es algo que estáis trabajando en {{company}}?",
  },
];
