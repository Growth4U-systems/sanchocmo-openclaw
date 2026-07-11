export interface PhaseOneMessageLead {
  firstName?: string | null;
  company?: string | null;
}

function cleanReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

export function buildPhaseOneLinkedInMessage(lead: PhaseOneMessageLead, reason: string): string {
  const contactReason = cleanReason(reason);
  if (!contactReason) return "";

  const greeting = lead.firstName?.trim() ? `Hola ${lead.firstName.trim()},` : "Hola,";
  const recipient = lead.company?.trim() || "tu equipo";
  return `${greeting} te contacto porque ${contactReason}. Creo que puede ser relevante para ${recipient}. ¿Te parece si conectamos?`;
}
