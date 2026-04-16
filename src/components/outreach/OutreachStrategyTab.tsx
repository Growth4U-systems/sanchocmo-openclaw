/**
 * Outreach > Strategy tab.
 *
 * Cliente-global content for outreach: foundation docs relevant to
 * outreach, outreach-config del cliente, and librería de secuencias
 * perfectas curadas.
 */

import { OutreachPhase1Placeholder } from "./OutreachPhase1Placeholder";

interface Props {
  slug: string;
}

export function OutreachStrategyTab({ slug }: Props) {
  return (
    <OutreachPhase1Placeholder
      icon="🎯"
      title="Strategy"
      slug={slug}
      description="Documentos de foundation relevantes para outreach (ECPs, signals, canales) + outreach-config del cliente + librería de secuencias perfectas curadas."
      actions={[
        "Lista de ECPs del cliente (desde Foundation)",
        "Signal triggers configurables (fundraise, hiring, launch, etc.)",
        "Canales habilitados (Gmail / Instantly / HeyReach)",
        "Librería de secuencias perfectas (buscable por nicho/intent)",
        "Botón: 'Proponer proyecto de Outreach' (conversación con Sancho)",
      ]}
    />
  );
}
