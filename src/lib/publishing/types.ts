import type { MediaAsset, PostMetricsSnapshot } from "@/lib/data/drafts";

/**
 * Uniform interface every publishing provider must implement. The UI never
 * talks to a provider directly — it goes through the registry, which selects
 * a provider based on what the brand has configured.
 *
 * Adding a new provider (Buffer, Ayrshare, LinkedIn-native, ...) means
 * dropping a new file in `src/lib/publishing/providers/` and registering it
 * in `registry.ts`. No UI changes required.
 */

export type Channel =
  | "linkedin"
  | "twitter"
  | "x"
  | "instagram"
  | "blog"
  | "email"
  | "youtube"
  | "tiktok";

export interface ProviderCapabilities {
  publishNow: boolean;
  schedule: boolean;
  media: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  supportedChannels: Channel[];
  capabilities: ProviderCapabilities;
  configured: boolean;
  /** Human-readable hint when not configured (e.g. "Falta API_TOKEN"). */
  missing?: string;
}

export interface PublishInput {
  slug: string;
  draft: {
    ideaId: string;
    channel: Channel;
    body: string;
  };
  media: MediaAsset[];
  schedule?: { publishAt: string };  // ISO; absent = publish now
  /**
   * SAN-162 — provider-specific account/profile selector for multi-account
   * publishing (Metricool: the voice's `metricool_profile_id` / blogId).
   * Absent = the provider's default account.
   */
  accountId?: string;
}

export interface PublishResult {
  ok: boolean;
  externalJobId?: string;
  externalUrl?: string;
  scheduledAt?: string;
  publishedAt?: string;
  error?: string;
}

export type PublishStatusKind = "scheduled" | "publishing" | "published" | "failed" | "canceled";

export interface PublishStatus {
  status: PublishStatusKind;
  externalUrl?: string | null;
  publishedAt?: string | null;
  error?: string | null;
}

export interface PostMetricsQuery {
  /** Channel name as we use it (linkedin, twitter, x, instagram, ...). */
  channel: string;
  /** Public post URL captured at publish time. Primary match key. */
  externalUrl: string;
  /** When the post went live; helps narrow the analytics range. ISO 8601. */
  publishedAt?: string | null;
}

export interface PublishProvider {
  id: string;
  name: string;
  supportedChannels: Channel[];
  capabilities: ProviderCapabilities;

  /** Returns `{ configured: true }` if the brand has the credentials this
   *  provider needs. The `missing` string surfaces a human hint when not. */
  inspect(slug: string): { configured: boolean; missing?: string };

  publish(input: PublishInput): Promise<PublishResult>;

  /** Optional: providers that don't expose status polling can omit this and
   *  the UI will only know what `publish()` returned. */
  getStatus?(slug: string, externalJobId: string): Promise<PublishStatus>;

  /** Optional: cancel a scheduled post. */
  cancel?(slug: string, externalJobId: string): Promise<{ ok: boolean; error?: string }>;

  /** Optional: refresh engagement metrics for a batch of published posts.
   *  Returns one snapshot per input matched by external URL. Providers
   *  without analytics support can omit this. Called daily by the cron. */
  fetchPostMetrics?(
    slug: string,
    inputs: PostMetricsQuery[],
  ): Promise<Map<string, PostMetricsSnapshot>>;
}
