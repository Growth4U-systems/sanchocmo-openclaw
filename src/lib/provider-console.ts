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
  /** Stable row id, also used for console lookup + the engine radio group. */
  key: string;
  /** api-catalog id used by the "Key sistema" flow (`/api/env`) + gateway restart. */
  apiId: string;
  /** model-catalog provider ids whose auth/route describes this engine provider. */
  catalogIds: string[];
  name: string;
  icon: string;
  /** Preferred engine model when this provider is chosen as the primary motor. */
  preferredModels: string[];
}

/**
 * The five providers the gateway authenticates (mirrors `GATEWAY_ENV_SERVICES`
 * in ApisConnectorsPanel). Codex is OpenAI's subscription route, so it maps onto
 * the OpenAI api-catalog id for the "Key sistema" / console family.
 */
export const RUNTIME_PROVIDERS: RuntimeProvider[] = [
  {
    key: "anthropic",
    apiId: "anthropic",
    catalogIds: ["anthropic"],
    name: "Anthropic",
    icon: "🧠",
    preferredModels: ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6", "anthropic/claude-sonnet-4-6"],
  },
  {
    key: "codex",
    apiId: "openai",
    catalogIds: ["codex", "openai-codex", "openai"],
    name: "OpenAI Codex",
    icon: "⚙️",
    preferredModels: ["codex/gpt-5.4", "codex/gpt-5.4-mini", "openai-codex/gpt-5.3-codex"],
  },
  {
    key: "openrouter",
    apiId: "openrouter",
    catalogIds: ["openrouter"],
    name: "OpenRouter",
    icon: "🔀",
    preferredModels: ["openrouter/openai/gpt-5.5"],
  },
  {
    key: "google",
    apiId: "gemini",
    catalogIds: ["google"],
    name: "Gemini",
    icon: "✨",
    preferredModels: ["google/gemini-2.5-flash"],
  },
  {
    key: "xai",
    apiId: "xai",
    catalogIds: ["xai"],
    name: "xAI (Grok)",
    icon: "𝕏",
    preferredModels: [],
  },
];

/** Normalize a provider id (catalog id, api id, or error-detail provider) to a console family. */
function consoleFamily(providerId: string): string {
  const id = providerId.toLowerCase();
  if (id === "anthropic" || id === "claude-cli" || id.startsWith("claude")) return "anthropic";
  if (id === "openai" || id === "codex" || id === "openai-codex") return "openai";
  if (id === "openrouter") return "openrouter";
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
