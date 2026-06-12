import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { readJSON } from "@/lib/data/json-io";
import { chatConfigFile } from "@/lib/data/paths";

interface QuickAction {
  label: string;
  prompt: string;
}

interface ChatConfigSection {
  skill?: string;
  skills?: string[];
  quickActions?: QuickAction[];
}

/**
 * GET /api/chat/quick-actions?slug=X&type=pillar&key=competitor-analysis
 * GET /api/chat/quick-actions?slug=X&type=task&taskType=content&channel=linkedin
 * GET /api/chat/quick-actions?slug=X&type=task&taskType=tool&tool=atalaya
 * GET /api/chat/quick-actions?slug=X&type=project
 * GET /api/chat/quick-actions?slug=X&type=skill
 * GET /api/chat/quick-actions?slug=X&type=general
 *
 * Returns { quickActions, skill, skills } resolved from chat-config.json
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  const type = req.query.type as string;
  if (!slug || !type) return res.status(400).json({ error: "Missing slug or type" });

  const config = readJSON<Record<string, unknown>>(chatConfigFile(slug), {});
  if (!config || Object.keys(config).length === 0) {
    return res.json({ quickActions: [], skill: null, skills: [] });
  }

  // Resolve based on type
  let resolved: ChatConfigSection | null = null;

  if (type === "pillar") {
    const key = req.query.key as string;
    const pillars = config.pillars as Record<string, ChatConfigSection> | undefined;
    if (key && pillars?.[key]) {
      resolved = pillars[key];
    }
  } else if (type === "task") {
    const taskType = req.query.taskType as string;
    const channel = req.query.channel as string;
    const tool = req.query.tool as string;
    const tasks = config.tasks as Record<string, unknown> | undefined;

    // Priority: _byChannel (content+channel) > _byTool (tool+tool) > _byType > _defaults
    if (taskType === "content" && channel && tasks) {
      const byChannel = tasks._byChannel as Record<string, ChatConfigSection> | undefined;
      if (byChannel?.[channel]) resolved = byChannel[channel];
    }
    if (!resolved && taskType === "tool" && tool && tasks) {
      const byTool = tasks._byTool as Record<string, ChatConfigSection> | undefined;
      if (byTool?.[tool]) resolved = byTool[tool];
    }
    if (!resolved && taskType && tasks) {
      const byType = tasks._byType as Record<string, ChatConfigSection> | undefined;
      if (byType?.[taskType]) resolved = byType[taskType];
    }
    if (!resolved && tasks) {
      resolved = tasks._defaults as ChatConfigSection | undefined ?? null;
    }
  } else if (type === "project") {
    const projects = config.projects as Record<string, unknown> | undefined;
    resolved = (projects?._defaults as ChatConfigSection) ?? null;
  } else if (type === "strategy") {
    const strategies = config.strategies as Record<string, unknown> | undefined;
    resolved = (strategies?._defaults as ChatConfigSection) ?? null;
  } else if (type === "idea") {
    const ideas = config.ideas as Record<string, unknown> | undefined;
    resolved = (ideas?._defaults as ChatConfigSection) ?? null;
  } else if (type === "recurring") {
    const recurring = config.recurring as Record<string, unknown> | undefined;
    resolved = (recurring?._defaults as ChatConfigSection) ?? null;
  } else if (type === "skill") {
    const skills = config.skills as Record<string, unknown> | undefined;
    resolved = (skills?._defaults as ChatConfigSection) ?? null;
  } else if (type === "general") {
    resolved = config.general as ChatConfigSection ?? null;
  }

  res.json({
    quickActions: resolved?.quickActions ?? [],
    skill: resolved?.skill ?? null,
    skills: resolved?.skills ?? [],
  });
}

export default withErrorHandler(handler);
