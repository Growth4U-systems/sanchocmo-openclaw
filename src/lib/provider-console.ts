import type { ProviderAuthRoute } from "@/hooks/useModels";

/**
 * Route-aware deep links to each engine provider's external console, plus the
 * canonical list of providers the chat/runtime (OpenClaw gateway) can run on.
 *
 * The gateway prefers a subscription/OAuth route when present and falls back to
 * the system API key (managed from the APIs panel, which restarts the gateway to
 * apply it). So the "right" console depends on the effective route: a Claude Max
 * subscription is managed at claude.ai, an Anthropic API key at console.anthropic.com.
 */

export interface RuntimeProvider {
  /** Stable, unique row id. Providers with a subscription appear as two rows
   * (one per route), so this is NOT the same as `apiId`. */
  key: string;
  /** api-catalog id used by the "Key sistema" flow (`/api/env`) + gateway restart.
   * Stable per provider — shared by the two route rows (e.g. both Anthropic rows
   * use `anthropic`). */
  apiId: string;
  /** model-catalog provider ids whose auth/route describes this engine provider.
   * The subscription and API rows point at different catalog ids when they
   * resolve to different auth state (Codex vs OpenAI). */
  catalogIds: string[];
  name: string;
  icon: string;
  /** The auth route this row represents. `undefined` = single-route provider
   * (API key only — no subscription exists), rendered as one row. */
  route?: "subscription" | "api";
  /** Whether this route can be activated from the UI at runtime. Anthropic: yes.
   * Codex subscription: no (its token is minted interactively over SSH and the
   * per-agent symlink-sync has no idempotent inverse) — shown read-only. */
  runtimeSwitchable?: boolean;
  /** For a subscription row whose token can be pasted: the env var it writes
   * (e.g. `ANTHROPIC_OAUTH_TOKEN`). Absent when the token isn't pasteable (Codex). */
  subscriptionTokenEnv?: string;
}

/**
 * The runtime/engine providers the gateway authenticates, as **auth-route rows**.
 * Providers with a subscription appear twice — one row per route (Suscripción /
 * API Key) — because the route is a global credential choice, not a model choice.
 * `apiId` stays stable per provider (shared by its two rows) so the "Key sistema"
 * flow (`/api/env`) + `GATEWAY_ENV_SERVICES` keep working. Providers without a
 * subscription (OpenRouter, Fireworks, Gemini, xAI) are a single API-key row.
 */
export const RUNTIME_PROVIDERS: RuntimeProvider[] = [
  // Anthropic — both routes fully functional (paste sk-ant-oat token / activate).
  {
    key: "anthropic",
    apiId: "anthropic",
    catalogIds: ["anthropic"],
    name: "Anthropic",
    icon: "🧠",
    route: "subscription",
    runtimeSwitchable: true,
    subscriptionTokenEnv: "ANTHROPIC_OAUTH_TOKEN",
  },
  {
    key: "anthropic-api",
    apiId: "anthropic",
    catalogIds: ["anthropic"],
    name: "Anthropic",
    icon: "🧠",
    route: "api",
    runtimeSwitchable: true,
  },
  // Codex (ChatGPT subscription) — informative only this iteration: its token is
  // minted interactively (`openclaw models auth login`) over SSH, not pasteable,
  // and the per-agent symlink-sync has no idempotent inverse, so no runtime flip.
  {
    key: "codex",
    apiId: "openai",
    catalogIds: ["codex", "openai-codex"],
    name: "Codex",
    icon: "⚙️",
    route: "subscription",
    runtimeSwitchable: false,
  },
  {
    key: "openai-api",
    apiId: "openai",
    catalogIds: ["openai"],
    name: "OpenAI",
    icon: "⚙️",
    route: "api",
    runtimeSwitchable: false,
  },
  {
    key: "openrouter",
    apiId: "openrouter",
    catalogIds: ["openrouter"],
    name: "OpenRouter",
    icon: "🔀",
  },
  {
    key: "fireworks",
    apiId: "fireworks",
    catalogIds: ["fireworks"],
    name: "Fireworks",
    icon: "🎆",
  },
  {
    key: "google",
    apiId: "gemini",
    catalogIds: ["google"],
    name: "Gemini",
    icon: "✨",
  },
  {
    key: "xai",
    apiId: "xai",
    catalogIds: ["xai"],
    name: "xAI (Grok)",
    icon: "𝕏",
  },
];

/** Normalize a provider id (catalog id, api id, or error-detail provider) to a console family. */
function consoleFamily(providerId: string): string {
  const id = providerId.toLowerCase();
  if (id === "anthropic" || id === "claude-cli" || id.startsWith("claude")) return "anthropic";
  if (id === "openai" || id === "codex" || id === "openai-codex") return "openai";
  if (id === "openrouter") return "openrouter";
  if (id === "fireworks") return "fireworks";
  if (id === "google" || id === "gemini") return "google";
  if (id === "xai" || id === "grok") return "xai";
  return id;
}

/**
 * The external console URL to manage/inspect this provider, chosen by the
 * effective auth route. Defaults to the subscription console (the gateway is
 * subscription-first) when the route is unknown. Returns null for unknown providers.
 */
export function consoleUrlFor(providerId: string, route?: ProviderAuthRoute): string | null {
  const family = consoleFamily(providerId);
  const isSub = route === undefined || route === "subscription";
  switch (family) {
    case "anthropic":
      return isSub
        ? "https://claude.ai/settings"
        : "https://console.anthropic.com/settings/keys";
    case "openai":
      return isSub ? "https://chatgpt.com" : "https://platform.openai.com/settings/organization/api-keys";
    case "openrouter":
      return "https://openrouter.ai/settings/keys";
    case "fireworks":
      return "https://fireworks.ai/api-keys";
    case "google":
      return "https://aistudio.google.com/app/apikey";
    case "xai":
      return "https://console.x.ai";
    default:
      return null;
  }
}

/** Short, human label for the console destination (for tooltips / link text). */
export function consoleLabelFor(providerId: string, route?: ProviderAuthRoute): string | null {
  const url = consoleUrlFor(providerId, route);
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
