// ============================================================
// Skill Resolution Engine — ported from mission-control.html:5149-5254
// This is the core context system that determines which skill(s)
// execute for each chat thread in SanchoCMO.
// ============================================================

export interface SkillResolution {
  skill: string;
  skills: string[];
}

export interface SkillContext {
  taskSkill?: string;
  taskType?: string;
  channel?: string;
  strategyId?: string;
  strategy?: string;
  pillar?: string;
}

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

/** 12+ content channels → skills */
export const CONTENT_CHANNEL_SKILLS: Record<string, SkillResolution> = {
  blog: { skill: "seo-content", skills: ["deep-research", "seo-content", "schema-markup", "qa-bot", "content-calendar-planner"] },
  seo: { skill: "seo-content", skills: ["deep-research", "seo-content", "schema-markup", "qa-bot", "content-calendar-planner"] },
  linkedin: { skill: "linkedin-content", skills: ["linkedin-content", "brand-voice", "qa-bot", "content-calendar-planner"] },
  instagram: { skill: "instagram-content", skills: ["instagram-content", "brand-voice", "qa-bot", "content-calendar-planner"] },
  twitter: { skill: "twitter-content", skills: ["twitter-content", "brand-voice", "qa-bot", "content-calendar-planner"] },
  tiktok: { skill: "tiktok-growth", skills: ["tiktok-growth", "social-content", "brand-voice", "qa-bot", "content-calendar-planner"] },
  email: { skill: "email-sequences", skills: ["email-sequences", "copywriting", "qa-bot"] },
  newsletter: { skill: "email-sequences", skills: ["email-sequences", "copywriting", "qa-bot"] },
  youtube: { skill: "copywriting", skills: ["deep-research", "copywriting", "qa-bot"] },
  "guest-post": { skill: "seo-content", skills: ["seo-content", "copywriting", "outreach-sequence-builder", "qa-bot"] },
  "paid-ads": { skill: "direct-response-copy", skills: ["direct-response-copy", "qa-bot"] },
  web: { skill: "landing-pages", skills: ["landing-pages", "alarife-integration", "qa-bot"] },
  landing: { skill: "landing-pages", skills: ["landing-pages", "alarife-integration", "qa-bot"] },
  presentations: { skill: "frontend-slides", skills: ["frontend-slides", "qa-bot"] },
};

/** 15+ foundation pillars → skills */
export const PILLAR_SKILLS: Record<string, SkillResolution> = {
  "fast-foundation": { skill: "fast-foundation", skills: ["fast-foundation"] },
  "company-brief": { skill: "fast-foundation", skills: ["fast-foundation"] },
  "market-analysis": { skill: "market-intelligence", skills: ["market-intelligence", "deep-research"] },
  "competitor-analysis": { skill: "competitor-intelligence", skills: ["competitor-intelligence", "deep-research"] },
  "self-analysis": { skill: "self-intelligence", skills: ["self-intelligence", "deep-research"] },
  "market-synthesis": { skill: "market-synthesis", skills: ["market-synthesis", "frontend-slides"] },
  "niche-discovery": { skill: "niche-discovery-100x", skills: ["niche-discovery-100x", "deep-research"] },
  positioning: { skill: "positioning-messaging", skills: ["positioning-messaging"] },
  pricing: { skill: "pricing-strategy", skills: ["pricing-strategy"] },
  "brand-voice": { skill: "brand-voice", skills: ["brand-voice"] },
  "visual-identity": { skill: "visual-identity", skills: ["visual-identity"] },
  "metrics-setup": { skill: "metrics-setup", skills: ["metrics-setup", "connect-api"] },
  "strategic-plan": { skill: "strategic-plan", skills: ["strategic-plan"] },
  "existing-customer-data": { skill: "existing-customer-data", skills: ["existing-customer-data"] },
  "ecp-validation": { skill: "ecp-validation", skills: ["ecp-validation"] },
  "foundation-presentation": { skill: "frontend-slides", skills: ["frontend-slides", "market-synthesis"] },
  "strategic-presentation": { skill: "frontend-slides", skills: ["frontend-slides", "strategic-plan"] },
};

/**
 * Resolve which skill(s) should be used for a chat thread.
 * 5-tier hierarchy matching the legacy resolveThreadSkills().
 */
export function resolveThreadSkills(ctx: SkillContext): SkillResolution {
  // 1. Explicit task skill
  if (ctx.taskSkill) {
    return { skill: ctx.taskSkill, skills: [ctx.taskSkill] };
  }

  // 2. By task type
  if (ctx.taskType) {
    if (ctx.taskType === "content") {
      const ch = ctx.channel ? CONTENT_CHANNEL_SKILLS[ctx.channel] : null;
      return ch || { skill: "content-strategy", skills: ["content-strategy", "qa-bot"] };
    }
    if (ctx.taskType === "outreach") {
      return {
        skill: "outreach-sequence-builder",
        skills: ["company-finder", "decision-maker-finder", "contact-enrichment", "outreach-sequence-builder"],
      };
    }
    if (ctx.taskType === "foundation") {
      return (ctx.pillar ? PILLAR_SKILLS[ctx.pillar] : null) || { skill: "doc-coauthoring", skills: ["doc-coauthoring"] };
    }
    if (ctx.taskType === "research") {
      return { skill: "deep-research", skills: ["deep-research", "last30days"] };
    }
    if (ctx.taskType === "analysis") {
      return { skill: "deep-research", skills: ["deep-research"] };
    }
    if (ctx.taskType === "execution") {
      return { skill: "doc-coauthoring", skills: ["doc-coauthoring"] };
    }
  }

  // 3. By strategy ID (extract number from "#01", "01", etc.)
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
    if (lower.includes("fast foundation")) return PILLAR_SKILLS["fast-foundation"];
    if (lower.includes("full foundation")) {
      return { skill: "market-intelligence", skills: ["market-intelligence", "competitor-intelligence", "self-intelligence"] };
    }
  }

  // 5. By pillar
  if (ctx.pillar) {
    return PILLAR_SKILLS[ctx.pillar] || { skill: "doc-coauthoring", skills: ["doc-coauthoring"] };
  }

  // 6. Fallback
  return { skill: "sancho-manager", skills: ["sancho-manager"] };
}
