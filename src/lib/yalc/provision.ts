import { loadClient } from "../data/clients";
import { resolveYalcConfig, yalcFetch } from "./client";

export interface ProvisionBrainOpts {
  website?: string;
  icpSummary?: string;
  docs?: string | string[];
  autoCommit?: boolean;
  force?: boolean;
}

export interface ProvisionBrainResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Provision a brand's YALC brain over HTTP — no CLI in the container.
 *
 * Resolves the brand's website from clients.json when not passed, then calls
 * YALC's headless `POST /api/setup/provision` scoped to the brand tenant
 * (?tenant=<slug> is added by yalcFetch). YALC synthesizes + commits the brain.
 * Idempotent and safe to call repeatedly (re-sync). Returns `{ ok:false,
 * skipped:true }` when there's nothing to seed from (no website/context yet).
 */
export async function provisionYalcBrain(
  slug: string,
  opts: ProvisionBrainOpts = {},
): Promise<ProvisionBrainResult> {
  const client = loadClient(slug) as { url?: string } | undefined;
  const website = (opts.website ?? client?.url) || undefined;

  if (!website && !opts.icpSummary && !opts.docs) {
    return {
      ok: false,
      skipped: true,
      reason: "no_inputs",
      message: `No website/context to seed the YALC brain for "${slug}". Add a URL or pass context.`,
    };
  }

  const config = resolveYalcConfig(slug);
  return yalcFetch<ProvisionBrainResult>(config, "/api/setup/provision", {
    method: "POST",
    body: {
      website,
      icpSummary: opts.icpSummary,
      docs: opts.docs,
      autoCommit: opts.autoCommit ?? true,
      force: opts.force,
    },
  });
}
