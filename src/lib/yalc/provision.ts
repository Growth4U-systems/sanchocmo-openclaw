import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadClient } from "../data/clients";
import { BASE, foundationStateFile } from "../data/paths";
import { resolveYalcConfig, yalcFetch } from "./client";

export interface ProvisionBrainOpts {
  website?: string;
  icpSummary?: string;
  docs?: string | string[];
  voice?: string;
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
 * Where the Sancho brand workspace is mounted inside the YALC container
 * (read-only bind in docker-compose.yalc.yml). Doc paths sent to YALC's
 * provision endpoint must use this prefix — YALC reads them, not Sancho.
 */
export const YALC_BRAND_MOUNT = process.env.YALC_BRAND_MOUNT || "/sancho-brands";

const APPROVED_STATUSES = new Set(["approved", "completed", "done"]);

export interface FoundationDocs {
  docs: string[];
  voice?: string;
}

interface FoundationPillar {
  status?: string;
  output_file?: string;
}

/**
 * Collect the approved Foundation pillars of a brand as YALC-readable doc
 * paths. Reads foundation-state.json (the DAG state Sancho already keeps per
 * brand), keeps only pillars with an approved-equivalent status whose output
 * file exists on disk, and translates workspace paths to the YALC container
 * mount. Brand-voice pillars are returned separately: YALC's synthesis treats
 * voice samples as their own input, not as a generic doc.
 */
export function collectFoundationDocs(slug: string): FoundationDocs {
  const result: FoundationDocs = { docs: [] };

  let state: unknown;
  try {
    state = JSON.parse(readFileSync(foundationStateFile(slug), "utf-8"));
  } catch {
    return result;
  }

  const sections =
    state && typeof state === "object"
      ? (((state as Record<string, unknown>).sections as Record<string, unknown>) ?? {})
      : {};

  const seen = new Set<string>();
  for (const section of Object.values(sections)) {
    if (!section || typeof section !== "object") continue;
    const pillars = ((section as Record<string, unknown>).pillars ?? {}) as Record<
      string,
      FoundationPillar
    >;
    for (const [pillarName, pillar] of Object.entries(pillars)) {
      if (!pillar || !APPROVED_STATUSES.has(String(pillar.status))) continue;
      const file = pillar.output_file;
      if (typeof file !== "string" || !file) continue;

      // output_file is workspace-relative ("brand/<slug>/..."); verify it
      // exists locally before advertising it to YALC.
      const rel = file.replace(/^brand\//, "");
      const localPath = path.join(BASE, "brand", rel);
      if (!existsSync(localPath)) continue;

      const mounted = `${YALC_BRAND_MOUNT}/${rel}`;
      if (seen.has(mounted)) continue;
      seen.add(mounted);

      const isVoice = pillarName.includes("brand-voice") || /\bbrand-voice\//.test(file);
      if (isVoice) {
        result.voice = result.voice ?? mounted;
      } else {
        result.docs.push(mounted);
      }
    }
  }

  return result;
}

/**
 * Provision a brand's YALC brain over HTTP — no CLI in the container.
 *
 * Resolves the brand's website from clients.json when not passed, and unless
 * the caller provides explicit docs, gathers the brand's approved Foundation
 * pillars (via collectFoundationDocs) so the brain is synthesized from
 * human-approved doctrine rather than just a homepage scrape. Calls YALC's
 * headless `POST /api/setup/provision` scoped to the brand tenant
 * (?tenant=<slug> is added by yalcFetch). Idempotent and safe to call
 * repeatedly (re-sync). Returns `{ ok:false, skipped:true }` when there's
 * nothing to seed from.
 */
export async function provisionYalcBrain(
  slug: string,
  opts: ProvisionBrainOpts = {},
): Promise<ProvisionBrainResult> {
  const client = loadClient(slug) as { url?: string } | undefined;
  const website = (opts.website ?? client?.url) || undefined;

  const foundation = opts.docs ? { docs: [] as string[] } : collectFoundationDocs(slug);
  const docs = opts.docs ?? (foundation.docs.length ? foundation.docs : undefined);
  const voice = opts.voice ?? ("voice" in foundation ? foundation.voice : undefined);

  if (!website && !opts.icpSummary && !docs && !voice) {
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
      docs,
      voice,
      autoCommit: opts.autoCommit ?? true,
      force: opts.force,
    },
  });
}
