export interface PhaseOneMessageLead {
  firstName?: string | null;
  company?: string | null;
}

function cleanReason(reason: string): string {
  const cleaned = reason.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  return cleaned ? `${cleaned.charAt(0).toLocaleUpperCase("es-ES")}${cleaned.slice(1)}` : "";
}

export function buildPhaseOneLinkedInTemplate(reason: string): string {
  const contactReason = cleanReason(reason);
  if (!contactReason) return "";
  return `Hola {{firstName}}, quería contactarte por una idea para {{company}}. ${contactReason}. ¿Te parece si conectamos?`;
}

export function buildPhaseOneLinkedInMessage(lead: PhaseOneMessageLead, reason: string): string {
  const contactReason = cleanReason(reason);
  if (!contactReason) return "";

  const greeting = lead.firstName?.trim() ? `Hola ${lead.firstName.trim()},` : "Hola,";
  const recipient = lead.company?.trim() || "tu equipo";
  return `${greeting} quería contactarte por una idea para ${recipient}. ${contactReason}. ¿Te parece si conectamos?`;
}
