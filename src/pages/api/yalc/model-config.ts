import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import {
  defaultModelConfig,
  getEffectiveModelConfig,
  ModelConfigValidationError,
  putModelConfigOverrides,
  type EffectiveModelConfig,
} from "@/lib/partnerships";

/**
 * Model config del programa de creators (SAN-76) — proxy de
 * `GET/PUT /api/model-config` de Yalc + merge con los defaults de
 * calc-creator-core (la config EFECTIVA se calcula aquí; Yalc solo almacena
 * los overrides). Paridad UI = chat = MCP: el tab Settings de Outreach, la
 * skill y la tool `yalc_update_model_config` pasan por esta misma lógica
 * (`src/lib/partnerships/model-config.ts`).
 *
 *   GET /api/yalc/model-config?slug=…
 *     → { ok, config, overrides, defaults, source, updatedAt[, yalcError] }
 *       `config` = efectiva (defaults + overrides) — lo que pinta Settings y
 *       consume la calc. `source` = 'yalc' | 'defaults' (Yalc caído ⇒
 *       degrada a defaults y se reporta `yalcError`).
 *
 *   PUT /api/yalc/model-config?slug=…
 *     Body: partial de overrides (deep-merge en Yalc; arrays reemplazan;
 *     null borra la clave) o { overrides, reset }. → mismo shape que el GET.
 */

function serialize(effective: EffectiveModelConfig) {
  return {
    ok: true,
    config: effective.config,
    overrides: effective.overrides,
    defaults: defaultModelConfig(),
    source: effective.source,
    updatedAt: effective.updatedAt,
    ...(effective.yalcError ? { yalcError: effective.yalcError } : {}),
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    // Nunca 502: sin Yalc la efectiva degrada a defaults (source: 'defaults').
    return res.status(200).json(serialize(await getEffectiveModelConfig(slug)));
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const hasWrapper = "overrides" in body || "reset" in body;
  const partial = hasWrapper ? body.overrides ?? {} : body;
  const reset = hasWrapper && body.reset === true;

  try {
    const effective = await putModelConfigOverrides(slug, partial, { reset });
    return res.status(200).json(serialize(effective));
  } catch (err) {
    if (err instanceof ModelConfigValidationError) {
      return res.status(400).json({ error: err.message });
    }
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
