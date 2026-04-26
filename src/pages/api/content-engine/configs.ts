/**
 * GET/PUT /api/content-engine/configs — Structured read/write of Content Engine configs
 *
 * GET ?slug=X → returns all configs parsed as structured JSON
 * PUT { slug, configId, data } → writes structured data back as YAML
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

function readYaml(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8"));
  } catch { return null; }
}

function writeYaml(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120, quotingType: '"', forceQuotes: false }));
}

function listPillarFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".yml")).sort();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const configDir = path.join(BASE, "brand", slug, "content", "configs");

  if (req.method === "GET") {
    // Read all configs as structured data
    const configs: Record<string, unknown> = {};

    // News prompts (per pillar)
    const newsDir = path.join(configDir, "news-prompts");
    const newsFiles = listPillarFiles(newsDir);
    configs.newsPrompts = newsFiles.map((f) => {
      const data = readYaml(path.join(newsDir, f)) as Record<string, unknown> | null;
      return {
        file: f,
        pillarId: data?.pillar_id || f.replace(".yml", ""),
        pillarName: data?.pillar_name || "",
        prompts: (data?.prompts as string[]) || [],
        sectorFilters: (data?.sector_filters as string[]) || [],
        language: (data?.language as string[]) || ["es", "en"],
      };
    });

    // PAA queries (per pillar)
    const paaDir = path.join(configDir, "paa-queries");
    const paaFiles = listPillarFiles(paaDir);
    configs.paaQueries = paaFiles.map((f) => {
      const data = readYaml(path.join(paaDir, f)) as Record<string, unknown> | null;
      return {
        file: f,
        pillarId: data?.pillar_id || f.replace(".yml", ""),
        pillarName: data?.pillar_name || "",
        queries: (data?.queries as string[]) || [],
      };
    });

    // Keywords seed (per pillar)
    const kwDir = path.join(configDir, "keywords-seed");
    const kwFiles = listPillarFiles(kwDir);
    configs.keywordsSeed = kwFiles.map((f) => {
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

    // Competitors
    const compFile = path.join(configDir, "competitors", "all-pillars.yml");
    const compData = readYaml(compFile) as Record<string, unknown> | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const directComps = ((compData?.competitors as any)?.direct || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indirectComps = ((compData?.competitors as any)?.indirect || []) as any[];
    configs.competitors = {
      direct: directComps.map((c) => ({
        name: c.name, slug: c.slug, tier: c.tier,
        web: c.web || "", linkedinCompany: c.linkedin_company || "",
        founderName: c.founder?.name || "", founderLinkedin: c.founder?.linkedin || "",
        pillarsRelevant: c.pillars_relevant || [],
      })),
      indirect: indirectComps.map((c) => ({
        name: c.name, slug: c.slug,
        pillarsRelevant: c.pillars_relevant || [],
      })),
    };

    // Reference creators
    const creatorsFile = path.join(configDir, "reference-creators", "all-pillars.yml");
    const creatorsData = readYaml(creatorsFile) as Record<string, unknown> | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creators = ((creatorsData?.reference_creators) || []) as any[];
    configs.referenceCreators = creators.map((c) => ({
      name: c.name,
      platforms: c.platforms || {},
      focus: c.focus || "",
      pillarsRelevant: c.pillars_relevant || [],
    }));

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
      const filePath = path.join(configDir, "news-prompts", `${pillarId}.yml`);
      writeYaml(filePath, {
        pillar_id: data.pillarId, pillar_name: data.pillarName,
        prompts: data.prompts, sector_filters: data.sectorFilters,
        language: data.language, exclude_sources: [],
      });
    } else if (configId.startsWith("paa-queries-")) {
      const pillarId = configId.replace("paa-queries-", "");
      writeYaml(path.join(configDir, "paa-queries", `${pillarId}.yml`), {
        pillar_id: data.pillarId, pillar_name: data.pillarName, queries: data.queries,
      });
    } else if (configId.startsWith("keywords-seed-")) {
      const pillarId = configId.replace("keywords-seed-", "");
      writeYaml(path.join(configDir, "keywords-seed", `${pillarId}.yml`), {
        pillar_id: data.pillarId, pillar_name: data.pillarName,
        keywords_seed: data.keywords, target: data.target, language: data.language,
      });
    } else {
      return res.status(400).json({ error: "Unknown configId: " + configId });
    }

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
