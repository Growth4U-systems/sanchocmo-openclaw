/**
 * GET/PUT /api/content-engine/configs — Structured read/write of Content Engine configs
 *
 * GET ?slug=X → returns all configs as structured JSON. Triggers one-shot migration
 *               of legacy sources.json + reference-creators YAML into a flat
 *               profiles[] array on first call (with backup).
 * PUT { slug, configId, data } → writes structured data back.
 *
 * Schema for sources.json (v2):
 *   {
 *     "version": 2,
 *     "profiles": [{ id, type, name, parent_company_id?, role?, tier?,
 *                    platforms: {...}, pillars_relevant: [], metadata?: {} }],
 *     "updated_at": "..."
 *   }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE, competitorsSourcesFile } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

// ── helpers ────────────────────────────────────────────────────
function readYaml(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try { return yaml.load(fs.readFileSync(filePath, "utf-8")); } catch { return null; }
}

function writeYaml(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120, quotingType: '"', forceQuotes: false }));
}

function listPillarFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".yml")).sort();
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── profile types ──────────────────────────────────────────────
type ProfileType = "company" | "person";

interface Profile {
  id: string;
  type: ProfileType;
  name: string;
  parent_company_id?: string;
  parent_company_name?: string; // computed for UI convenience; not persisted
  role?: string;
  tier?: string;
  platforms: Record<string, string>;
  pillars_relevant: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

const PLATFORM_KEYS = [
  "web", "linkedin", "twitter", "instagram", "youtube",
  "newsletter", "podcast", "blog", "facebook", "tiktok",
] as const;

function cleanPlatforms(input: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMetadata(obj: any, excluded: string[]): Record<string, any> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (excluded.includes(k)) continue;
    meta[k] = v;
  }
  return Object.keys(meta).length ? meta : undefined;
}

// ── migration: legacy sources.json + creators YAML → profiles[] ─
function migrateToProfiles(slug: string, configDir: string): Profile[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourcesData = readJSON<any>(competitorsSourcesFile(slug), {});

  // Lookup: pillars_relevant by company slug (from legacy competitors yaml)
  const legacyPillars = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compYaml = readYaml(path.join(configDir, "competitors", "all-pillars.yml")) as any;
  const compYamlComps = compYaml?.competitors || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [...(compYamlComps.direct || []), ...(compYamlComps.indirect || [])].forEach((c: any) => {
    if (c.slug) legacyPillars.set(c.slug, c.pillars_relevant || []);
  });

  const profiles: Profile[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allComps: any[] = [
    ...((sourcesData.competitors?.direct) || []),
    ...((sourcesData.competitors?.indirect) || []),
  ];

  const COMPANY_EXCLUDE = ["name", "slug", "tier", "_type", "company", "founder", "founders", "founder_global", "head_spain", "pillars_relevant"];
  const PERSON_EXCLUDE = ["name", "role", "linkedin", "twitter", "instagram", "youtube", "web", "newsletter", "blog", "facebook", "tiktok", "_founder_kind"];

  for (const c of allComps) {
    const companyId = c.slug || slugify(c.name || "");
    if (!companyId) continue;
    const company = c.company || {};
    const companyPlatforms = cleanPlatforms({
      web: company.web || c.web,
      linkedin: company.linkedin || company.linkedin_company || c.linkedin_company,
      twitter: company.twitter,
      instagram: company.instagram,
      youtube: typeof company.youtube === "string" ? company.youtube : undefined,
      facebook: typeof company.facebook === "string" ? company.facebook : undefined,
      tiktok: company.tiktok,
    });
    const pillarsRelevant: string[] =
      (Array.isArray(c.pillars_relevant) ? c.pillars_relevant : null) ||
      legacyPillars.get(companyId) ||
      [];

    profiles.push({
      id: companyId,
      type: "company",
      name: c.name || "",
      tier: c.tier || undefined,
      platforms: companyPlatforms,
      pillars_relevant: pillarsRelevant,
      metadata: extractMetadata(c, COMPANY_EXCLUDE),
    });

    // Founders → person profiles, parent_company_id = companyId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const founders: any[] = [];
    if (Array.isArray(c.founders)) founders.push(...c.founders);
    if (c.founder) founders.push(c.founder);
    if (c.founder_global) founders.push({ ...c.founder_global, _founder_kind: "global" });
    if (c.head_spain) founders.push({ ...c.head_spain, _founder_kind: "head_spain" });

    for (const f of founders) {
      if (!f?.name) continue;
      profiles.push({
        id: `${companyId}__${slugify(f.name)}`,
        type: "person",
        name: f.name,
        parent_company_id: companyId,
        role: f.role || undefined,
        platforms: cleanPlatforms({
          linkedin: f.linkedin,
          twitter: f.twitter,
          instagram: f.instagram,
          youtube: typeof f.youtube === "string" ? f.youtube : undefined,
          web: f.web,
          newsletter: f.newsletter,
          blog: f.blog,
          podcast: typeof f.podcast === "string" ? f.podcast : undefined,
        }),
        pillars_relevant: pillarsRelevant,
        metadata: extractMetadata(f, PERSON_EXCLUDE),
      });
    }
  }

  // Reference creators → person profiles (no parent)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorsYaml = readYaml(path.join(configDir, "reference-creators", "all-pillars.yml")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creators: any[] = creatorsYaml?.reference_creators || [];
  for (const cr of creators) {
    if (!cr?.name) continue;
    profiles.push({
      id: `creator__${slugify(cr.name)}`,
      type: "person",
      name: cr.name,
      role: cr.focus || undefined,
      platforms: cleanPlatforms(cr.platforms || {}),
      pillars_relevant: cr.pillars_relevant || [],
    });
  }

  return profiles;
}

// Read sources.json, running migration if needed. Backs up the original.
function loadOrMigrateProfiles(slug: string, configDir: string): { profiles: Profile[]; migrated: boolean } {
  const sourcesPath = competitorsSourcesFile(slug);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = readJSON<any>(sourcesPath, null);

  if (data && data.version === 2 && Array.isArray(data.profiles)) {
    return { profiles: data.profiles as Profile[], migrated: false };
  }

  // Run migration
  const profiles = migrateToProfiles(slug, configDir);
  if (fs.existsSync(sourcesPath)) {
    const backupPath = sourcesPath + ".pre-migration.bak";
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(sourcesPath, backupPath);
    }
  }
  writeJSON(sourcesPath, {
    version: 2,
    profiles,
    updated_at: new Date().toISOString(),
  });
  return { profiles, migrated: true };
}

function saveProfiles(slug: string, profiles: Profile[]) {
  // Strip computed fields before persisting
  const persisted = profiles.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { parent_company_name, ...rest } = p;
    return rest;
  });
  writeJSON(competitorsSourcesFile(slug), {
    version: 2,
    profiles: persisted,
    updated_at: new Date().toISOString(),
  });
}

// ── handler ────────────────────────────────────────────────────
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const configDir = path.join(BASE, "brand", slug, "content", "configs");

  if (req.method === "GET") {
    const configs: Record<string, unknown> = {};

    // News prompts (per pillar)
    const newsDir = path.join(configDir, "news-prompts");
    configs.newsPrompts = listPillarFiles(newsDir).map((f) => {
      const data = readYaml(path.join(newsDir, f)) as Record<string, unknown> | null;
      return {
        file: f,
        pillarId: data?.pillar_id || f.replace(".yml", ""),
        pillarName: data?.pillar_name || "",
        prompt: (data?.prompt as string) || "",
        sector: (data?.sector as string) || "",
        language: (data?.language as string[]) || ["es", "en"],
      };
    });

    // PAA queries (per pillar)
    const paaDir = path.join(configDir, "paa-queries");
    configs.paaQueries = listPillarFiles(paaDir).map((f) => {
      const data = readYaml(path.join(paaDir, f)) as Record<string, unknown> | null;
      return {
        file: f,
        pillarId: data?.pillar_id || f.replace(".yml", ""),
        pillarName: data?.pillar_name || "",
        prompt: (data?.prompt as string) || "",
        language: (data?.language as string[]) || ["es", "en"],
      };
    });

    // Keywords seed (per pillar)
    const kwDir = path.join(configDir, "keywords-seed");
    configs.keywordsSeed = listPillarFiles(kwDir).map((f) => {
      const data = readYaml(path.join(kwDir, f)) as Record<string, unknown> | null;
      return {
        file: f,
        pillarId: data?.pillar_id || f.replace(".yml", ""),
        pillarName: data?.pillar_name || "",
        keywords: (data?.keywords_seed as string[]) || [],
        target: data?.target || "blog_seo_bofu_first",
        language: (data?.language as string[]) || ["es", "en"],
      };
    });

    // Monitored profiles (unified: companies + founders + creators)
    const { profiles } = loadOrMigrateProfiles(slug, configDir);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    configs.monitoredProfiles = profiles.map((p) => ({
      ...p,
      parent_company_name: p.parent_company_id ? byId.get(p.parent_company_id)?.name : undefined,
    }));

    // Setup task — find the "Setup configs" task across all projects
    // Convention: name includes "Setup configs" OR id ends with the well-known T03 in P14-Content-Engine.
    // Use the project.json's `id` (not the directory name) so URLs match the projects API.
    const projectsDir = path.join(BASE, "brand", slug, "projects");
    let setupTask: Record<string, unknown> | null = null;
    if (fs.existsSync(projectsDir)) {
      const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const projDir of projectDirs) {
        const tasksPath = path.join(projectsDir, projDir, "tasks.json");
        if (!fs.existsSync(tasksPath)) continue;
        try {
          const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")) as Record<string, unknown>[];
          const match = tasks.find((t) => {
            const name = String(t.name || "").toLowerCase();
            return name.includes("setup configs") || name.includes("content engine setup");
          });
          if (match) {
            // Resolve canonical project id from project.json (defaults to dir prefix)
            let resolvedProjectId = projDir.split("-")[0];
            try {
              const proj = JSON.parse(fs.readFileSync(path.join(projectsDir, projDir, "project.json"), "utf-8"));
              if (proj?.id) resolvedProjectId = String(proj.id);
            } catch { /* keep fallback */ }
            setupTask = {
              projectId: resolvedProjectId,
              taskId: match.id,
              taskName: match.name,
              skill: match.skill,
              status: match.status,
              deliverableFile: match.deliverable_file,
              chatThreadId: match.mc_chat_thread_id,
              updatedAt: match.updated_at || null,
            };
            break;
          }
        } catch { /* ignore */ }
      }
    }
    configs.setupTask = setupTask;

    // Cadence
    const cadenceFile = path.join(configDir, "cadence-config.yml");
    const cadenceData = readYaml(cadenceFile) as Record<string, unknown> | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channels = (cadenceData?.channels || {}) as Record<string, any>;
    configs.cadence = {
      businessModel: cadenceData?.business_model || "B2B",
      channels: Object.entries(channels).map(([key, ch]) => ({
        key,
        active: ch.active ?? false,
        frequency: ch.frequency || "",
        bestDays: ch.best_days || [],
        bestTimes: ch.best_times || [],
        gating: ch.gating || "ungated",
        contentTypes: ch.content_types || [],
        profiles: (ch.profiles || []).map((p: Record<string, unknown>) => ({
          name: p.name, handle: p.handle, role: p.role, postsPerWeek: p.posts_per_week,
        })),
      })),
    };

    return res.status(200).json({ ok: true, configs });
  }

  if (req.method === "PUT") {
    const { configId, data } = req.body;
    if (!configId || !data) return res.status(400).json({ error: "Missing configId or data" });

    if (configId.startsWith("news-prompts-")) {
      const pillarId = configId.replace("news-prompts-", "");
      writeYaml(path.join(configDir, "news-prompts", `${pillarId}.yml`), {
        pillar_id: data.pillarId, pillar_name: data.pillarName,
        prompt: data.prompt, sector: data.sector, language: data.language,
      });
    } else if (configId.startsWith("paa-queries-")) {
      const pillarId = configId.replace("paa-queries-", "");
      writeYaml(path.join(configDir, "paa-queries", `${pillarId}.yml`), {
        pillar_id: data.pillarId, pillar_name: data.pillarName,
        prompt: data.prompt, language: data.language,
      });
    } else if (configId.startsWith("keywords-seed-")) {
      const pillarId = configId.replace("keywords-seed-", "");
      writeYaml(path.join(configDir, "keywords-seed", `${pillarId}.yml`), {
        pillar_id: data.pillarId, pillar_name: data.pillarName,
        keywords_seed: data.keywords, target: data.target, language: data.language,
      });
    } else if (configId === "cadence") {
      // data: { businessModel, channels: CadenceChannel[] }
      // Read existing yaml to preserve top-level keys we don't expose (batch_workflow, rules, etc).
      const cadencePath = path.join(configDir, "cadence-config.yml");
      const existing = (readYaml(cadencePath) as Record<string, unknown>) || {};
      const channels: Record<string, unknown> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ch of (data.channels || []) as any[]) {
        if (!ch.key) continue;
        // Preserve any extra keys the form doesn't surface
        const existingCh = ((existing.channels as Record<string, Record<string, unknown>>) || {})[ch.key] || {};
        channels[ch.key] = {
          ...existingCh,
          active: !!ch.active,
          frequency: ch.frequency || "",
          best_days: Array.isArray(ch.bestDays) ? ch.bestDays : [],
          best_times: Array.isArray(ch.bestTimes) ? ch.bestTimes : [],
          gating: ch.gating || "ungated",
          content_types: Array.isArray(ch.contentTypes) ? ch.contentTypes : [],
          profiles: Array.isArray(ch.profiles)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? ch.profiles.map((p: any) => ({
                name: p.name || "",
                handle: p.handle || "",
                role: p.role || "",
                posts_per_week: typeof p.postsPerWeek === "number" ? p.postsPerWeek : Number(p.postsPerWeek) || 0,
              }))
            : [],
        };
      }
      const next = {
        ...existing,
        business_model: data.businessModel || existing.business_model || "B2B",
        channels,
      };
      // Write with a header comment (js-yaml drops comments on dump)
      const header = `# Cadence Config — ${slug}\n# Defines posting frequency, channels, and scheduling rules.\n# Last edited: ${new Date().toISOString().slice(0, 10)} (via MC Inputs UI)\n\n`;
      const body = yaml.dump(next, { lineWidth: 120, quotingType: '"', forceQuotes: false });
      fs.mkdirSync(path.dirname(cadencePath), { recursive: true });
      fs.writeFileSync(cadencePath, header + body);
    } else if (configId === "monitored-profiles") {
      // data: Profile[] — full replacement of the profiles array
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: "monitored-profiles data must be an array" });
      }
      // Server-side hygiene: clean platforms, drop empty pillars/role/tier strings
      const cleaned: Profile[] = (data as Profile[]).map((p) => ({
        id: p.id || slugify(p.name || ""),
        type: p.type === "company" ? "company" : "person",
        name: (p.name || "").trim(),
        parent_company_id: p.parent_company_id || undefined,
        role: p.role?.trim() || undefined,
        tier: p.tier?.trim() || undefined,
        platforms: cleanPlatforms(p.platforms || {}),
        pillars_relevant: Array.isArray(p.pillars_relevant) ? p.pillars_relevant : [],
        metadata: p.metadata && Object.keys(p.metadata).length ? p.metadata : undefined,
      })).filter((p) => p.id && p.name);
      saveProfiles(slug, cleaned);
    } else {
      return res.status(400).json({ error: "Unknown configId: " + configId });
    }

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);

// Export for tests / scripting (not part of the HTTP surface).
export { migrateToProfiles, slugify, PLATFORM_KEYS };
export type { Profile };
