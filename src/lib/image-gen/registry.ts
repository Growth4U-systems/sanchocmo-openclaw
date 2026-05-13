import { nanobananaProvider } from "@/lib/image-gen/providers/nanobanana";
import { replicateProvider } from "@/lib/image-gen/providers/replicate";
import { falProvider } from "@/lib/image-gen/providers/fal";
import type { ImageProvider, ImageProviderInfo } from "@/lib/image-gen/types";

/**
 * Registry order is the UI's preference order: when nothing is fixed in the
 * brand's content-config and no `providerId` is sent, the first configured
 * provider wins as auto-pick.
 */
const ALL_PROVIDERS: ImageProvider[] = [
  nanobananaProvider,
  replicateProvider,
  falProvider,
];

export function getImageProvider(id: string): ImageProvider | null {
  return ALL_PROVIDERS.find((p) => p.id === id) ?? null;
}

export function getAvailableImageProviders(slug: string): ImageProviderInfo[] {
  return ALL_PROVIDERS.map((p) => {
    const insp = p.inspect(slug);
    return {
      id: p.id,
      name: p.name,
      models: p.models,
      capabilities: p.capabilities,
      configured: insp.configured,
      missing: insp.missing,
    };
  });
}
