/**
 * MC Chat account resolution — pure helpers (no openclaw SDK import).
 *
 * Kept dependency-free (like context-pack.js) so it is unit-testable without the
 * openclaw plugin SDK present.
 */

export const CHANNEL_KEY = "mc-chat";
export const DEFAULT_ACCOUNT_ID = "default";

// mc-chat delivers bot replies to `${mcServerUrl}/api/chat/webhook`, a route that
// ONLY exists on the Next.js app (:3000), never the legacy mc-server.js (:18790).
// Default to Next so a fresh install delivers without manual config. (SAN-333)
const DEFAULT_MC_SERVER_URL = "http://localhost:3000";

/**
 * Resolve account config from openclaw.json channels.mc-chat
 * Must be resilient to missing config — return safe defaults.
 */
export function resolveAccount(cfg, accountId) {
  const section = cfg?.channels?.[CHANNEL_KEY];
  if (!section) {
    return {
      accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      mcServerUrl: DEFAULT_MC_SERVER_URL,
      sharedSecret: "",
      allowFrom: [],
      dmPolicy: "allowlist",
    };
  }
  return {
    accountId: accountId ?? DEFAULT_ACCOUNT_ID,
    mcServerUrl: section.mcServerUrl || DEFAULT_MC_SERVER_URL,
    sharedSecret: section.sharedSecret || "",
    allowFrom: section.allowFrom || [],
    dmPolicy: section.dmSecurity || "allowlist",
  };
}

/**
 * Check if the channel has config present.
 */
export function isConfigured(cfg) {
  const section = cfg?.channels?.[CHANNEL_KEY];
  return Boolean(section?.mcServerUrl);
}
