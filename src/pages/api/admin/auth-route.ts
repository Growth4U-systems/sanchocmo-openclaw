import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { invalidateCatalogCache } from "@/lib/data/models-catalog";
import { getRuntime } from "@/lib/runtime";

type AnthropicAuthRoute = "subscription" | "api";

/**
 * POST /api/admin/auth-route — activate a global engine auth route.
 *
 * Body: { provider: "anthropic" | "openai", route: "subscription" | "api" }
 *
 * Only Anthropic supports a runtime route switch (subscription ↔ API key). The
 * credential is global (shared by all agents); the per-agent *model* is managed
 * separately in the Models tab. The model is intentionally NOT touched here.
 */
const ROUTES = new Set<AnthropicAuthRoute>(["subscription", "api"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "PUT") {
    res.setHeader("Allow", "POST, PATCH, PUT");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { provider, route } = (req.body || {}) as { provider?: string; route?: string };
  if (provider !== "anthropic" && provider !== "openai") {
    return res.status(400).json({ error: "Invalid or missing 'provider' (anthropic | openai)" });
  }
  if (!route || !ROUTES.has(route as AnthropicAuthRoute)) {
    return res.status(400).json({ error: "Invalid or missing 'route' (subscription | api)" });
  }

  // Codex/OpenAI runtime route-switch is not supported here: the subscription
  // session is paired through /api/admin/codex-auth, not flipped as a route.
  // OpenAI's only resolvable row here is its API key.
  if (provider === "openai") {
    return res.status(400).json({
      error:
        route === "subscription"
          ? "La suscripción de Codex se conecta desde «Conectar Codex» en Runtime/Motor; no es un cambio de ruta."
          : "OpenAI no cambia de ruta en runtime; gestiona su API key con «Key sistema».",
    });
  }

  // provider === "anthropic"
  if (route === "subscription" && !(await getRuntime().control.hasAnthropicSubscriptionToken())) {
    return res.status(409).json({
      error:
        "No hay token de suscripción. Pega el token OAuth (sk-ant-oat…) en «Key sistema» antes de activar la suscripción.",
    });
  }

  try {
    await getRuntime().control.setAnthropicAuthRoute(route as AnthropicAuthRoute);
    const restart = await getRuntime().lifecycle.restart() as {
      ok: boolean;
      error?: string;
    };
    invalidateCatalogCache();

    let warning: string | undefined;
    if (route === "api" && !(await getRuntime().control.hasAnthropicApiKey())) {
      warning =
        "Ruta API key activada, pero no hay ANTHROPIC_API_KEY cargada: el motor no responderá hasta cargarla.";
    }
    if (!restart.ok) {
      warning = `${warning ? warning + " " : ""}No se pudo reiniciar el gateway (${
        restart.error || "timeout"
      }); puede requerir restart/deploy para aplicar la ruta.`;
    }
    return res.status(200).json({ ok: true, provider, route, restarted: restart.ok, warning });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
