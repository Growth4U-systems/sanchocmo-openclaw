import { metricoolProvider } from "@/lib/publishing/providers/metricool";
import type { Channel, ProviderInfo, PublishProvider } from "@/lib/publishing/types";

/**
 * Add new providers here. The registry order is the UI's preference order:
 * the first configured + channel-supporting provider wins as auto-selected.
 */
const ALL_PROVIDERS: PublishProvider[] = [metricoolProvider];

export function getProvider(id: string): PublishProvider | null {
  return ALL_PROVIDERS.find((p) => p.id === id) ?? null;
}

export function getAvailableProviders(slug: string, channel?: Channel): ProviderInfo[] {
  return ALL_PROVIDERS
    .filter((p) => !channel || p.supportedChannels.includes(channel))
    .map((p) => {
      const insp = p.inspect(slug);
      return {
        id: p.id,
        name: p.name,
        supportedChannels: p.supportedChannels,
        capabilities: p.capabilities,
        configured: insp.configured,
        missing: insp.missing,
      };
    });
}
