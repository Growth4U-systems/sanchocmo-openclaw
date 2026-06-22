/**
 * Siembra de brand/<slug>/client-config.json en la creación de cliente (SAN-309).
 *
 * Hasta ahora ese fichero no se generaba: el operador lo creaba a mano antes de
 * correr `create-client-crons.sh` (que lee sus `.crons` para crear los crons).
 * Aquí lo sembramos automáticamente con los crons marcados `auto_onboarding: true`
 * en `_system/cron-templates.json`, **enabled por defecto** y con su `default_schedule`.
 * Así el refresco recurrente (p.ej. `trust_score_refresh`) queda default-on para
 * clientes nuevos sin que nadie tenga que acordarse de añadirlo a mano.
 *
 * Nota: esto deja el cliente "cron-ready". La creación efectiva de los jobs sigue
 * siendo el paso existente `create-client-crons.sh <slug>` (no se ejecuta aquí).
 */
import fs from "fs";
import path from "path";
import { BASE, brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

interface CronTemplate {
  auto_onboarding?: boolean;
  default_schedule?: string;
  default_tz?: string;
}

export interface SeededCron {
  enabled: boolean;
  schedule: string;
  tz: string;
}

const DEFAULT_TZ = "Europe/Madrid";

/**
 * Puro: a partir de los templates de cron, construye el mapa `crons` a sembrar en
 * el client-config.json de un cliente nuevo. Solo entran los `auto_onboarding: true`
 * que declaran un `default_schedule` (sin schedule no se puede crear el cron). Las
 * claves `$comment*` (documentación) se ignoran.
 */
export function buildOnboardingCrons(
  templates: Record<string, CronTemplate>,
): Record<string, SeededCron> {
  const crons: Record<string, SeededCron> = {};
  for (const [key, tmpl] of Object.entries(templates)) {
    if (key.startsWith("$")) continue;
    if (!tmpl?.auto_onboarding) continue;
    if (!tmpl.default_schedule) continue;
    crons[key] = {
      enabled: true,
      schedule: tmpl.default_schedule,
      tz: tmpl.default_tz ?? DEFAULT_TZ,
    };
  }
  return crons;
}

/**
 * Siembra brand/<slug>/client-config.json con los crons de auto-onboarding
 * (default-on). Best-effort e idempotente: si ya existe, no lo toca (no pisa
 * configs hechos a mano de clientes existentes). Nunca lanza: un fallo acá no
 * debe bloquear la creación del cliente.
 */
export function seedClientConfig(slug: string, name: string, language: string): void {
  try {
    const target = path.join(brandDir(slug), "client-config.json");
    if (fs.existsSync(target)) return;

    const templates = readJSON<Record<string, CronTemplate>>(
      path.join(BASE, "_system", "cron-templates.json"),
      {},
    );
    const config = {
      slug,
      name,
      language,
      publish: { default_transport: "slack" },
      channels: {},
      crons: buildOnboardingCrons(templates),
    };
    writeJSON(target, config);
  } catch (err) {
    console.error(`[clients/create] client-config seed failed for ${slug}:`, err);
  }
}
