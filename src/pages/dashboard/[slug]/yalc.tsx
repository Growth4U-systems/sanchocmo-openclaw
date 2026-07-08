import { useRouter } from "next/router";
import { PartnershipsView } from "@/components/partnerships/partnerships-view";
import { OutboundB2BView } from "@/components/outbound-b2b/outbound-b2b-view";
import { tipoFromQuery } from "@/components/partnerships/tipo-selector";

/**
 * Outreach (= la UI de Yalc, SAN-115/SAN-78). Partnerships es un TIPO de
 * campaña, no un módulo aparte: el selector Tipo filtra la página.
 *
 *  - tipo=partnerships (default) → Encuentra · Contactos · Inbox · Plantillas
 *    (SAN-78, mockups OUTPUTS/sanchocmo/mockups-partnerships como spec).
 *  - tipo=b2b → B2B con la misma lógica visual/operativa de Partnerships.
 */
export default function OutreachPage() {
  const router = useRouter();
  const tipo = tipoFromQuery(router.query.tipo);
  if (tipo === "b2b") return <OutboundB2BView />;
  return <PartnershipsView />;
}
