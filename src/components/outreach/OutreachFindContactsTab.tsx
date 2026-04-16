/**
 * Outreach > Encuentra Contactos tab.
 *
 * Fuentes de descubrimiento de contactos: research tasks, imports desde
 * Atalaya/Trust Engine, upload CSV manual. Paralelo a "Encuentra Ideas"
 * de Content Creation.
 */

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
      description="Fuentes de descubrimiento de contactos: research tasks, imports desde Atalaya/Trust Engine, upload CSV manual."
      actions={[
        "Tareas activas de research (company-finder, decision-maker-finder, enrichment)",
        "Import desde Atalaya (contactos detectados con signal)",
        "Import desde Trust Engine media list",
        "Upload CSV manual",
        "Botón 'Lanzar research' → Sancho dispatcha Escudero con el skill correcto",
      ]}
    />
  );
}
