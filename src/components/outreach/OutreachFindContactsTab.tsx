// Outreach > Encuentra Contactos tab. Paralelo a "Encuentra Ideas" de Content Creation.

import { OutreachPhase1Placeholder } from "./OutreachPhase1Placeholder";

interface Props {
  slug: string;
}

export function OutreachFindContactsTab({ slug }: Props) {
  return (
    <OutreachPhase1Placeholder
      icon="🔎"
      title="Encuentra Contactos"
      slug={slug}
      description="Fuentes de descubrimiento de contactos: research tasks, descubrimiento de medios/creators, upload CSV manual."
      actions={[
        "Tareas activas de research (company-finder, decision-maker-finder, enrichment)",
        "Import desde medios/creators descubiertos (skill media-discovery)",
        "Upload CSV manual",
        "Botón 'Lanzar research' → Sancho dispatcha Hamete (research) o Rocinante (outreach) con el skill correcto",
      ]}
    />
  );
}
