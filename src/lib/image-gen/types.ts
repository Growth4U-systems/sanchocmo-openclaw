/**
 * Image-generation provider abstraction. Mirrors `lib/publishing/` so the UI
 * can detect what's configured for a brand and let the user pick — or use a
 * brand-level default from `brand/{slug}/content/config.json`.
 *
 * Adding a provider: drop a file in `providers/` and register in `registry.ts`.
 */

export interface ImageModel {
  id: string;            // canonical id passed to the provider
  label: string;         // shown in UI dropdowns
  default?: boolean;     // first model marked default is the auto-pick
}

export interface ProviderCapabilities {
  /** Which aspect ratios the provider accepts. UI uses this to filter the
   *  ratio dropdown. Empty = ratio is folded into the prompt. */
  aspectRatios: string[];
}

export interface ImageProviderInfo {
  id: string;
  name: string;
  models: ImageModel[];
  capabilities: ProviderCapabilities;
  configured: boolean;
  missing?: string;
}

export interface GenerateInput {
  slug: string;
  prompt: string;
  aspectRatio: string;
  model?: string;
}

export interface GenerateResult {
  ok: boolean;
  buffer?: Buffer;
  mimeType?: string;
  model?: string;
  error?: string;
}

export interface ImageProvider {
  id: string;
  name: string;
  models: ImageModel[];
  capabilities: ProviderCapabilities;
  inspect(slug: string): { configured: boolean; missing?: string };
  generate(input: GenerateInput): Promise<GenerateResult>;
}
