import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import {
  miDocumentImpacts,
  miInsights,
  miMeetingArtifacts,
  miMeetings,
  miRecommendations,
  miRuns,
  miSettings,
  miSources,
  povBanks,
  povClarifyPatterns,
  povEvidenceItems,
  povPillars,
  povUpdateProposals,
} from "@/db/schema";
import { BASE, brandDir } from "@/lib/data/paths";

const ARCHIVE_ROOT = path.join(BASE, "brand", "_archived");

export interface ArchiveBrandDirResult {
  archived: boolean;
  archivePath?: string;
}

/**
 * Move the brand/<slug> folder to brand/_archived/<slug>__<timestamp>/.
 * No-op if the source folder doesn't exist (idempotent retries).
 *
 * Why: the slug must be reusable for a fresh client. mkdirSync({recursive:true})
 * in createClientDirs silently adopts an existing folder, so leaving it in place
 * pollutes the next client with the previous one's data.
 */
export function archiveBrandDir(slug: string, timestamp: string): ArchiveBrandDirResult {
  const src = brandDir(slug);
  if (!fs.existsSync(src)) return { archived: false };

  fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
  const dest = path.join(ARCHIVE_ROOT, `${slug}__${timestamp}`);
  fs.renameSync(src, dest);
  return { archived: true, archivePath: dest };
}

export interface ArchiveClientNeonDataResult {
  configured: boolean;
  archivedSlug?: string;
  updated: Record<string, number>;
}

/**
 * Soft-archive all Neon rows keyed by this slug across POV Bank and Meeting
 * Intelligence tables: rename slug to `<slug>__archived_<ts>` (and id where
 * the id derives from the slug) so the active slug is freed for reuse while
 * the data stays recoverable. No-op when DATABASE_URL is unset.
 *
 * Why:
 *  - `pov_banks.id = povb_<slug>` and `pov_pillars.id = povp_<slug>_<pillarId>`
 *    embed the slug verbatim → a fresh client with the same slug would compute
 *    identical PKs and silently adopt the archived rows (onConflictDoNothing
 *    keeps the existing row). Suffixing the id frees the PK.
 *  - `mi_settings.id` and `mi_sources` (for the `manual_upload` row) hash from
 *    fixed components (`slug + "settings"`, `slug + "manual_upload"`) → same
 *    collision risk. Suffix their id too. Other mi_* ids include row-specific
 *    components (meeting/run ids, event dates) so they don't collide on
 *    recreate; renaming the slug column is enough.
 *
 * FK handling: pov_pillars/evidence/clarify/proposals all reference
 * pov_banks.id. We can't update pov_banks.id while children still point to
 * the old value (FK violation). The bank_id columns are nullable, so we null
 * them out, rename the parent, then restore each child's bank_id to the new
 * value (deterministic: `<old_bank_id>__archived_<ts>`).
 *
 * Restore: rename the slug suffix back (and the id suffix on the four
 * deterministic-id tables) while no live row holds the same slug.
 */
export async function archiveClientNeonData(
  slug: string,
  timestamp: string,
): Promise<ArchiveClientNeonDataResult> {
  if (!hasDatabase) return { configured: false, updated: {} };

  const database = getDb();
  const suffix = `__archived_${timestamp}`;
  const archivedSlug = `${slug}${suffix}`;
  const newBankId = `povb_${slug}${suffix}`;

  // neon-http does NOT support db.transaction() (throws at runtime). db.batch()
  // sends the queries as a single server-side transaction — we get atomicity
  // and intra-statement ordering (PG checks FK at each statement boundary, so
  // null-then-restore on bank_id works).
  //
  // Order rationale:
  //  1-4: NULL the bank_id FK on children → frees pov_banks.id to be renamed.
  //  5:   Rename pov_banks (id + slug).
  //  6:   Rename pov_pillars (id + slug, restore bank_id to new value).
  //  7-9: Rename remaining POV children (slug + bank_id restore).
  //  10-: Rename MI tables; suffix id on mi_settings/mi_sources (slug-derived),
  //       slug-only on the rest (ids are content-keyed via sha1).
  const labels = [
    "pov_pillars.null_fk",
    "pov_evidence_items.null_fk",
    "pov_clarify_patterns.null_fk",
    "pov_update_proposals.null_fk",
    "pov_banks",
    "pov_pillars",
    "pov_evidence_items",
    "pov_clarify_patterns",
    "pov_update_proposals",
    "mi_settings",
    "mi_sources",
    "mi_runs",
    "mi_meetings",
    "mi_meeting_artifacts",
    "mi_insights",
    "mi_document_impacts",
    "mi_recommendations",
  ] as const;

  const results = await database.batch([
    database.update(povPillars).set({ bankId: null }).where(eq(povPillars.slug, slug)),
    database.update(povEvidenceItems).set({ bankId: null }).where(eq(povEvidenceItems.slug, slug)),
    database.update(povClarifyPatterns).set({ bankId: null }).where(eq(povClarifyPatterns.slug, slug)),
    database.update(povUpdateProposals).set({ bankId: null }).where(eq(povUpdateProposals.slug, slug)),
    database
      .update(povBanks)
      .set({ id: newBankId, slug: archivedSlug })
      .where(eq(povBanks.slug, slug)),
    database
      .update(povPillars)
      .set({ bankId: newBankId, slug: archivedSlug, id: sql`${povPillars.id} || ${suffix}` })
      .where(eq(povPillars.slug, slug)),
    database
      .update(povEvidenceItems)
      .set({ bankId: newBankId, slug: archivedSlug })
      .where(eq(povEvidenceItems.slug, slug)),
    database
      .update(povClarifyPatterns)
      .set({ bankId: newBankId, slug: archivedSlug })
      .where(eq(povClarifyPatterns.slug, slug)),
    database
      .update(povUpdateProposals)
      .set({ bankId: newBankId, slug: archivedSlug })
      .where(eq(povUpdateProposals.slug, slug)),
    database
      .update(miSettings)
      .set({ slug: archivedSlug, id: sql`${miSettings.id} || ${suffix}` })
      .where(eq(miSettings.slug, slug)),
    database
      .update(miSources)
      .set({ slug: archivedSlug, id: sql`${miSources.id} || ${suffix}` })
      .where(eq(miSources.slug, slug)),
    database.update(miRuns).set({ slug: archivedSlug }).where(eq(miRuns.slug, slug)),
    database.update(miMeetings).set({ slug: archivedSlug }).where(eq(miMeetings.slug, slug)),
    database.update(miMeetingArtifacts).set({ slug: archivedSlug }).where(eq(miMeetingArtifacts.slug, slug)),
    database.update(miInsights).set({ slug: archivedSlug }).where(eq(miInsights.slug, slug)),
    database.update(miDocumentImpacts).set({ slug: archivedSlug }).where(eq(miDocumentImpacts.slug, slug)),
    database.update(miRecommendations).set({ slug: archivedSlug }).where(eq(miRecommendations.slug, slug)),
  ]);

  const updated: Record<string, number> = {};
  results.forEach((result, idx) => {
    const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
    if (rowCount > 0) updated[labels[idx]] = rowCount;
  });

  return { configured: true, archivedSlug, updated };
}
