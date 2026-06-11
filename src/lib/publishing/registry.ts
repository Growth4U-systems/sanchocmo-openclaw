import { metricoolProvider } from "@/lib/publishing/providers/metricool";
import { alarifeProvider } from "@/lib/publishing/providers/alarife";
import { wordpressProvider } from "@/lib/publishing/providers/wordpress";
import { readJSON } from "@/lib/data/json-io";
import { integrationsFile } from "@/lib/data/paths";
import type { Channel, ProviderInfo, PublishProvider } from "@/lib/publishing/types";

/**
 * Add new providers here. The registry order is the UI's preference order:
 * the first configured + channel-supporting provider wins as auto-selected.
 * Alarife goes before WordPress: it's our own platform, so it's the default
 * blog publisher when both are configured.
 */
const ALL_PROVIDERS: PublishProvider[] = [metricoolProvider, alarifeProvider, wordpressProvider];

interface IntegrationEntry {
  status?: string;
  lastError?: string | null;
}

interface IntegrationsData {
  dataSources?: Record<string, IntegrationEntry>;
  systemOverrides?: Record<string, IntegrationEntry>;
}

export function getProvider(id: string): PublishProvider | null {
  return ALL_PROVIDERS.find((p) => p.id === id) ?? null;
}

/**
 * Combined "can we publish through this provider right now?" check:
 *  1. `provider.inspect(slug)` confirms env vars + parseable config exist.
 *  2. If creds look present, we still trust the persisted result of the last
 *     "Conectar y testear". `integrations.json.status === "error"` means
 *     Metricool (or whoever) actively rejected the token, so a publish call
 *     would also fail — surface that as not-configured with the real error
 *     instead of a green light that breaks at runtime.
 *
 * `pending`, `connected`, or missing status all mean "no negative signal";
 * we stay optimistic so a brand-new test isn't gated by a stale flag.
 */
export function getProviderConfigStatus(
  slug: string,
  provider: PublishProvider,
): { configured: boolean; missing?: string } {
  const insp = provider.inspect(slug);
  if (!insp.configured) return insp;

  const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
  const entry =
    integrations.dataSources?.[provider.id] ||
    integrations.systemOverrides?.[provider.id];
  if (entry?.status === "error") {
    return {
      configured: false,
      missing:
        entry.lastError ||
        "La última prueba falló. Re-testea la conexión en Ajustes → APIs.",
    };
  }
  return { configured: true };
}

export function getAvailableProviders(slug: string, channel?: Channel): ProviderInfo[] {
  return ALL_PROVIDERS
    .filter((p) => !channel || p.supportedChannels.includes(channel))
    .map((p) => {
      const status = getProviderConfigStatus(slug, p);
      return {
        id: p.id,
        name: p.name,
        supportedChannels: p.supportedChannels,
        capabilities: p.capabilities,
        configured: status.configured,
        missing: status.missing,
      };
    });
}
