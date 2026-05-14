// ============================================================
// Skill Resolution Engine
// Reads from brand/{slug}/chat-config.json when available,
// falls back to hardcoded maps for backwards compatibility.
// ============================================================


export interface SkillResolution {
  skill: string;
  skills: string[];
  /** When set, the task should be dispatched to this agent instead of the
   *  default Sancho workspace. Currently used by tasks of `type=media` which
   *  route to Maese Pedro (workspace-maese-pedro). Optional and additive — if
   *  consumers ignore it, behavior is unchanged. */
  agent?: string;
}

export interface SkillContext {
  slug?: string;
  taskSkill?: string;
  taskType?: string;
  channel?: string;
  tool?: string;
  strategyId?: string;
  strategy?: string;
  pillar?: string;
}

// ---------------------------------------------------------------------------
// chat-config.json reader (cached per slug for the lifetime of the request)
// ---------------------------------------------------------------------------

export interface ChatConfig {
  pillars?: Record<string, { skill?: string; skills?: string[]; agent?: string; canonical?: string; docPath?: string }>;
  tasks?: {
    _defaults?: { skill?: string; skills?: string[]; agent?: string };
    _byType?: Record<string, { skill?: string; skills?: string[]; agent?: string }>;
    _byChannel?: Record<string, { skill?: string; skills?: string[]; agent?: string }>;
    _byTool?: Record<string, { skill?: string; skills?: string[]; agent?: string }>;
  };
  strategies?: { _defaults?: { skill?: string; skills?: string[]; agent?: string } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function toResolution(entry: { skill?: string; skills?: string[]; agent?: string } | undefined): SkillResolution | null {
  if (!entry?.skill) return null;
  return { skill: entry.skill, skills: entry.skills ?? [entry.skill], agent: entry.agent };
}

/** Enrich a SkillResolution with the owner agent (Fase 3 + 8 — 2026-05-11/12).
 *  If the resolution already has `agent` set (e.g. by chat-config.json), keep it.
 *  Otherwise, look up the skill in SKILL_OWNER_MAP and route to the owner. */
function withOwnerAgent(res: SkillResolution): SkillResolution {
  if (res.agent) return res; // explicit agent takes precedence
  const owner = SKILL_OWNER_MAP[res.skill];
  return owner ? { ...res, agent: owner } : res;
}

// ---------------------------------------------------------------------------
// Skill ownership map (Fase 3 + 8 — 2026-05-11/12)
// ---------------------------------------------------------------------------

/** Mapping skill → owner agent slug.
 *  Skills NOT in this map default to Sancho's workspace.
 *  Source: workspace-sancho/dispatch-map.json v4 (specialists.*.skills_owned).
 *  Used by `resolveAgentForSkill` to enrich SkillResolution with `agent` field,
 *  which the gateway uses (via SessionKey prefix `agent:<slug>:`) to route
 *  the task to the owner's workspace. */
const SKILL_OWNER_MAP: Record<string, string> = {
  "ab-test-setup": "mambrino",
  "acquisition-metrics-plan": "mambrino",
  "ad-creative": "mambrino",
  "ai-seo": "dulcinea",
  "alarife-integration": "dulcinea",
  "algorithmic-art": "maese-pedro",
  "analytics-tracking": "merlin",
  "apify": "hamete",
  "apollo": "rocinante",
  "aso-audit": "merlin",
  "atalaya": "hamete",
  "atalaya-competitors": "hamete",
  "atalaya-google-ads": "hamete",
  "atalaya-instagram": "hamete",
  "atalaya-linkedin": "hamete",
  "atalaya-meta-ads": "hamete",
  "atalaya-twitter": "hamete",
  "brand-check": "sanson",
  "brand-voice": "dulcinea",
  "canvas-design": "maese-pedro",
  "claude-api": "cervantes",
  "co-marketing": "rocinante",
  "cold-email": "rocinante",
  "comic-ui-system": "maese-pedro",
  "community-marketing": "rocinante",
  "company-finder": "rocinante",
  "competitor-alternatives": "hamete",
  "competitor-intelligence": "hamete",
  "competitor-profiling": "hamete",
  "connect-api": "cervantes",
  "contact-enrichment": "rocinante",
  "content-atomizer": "dulcinea",
  "content-calendar-planner": "dulcinea",
  "content-engine-setup": "dulcinea",
  "content-image": "dulcinea",
  "content-pillars": "dulcinea",
  "content-playbook": "dulcinea",
  "content-strategy": "dulcinea",
  "copy-editing": "dulcinea",
  "copywriting": "dulcinea",
  "customer-research": "hamete",
  "daily-pulse": "hamete",
  "decision-maker-finder": "rocinante",
  "deep-research": "hamete",
  "design-system": "maese-pedro",
  "direct-response-copy": "dulcinea",
  "directory-submissions": "rocinante",
  "doc-coauthoring": "dulcinea",
  "ecp-validation": "sanson",
  "email-sequence": "rocinante",
  "find-instagram-profiles": "hamete",
  "find-linkedin-profiles": "hamete",
  "find-twitter-profiles": "hamete",
  "form-cro": "dulcinea",
  "frontend-design": "maese-pedro",
  "frontend-slides": "maese-pedro",
  "google-ads": "mambrino",
  "google-analytics": "merlin",
  "google-search-console": "merlin",
  "growth4u-ui-system": "maese-pedro",
  "growth4u-visual-generator": "maese-pedro",
  "gsc": "merlin",
  "image": "dulcinea",
  "insight-classifier": "dulcinea",
  "insight-to-content-mapper": "dulcinea",
  "instagram-content": "dulcinea",
  "internal-comms": "dulcinea",
  "keyword-research": "dulcinea",
  "landing-pages": "dulcinea",
  "larry": "dulcinea",
  "last30days": "hamete",
  "lead-intelligence-hub": "rocinante",
  "lead-magnet": "dulcinea",
  "lead-magnets": "dulcinea",
  "market-intelligence": "hamete",
  "mcp-builder": "cervantes",
  "meeting-intelligence": "hamete",
  "meta-ads": "mambrino",
  "metricool": "dulcinea",
  "metrics-collector": "merlin",
  "metrics-setup": "merlin",
  "nano-banana-pro": "maese-pedro",
  "native-google-analytics": "merlin",
  "news-monitor": "hamete",
  "newsletter": "dulcinea",
  "niche-presentation": "maese-pedro",
  "od-export": "maese-pedro",
  "od-generate": "maese-pedro",
  "od-list-design-systems": "maese-pedro",
  "od-list-skills": "maese-pedro",
  "od-refine": "maese-pedro",
  "onboarding-cro": "dulcinea",
  "outreach-playbook": "rocinante",
  "outreach-sequence-builder": "rocinante",
  "paa-monitor": "hamete",
  "page-cro": "dulcinea",
  "paid-ads": "mambrino",
  "pattern-detector": "merlin",
  "paywall-upgrade-cro": "dulcinea",
  "performance-analysis": "merlin",
  "popup-cro": "dulcinea",
  "pov-bank-builder": "dulcinea",
  "programmatic-seo": "dulcinea",
  "qa-bot": "sanson",
  "railway": "cervantes",
  "referral-program": "rocinante",
  "revops": "rocinante",
  "sales-call-prep": "rocinante",
  "sales-enablement": "rocinante",
  "sancho-visual": "maese-pedro",
  "schema-markup": "dulcinea",
  "send-idea-notifications": "dulcinea",
  "seo-audit": "dulcinea",
  "seo-content": "dulcinea",
  "signal-monitor": "hamete",
  "signup-flow-cro": "dulcinea",
  "site-architecture": "dulcinea",
  "skill-creator": "cervantes",
  "slack-gif-creator": "maese-pedro",
  "smart-scrape": "hamete",
  "social-content": "dulcinea",
  "social-media-extractor": "hamete",
  "social-writer": "dulcinea",
  "theme-factory": "maese-pedro",
  "thief-marketers": "hamete",
  "tiktok-growth": "dulcinea",
  "trust-engine": "hamete",
  "video": "dulcinea",
  "visual-identity": "maese-pedro",
  "web-artifacts-builder": "maese-pedro",
  "webapp-testing": "maese-pedro",
  "xlsx": "merlin",
  "youtube-transcript": "dulcinea",
};

/** Return the owner agent slug for a skill, or undefined if it belongs to Sancho default. */
export function resolveAgentForSkill(skill: string | undefined): string | undefined {
  if (!skill) return undefined;
  return SKILL_OWNER_MAP[skill];
}

// ---------------------------------------------------------------------------
// Hardcoded fallback maps (kept for backwards compat / no chat-config.json)
// ---------------------------------------------------------------------------

/** 25 strategies (#01-#25), each with primary skill + secondary skills */
export const STRATEGY_SKILLS: Record<string, SkillResolution> = {
  "01": { skill: "company-finder", skills: ["company-finder", "decision-maker-finder", "contact-enrichment", "outreach-sequence-builder"] },
  "02": { skill: "trust-engine", skills: ["trust-engine", "keyword-research", "seo-content", "company-finder", "outreach-sequence-builder", "content-atomizer"] },
  "03": { skill: "company-finder", skills: ["company-finder"] },
  "04": { skill: "direct-response-copy", skills: ["direct-response-copy", "content-atomizer"] },
  "05": { skill: "outreach-sequence-builder", skills: ["outreach-sequence-builder"] },
  "06": { skill: "keyword-research", skills: ["keyword-research"] },
  "07": { skill: "company-finder", skills: ["company-finder", "decision-maker-finder", "landing-pages", "outreach-sequence-builder", "paid-ads"] },
  "08": { skill: "keyword-research", skills: ["keyword-research", "seo-content", "content-calendar-planner", "content-atomizer"] },
  "09": { skill: "doc-coauthoring", skills: ["doc-coauthoring"] },
  "10": { skill: "direct-response-copy", skills: ["direct-response-copy"] },
  "11": { skill: "keyword-research", skills: ["keyword-research", "landing-pages", "lead-magnet", "email-sequences"] },
  "12": { skill: "direct-response-copy", skills: ["direct-response-copy", "content-atomizer"] },
  "13": { skill: "company-finder", skills: ["company-finder", "seo-content", "direct-response-copy"] },
  "14": { skill: "direct-response-copy", skills: ["direct-response-copy"] },
  "15": { skill: "onboarding-cro", skills: ["onboarding-cro", "paywall-upgrade-cro"] },
  "16": { skill: "direct-response-copy", skills: ["direct-response-copy", "landing-pages"] },
  "17": { skill: "direct-response-copy", skills: ["direct-response-copy"] },
  "18": { skill: "direct-response-copy", skills: ["direct-response-copy"] },
  "19": { skill: "content-calendar-planner", skills: ["content-calendar-planner", "brand-voice", "content-atomizer"] },
  "20": { skill: "seo-content", skills: ["seo-content", "schema-markup", "keyword-research"] },
  "21": { skill: "keyword-research", skills: ["keyword-research", "content-calendar-planner"] },
  "22": { skill: "doc-coauthoring", skills: ["doc-coauthoring"] },
  "23": { skill: "lead-magnet", skills: ["lead-magnet"] },
  "24": { skill: "direct-response-copy", skills: ["direct-response-copy"] },
  "25": { skill: "keyword-research", skills: ["keyword-research", "content-calendar-planner"] },
};

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve which skill(s) should be used for a chat thread.
 * Priority:
 *   1. Explicit task skill (from tasks.json)
 *   2. foundation task → pillar skill from chat-config.json
 *   3. content task + channel → _byChannel from chat-config.json
 *   4. tool task + tool name → _byTool from chat-config.json
 *   5. task type → _byType from chat-config.json
 *   6. strategy ID → STRATEGY_SKILLS
 *   7. strategy name pattern
 *   8. pillar → chat-config.json pillars
 *   9. Fallback → sancho-manager
 *
 * After resolution, the result is enriched with the owner agent from
 * SKILL_OWNER_MAP (Fase 3/8) so the dispatch routes to the correct workspace.
 * If a caller (chat-config.json, explicit override) already set `agent`,
 * that takes precedence.
 */
export function resolveThreadSkills(ctx: SkillContext, cfg: ChatConfig = {}): SkillResolution {
  return withOwnerAgent(resolveSkillCore(ctx, cfg));
}

function resolveSkillCore(ctx: SkillContext, cfg: ChatConfig): SkillResolution {

  // 1. Explicit task skill
  if (ctx.taskSkill) {
    return { skill: ctx.taskSkill, skills: [ctx.taskSkill] };
  }

  // 2. By task type
  if (ctx.taskType) {
    // 2a. Foundation → skill comes from the pillar
    if (ctx.taskType === "foundation" && ctx.pillar) {
      const fromConfig = toResolution(cfg.pillars?.[ctx.pillar]);
      if (fromConfig) return fromConfig;
    }

    // 2b. Content + channel → _byChannel
    if (ctx.taskType === "content" && ctx.channel) {
      const fromConfig = toResolution(cfg.tasks?._byChannel?.[ctx.channel]);
      if (fromConfig) return fromConfig;
    }

    // 2c. Tool + tool name → _byTool
    if (ctx.taskType === "tool" && ctx.tool) {
      const fromConfig = toResolution(cfg.tasks?._byTool?.[ctx.tool]);
      if (fromConfig) return fromConfig;
    }

    // 2d. By type → _byType
    const fromType = toResolution(cfg.tasks?._byType?.[ctx.taskType]);
    if (fromType) return fromType;

    // 2e. Fallback defaults from config
    const fromDefaults = toResolution(cfg.tasks?._defaults);
    if (fromDefaults) return fromDefaults;
  }

  // 3. By strategy ID
  if (ctx.strategyId) {
    const id = ctx.strategyId.replace(/^#/, "").padStart(2, "0");
    if (STRATEGY_SKILLS[id]) return STRATEGY_SKILLS[id];
  }

  // 4. By strategy name pattern matching
  if (ctx.strategy) {
    const lower = ctx.strategy.toLowerCase();
    const match = lower.match(/#(\d+)/);
    if (match) {
      const id = match[1].padStart(2, "0");
      if (STRATEGY_SKILLS[id]) return STRATEGY_SKILLS[id];
    }
    if (lower.includes("strategic plan")) return { skill: "strategic-plan", skills: ["strategic-plan"] };
    if (lower.includes("metrics")) return { skill: "metrics-setup", skills: ["metrics-setup", "connect-api"] };
    if (lower.includes("fast foundation")) {
      return toResolution(cfg.pillars?.["fast-foundation"]) ?? { skill: "fast-foundation", skills: ["fast-foundation"] };
    }
    if (lower.includes("full foundation")) {
      return { skill: "market-intelligence", skills: ["market-intelligence", "competitor-intelligence", "self-intelligence"] };
    }
  }

  // 5. By pillar
  if (ctx.pillar) {
    const fromConfig = toResolution(cfg.pillars?.[ctx.pillar]);
    if (fromConfig) return fromConfig;
    // 5b. Convention: meta-skill pillars have a homonymous skill installed
    // alongside them. When the brand hasn't customized chat-config we fall
    // through to that convention before going to the generic manager — so
    // visual-identity → "visual-identity" skill, brand-voice → "brand-voice", etc.
    if (HOMONYMOUS_SKILL_PILLARS.has(ctx.pillar)) {
      return { skill: ctx.pillar, skills: [ctx.pillar] };
    }
  }

  // 6. Fallback
  return { skill: "sancho-manager", skills: ["sancho-manager"] };
}

/** Pillars that ship with a child skill of the same name. Used by step 5b
 *  of `resolveThreadSkills` so threads land on the right skill even when
 *  `chat-config.json` doesn't list the pillar. */
const HOMONYMOUS_SKILL_PILLARS = new Set([
  "visual-identity",
  "brand-voice",
  "content-strategy",
  "content-pillars",
  "content-playbook",
  "niche-discovery-100x",
  "positioning-messaging",
  "pricing",
  "company-brief",
]);
