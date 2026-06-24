import type { CatalogProvider, ProviderAuthRoute } from "@/hooks/useModels";

/**
 * Shared, pure display helpers for runtime/engine provider auth.
 *
 * These describe the auth route reported by OpenClaw (`openclaw infer model auth
 * status`) — subscription vs API key vs env — and mask secret-looking labels so
 * the full key never reaches the UI. Used by the Models panel and the
 * Runtime/Motor section of the APIs panel.
 */

export function routeLabel(route: ProviderAuthRoute | undefined): string {
  if (route === undefined) return "cargando";
  if (route === "subscription") return "suscripción";
  if (route === "api") return "API key";
  if (route === "env") return "env key";
  return "sin auth";
}

export function routeClass(
  route: ProviderAuthRoute | undefined,
  configured = route !== "missing",
): string {
  if (route === undefined) return "bg-muted text-muted-foreground";
  if (!configured || route === "missing") return "bg-muted text-muted-foreground";
  if (route === "subscription") return "bg-sage/20 text-sage";
  if (route === "api") return "bg-rust/10 text-rust";
  if (route === "env") return "bg-blue-500/10 text-blue-700";
  return "bg-muted text-muted-foreground";
}

export function effectiveRoute(
  provider: CatalogProvider | undefined,
): ProviderAuthRoute | undefined {
  if (!provider) return undefined;
  if (!provider.auth) return provider.configured ? "api" : "missing";
  return provider.auth.effective !== "missing" ? provider.auth.effective : provider.auth.preferred;
}

export function providerDisplayName(providerId: string): string {
  if (providerId === "anthropic") return "Anthropic";
  if (providerId === "codex") return "Codex";
  if (providerId === "openai-codex") return "OpenAI Codex";
  if (providerId === "openrouter") return "OpenRouter";
  if (providerId === "fireworks") return "Fireworks";
  if (providerId === "openai") return "OpenAI";
  if (providerId === "google") return "Gemini";
  if (providerId === "xai") return "xAI (Grok)";
  return providerId;
}

export function connectionLabel(
  route: ProviderAuthRoute | undefined,
  configured: boolean,
): string {
  if (!configured || !route || route === "missing") return "Sin auth";
  if (route === "subscription") return "Conectado por suscripción";
  if (route === "api") return "Conectado por API key";
  if (route === "env") return "Conectado por env";
  return "Sin auth";
}

export function connectionClass(
  route: ProviderAuthRoute | undefined,
  configured: boolean,
): string {
  if (!configured || !route || route === "missing") return "bg-muted text-muted-foreground";
  if (route === "subscription") return "bg-sage/20 text-sage";
  if (route === "api") return "bg-rust/10 text-rust";
  if (route === "env") return "bg-blue-500/10 text-blue-700";
  return "bg-muted text-muted-foreground";
}

/** Mask secret-looking key fragments so the full value never reaches the UI. */
export function maskAuthLabel(label: string): string {
  return label
    .replace(/sk-ant-api[\w-]*/gi, (value) => `${value.slice(0, 12)}...${value.slice(-4)}`)
    .replace(/sk-ant-o[\w-]*/gi, (value) => `${value.slice(0, 10)}...${value.slice(-4)}`)
    .replace(/sk-or-v1[\w-]*/gi, (value) => `${value.slice(0, 11)}...${value.slice(-4)}`)
    .replace(/fw-[\w-]{12,}/gi, (value) => `${value.slice(0, 7)}...${value.slice(-4)}`)
    .replace(/sk-[\w-]{16,}/gi, (value) => `${value.slice(0, 7)}...${value.slice(-4)}`);
}
