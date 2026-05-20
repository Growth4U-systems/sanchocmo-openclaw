import fs from "fs";
import path from "path";
import { execSync } from "child_process";
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
import { BASE, brandDir, EXEC_PATH, mcDataFile } from "@/lib/data/paths";
import { cronJobsFile } from "@/lib/data/openclaw-paths";

const ARCHIVE_ROOT = path.join(BASE, "brand", "_archived");
const COSTS_DAILY_PATH = path.join(BASE, "costs-daily.json");
const COSTS_GLOBAL_PATH = path.join(BASE, "costs-global.json");

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

  // Defensive: if BASE is a git repo and `brand/<slug>/` was somehow tracked
  // (regression from earlier history), drop it from the index. Without this,
  // a future `git checkout` would restore the folder from HEAD even though
  // we just archived it. Idempotent: --ignore-unmatch skips silently when
  // nothing is tracked.
  try {
    execSync(`git -C "${BASE}" rm -r --cached --ignore-unmatch -q "brand/${slug}"`, {
      timeout: 5000,
      stdio: "pipe",
    });
  } catch {
    // BASE not a git repo, or git binary unavailable — fine.
  }

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

export interface ArchiveClientSystemFilesResult {
  mcData: { entriesRemoved: number; clientsRemoved: number } | null;
  costsDaily: { daysAffected: number } | null;
  costsGlobal: { removed: boolean } | null;
  extractPath?: string;
}

/**
 * Clean up slug-tagged entries from system-wide shared files. These live
 * OUTSIDE `brand/<slug>/` and were leaking into the recreated client (activity
 * bar, dashboard stats, costs panel) because they're keyed by `client: <slug>`
 * inside aggregated files, not by folder name.
 *
 * Files touched:
 *  - mc-data.js — strips `activity[]` entries with `client === slug` and any
 *    `clients[]` row with matching slug. (Regenerate.py rebuilds this from
 *    scratch periodically; manual cleanup just shortens the window where the
 *    UI shows stale events.)
 *  - costs-daily.json — drops `days.<date>.clients.<slug>` everywhere.
 *  - costs-global.json — drops `clients.<slug>`.
 *
 * Removed entries are dumped to `<archiveDir>/_system-extract.json` so the
 * data is recoverable along with the brand folder snapshot.
 *
 * Idempotent: re-runs find nothing to remove and become no-ops.
 */
export function archiveClientSystemFiles(
  slug: string,
  archiveDir: string,
): ArchiveClientSystemFilesResult {
  const extract: Record<string, unknown> = {};
  const result: ArchiveClientSystemFilesResult = {
    mcData: null,
    costsDaily: null,
    costsGlobal: null,
  };

  const mcPath = mcDataFile();
  if (fs.existsSync(mcPath)) {
    const raw = fs.readFileSync(mcPath, "utf-8");
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

        const activity = Array.isArray(data.activity) ? (data.activity as Array<{ client?: string }>) : [];
        const removedActivity = activity.filter((e) => e.client === slug);
        const remainingActivity = activity.filter((e) => e.client !== slug);

        const clientsList = Array.isArray(data.clients) ? (data.clients as Array<{ slug?: string }>) : [];
        const removedClients = clientsList.filter((c) => c.slug === slug);
        const remainingClients = clientsList.filter((c) => c.slug !== slug);

        if (removedActivity.length > 0 || removedClients.length > 0) {
          data.activity = remainingActivity;
          data.clients = remainingClients;

          extract.mcData = { activity: removedActivity, clients: removedClients };

          const prefix = raw.slice(0, jsonStart);
          const suffix = raw.slice(jsonEnd + 1);
          const newContent = prefix + JSON.stringify(data, null, 2) + suffix;
          const tmpPath = `${mcPath}.tmp`;
          fs.writeFileSync(tmpPath, newContent);
          fs.renameSync(tmpPath, mcPath);

          result.mcData = {
            entriesRemoved: removedActivity.length,
            clientsRemoved: removedClients.length,
          };
        }
      } catch {
        // Malformed mc-data.js — skip rather than corrupting it further.
      }
    }
  }

  if (fs.existsSync(COSTS_DAILY_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(COSTS_DAILY_PATH, "utf-8")) as Record<string, unknown>;
      const days = (data.days || {}) as Record<string, { clients?: Record<string, unknown> }>;
      const removed: Record<string, unknown> = {};
      let affected = 0;
      for (const [date, day] of Object.entries(days)) {
        if (day.clients && slug in day.clients) {
          removed[date] = day.clients[slug];
          delete day.clients[slug];
          affected++;
        }
      }
      if (affected > 0) {
        extract.costsDaily = removed;
        fs.writeFileSync(COSTS_DAILY_PATH, JSON.stringify(data, null, 2));
        result.costsDaily = { daysAffected: affected };
      }
    } catch {
      // Skip on parse error.
    }
  }

  if (fs.existsSync(COSTS_GLOBAL_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(COSTS_GLOBAL_PATH, "utf-8")) as Record<string, unknown>;
      const clients = (data.clients || {}) as Record<string, unknown>;
      if (slug in clients) {
        extract.costsGlobal = clients[slug];
        delete clients[slug];
        fs.writeFileSync(COSTS_GLOBAL_PATH, JSON.stringify(data, null, 2));
        result.costsGlobal = { removed: true };
      }
    } catch {
      // Skip on parse error.
    }
  }

  if (Object.keys(extract).length > 0) {
    fs.mkdirSync(archiveDir, { recursive: true });
    const extractPath = path.join(archiveDir, "_system-extract.json");
    fs.writeFileSync(extractPath, JSON.stringify(extract, null, 2));
    result.extractPath = extractPath;
  }

  return result;
}

export interface DisableClientCronsResult {
  disabled: Array<{ id: string; name: string }>;
  errors: Array<{ id: string; error: string }>;
}

interface CronJobLike {
  id: string;
  name?: string;
  payload?: { message?: string };
}

function cronReferencesSlug(job: CronJobLike, slug: string, name?: string): boolean {
  const prompt = job.payload?.message || "";
  if (prompt.includes(`brand/${slug}`)) return true;
  const lowerCronName = (job.name || "").toLowerCase();
  if (lowerCronName.includes(slug.toLowerCase())) return true;
  if (name && lowerCronName.includes(name.toLowerCase())) return true;
  return false;
}

/**
 * Disable OpenClaw cron jobs that reference a deleted client slug.
 *
 * Why: crons created during client onboarding (news monitor, competitor
 * monitor, manual-metrics reminder, etc.) stay registered after the client
 * is deleted. They keep firing on schedule and write fresh output to
 * `brand/<slug>/recurring-tasks/<folder>/<date>.json` — which shows up on
 * the recreated client's activity page as resurrected history.
 *
 * Detection mirrors `extractSlugFromCron` in cron-runs.ts:
 *  1. The cron's prompt mentions `brand/<slug>` (most reliable).
 *  2. The cron's name contains the slug or the client's display name.
 *
 * Side effect: invokes `openclaw cron disable <id>` per match. Failures
 * are captured and returned, not thrown — the delete flow continues so
 * downstream cleanup steps run.
 */
export function disableClientCrons(slug: string, name?: string): DisableClientCronsResult {
  const jobsPath = cronJobsFile();
  const result: DisableClientCronsResult = { disabled: [], errors: [] };

  if (!fs.existsSync(jobsPath)) return result;

  let jobs: CronJobLike[] = [];
  try {
    const data = JSON.parse(fs.readFileSync(jobsPath, "utf-8")) as { jobs?: CronJobLike[] };
    jobs = data.jobs || [];
  } catch {
    return result;
  }

  for (const job of jobs) {
    if (!cronReferencesSlug(job, slug, name)) continue;
    try {
      execSync(`openclaw cron disable ${job.id}`, {
        timeout: 5000,
        stdio: "pipe",
        env: { ...process.env, PATH: EXEC_PATH },
      });
      result.disabled.push({ id: job.id, name: job.name || "" });
    } catch (e) {
      result.errors.push({
        id: job.id,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
    }
  }

  return result;
}
