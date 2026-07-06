/**
 * Pure helpers for the global Anthropic auth route (subscription/OAuth ↔ API key).
 *
 * Dependency-free (no fs / CLI / `@/` imports) so the profile-transform logic is
 * unit-testable under `tsx --test`. The side-effecting switch (writing
 * openclaw.json + agent stores + .env, restarting the gateway) lives in
 * openclaw-config.ts and consumes these.
 */

export type AnthropicAuthRoute = "subscription" | "api";

/** openclaw.json + per-agent store profile ids for each route. */
export const ANTHROPIC_OAUTH_PROFILE = "anthropic:claude-cli";
export const ANTHROPIC_API_PROFILE = "anthropic:default";

interface AuthProfileShape {
  provider?: string;
  mode?: string;
  type?: string;
  [k: string]: unknown;
}

/**
 * True when `profile` is an Anthropic credential of the requested route — the
 * kind we strip when switching to the other one. Profiles spell the auth kind as
 * `mode` (openclaw.json) or `type` (per-agent stores), so both are checked.
 */
export function isAnthropicProfileForRoute(profile: unknown, wantSubscription: boolean): boolean {
  if (!profile || typeof profile !== "object") return false;
  const p = profile as AuthProfileShape;
  const kind = p.mode || p.type;
  if (wantSubscription) return p.provider === "claude-cli" || kind === "oauth";
  return p.provider === "anthropic" && (kind === "token" || kind === "apiKey");
}

/**
 * Pure transform of an auth-profiles map for the target route: strips the
 * opposite-route Anthropic profile(s) and installs the target one, leaving
 * non-Anthropic profiles untouched. `field` is "mode" for openclaw.json,
 * "type" for per-agent stores.
 */
export function applyAnthropicRouteToProfiles(
  current: Record<string, unknown>,
  route: AnthropicAuthRoute,
  field: "mode" | "type" = "mode",
): Record<string, unknown> {
  const sub = route === "subscription";
  const next: Record<string, unknown> = { ...current };
  const dropId = sub ? ANTHROPIC_API_PROFILE : ANTHROPIC_OAUTH_PROFILE;
  for (const [id, profile] of Object.entries(next)) {
    if (id === dropId || isAnthropicProfileForRoute(profile, !sub)) delete next[id];
  }
  next[sub ? ANTHROPIC_OAUTH_PROFILE : ANTHROPIC_API_PROFILE] = sub
    ? { provider: "claude-cli", [field]: "oauth" }
    : { provider: "anthropic", [field]: "token" };
  return next;
}
