import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { resolveAgentForSkill } from "@/lib/skill-resolver";
import { parseSkillFrontmatter } from "@/lib/server/skill-frontmatter";
import { getRuntime } from "@/lib/runtime";

// Fase 7 (2026-05-11/12): skills live in `~/.openclaw/skills/` (OpenClaw's
// built-in managed-skills root, read natively by all agents). The Settings →
// Skills panel reads from this single central catalog and enriches each entry
// with its owner agent via SKILL_OWNER_MAP in skill-resolver.ts.
const SKILLS_ROOT = path.join(
  getRuntime().state.home(),
  "skills",
);

const SKILL_WORKSPACES: Array<{ id: string; label: string; dir: string }> = [
  {
    id: "central",
    label: "Skills (catálogo central)",
    dir: SKILLS_ROOT,
  },
];

function skillDirFor(skillId: string): { dir: string; workspaceId: string } | null {
  const candidate = path.join(SKILLS_ROOT, skillId);
  if (fs.existsSync(candidate)) return { dir: candidate, workspaceId: "central" };
  return null;
}

function readSkill(skillDir: string, skillId: string, workspaceId: string) {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) return null;

  const skillMd = fs.readFileSync(skillMdPath, "utf-8");
  const { meta, body } = parseSkillFrontmatter(skillMd);

  const refsDir = path.join(skillDir, "references");
  const references: { name: string; content: string }[] = [];
  if (fs.existsSync(refsDir)) {
    for (const f of fs.readdirSync(refsDir).filter((f) => f.endsWith(".md"))) {
      references.push({
        name: f,
        content: fs.readFileSync(path.join(refsDir, f), "utf-8"),
      });
    }
  }

  const scriptsDir = path.join(skillDir, "scripts");
  const scripts: string[] = [];
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      scripts.push(f);
    }
  }

  // Owner agent: SKILL_OWNER_MAP first, then frontmatter, then sancho default
  const ownerAgent =
    resolveAgentForSkill(skillId) ??
    (typeof meta.metadata?.agent === "string" ? meta.metadata.agent : undefined) ??
    "sancho";

  return {
    id: skillId,
    name: meta.name || skillId,
    description: typeof meta.description === "string" ? meta.description : "",
    metadata: meta.metadata || {},
    context_required: meta.context_required || [],
    context_writes: meta.context_writes || [],
    body,
    skillMd,
    references,
    scripts,
    workspace: workspaceId,
    agent: ownerAgent,
    file_path: skillMdPath,
    skill_dir: skillDir,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { id } = req.query;

    // Single skill detail
    if (id && typeof id === "string") {
      const located = skillDirFor(id);
      if (!located) {
        return res.status(404).json({ error: "Skill not found" });
      }
      const skill = readSkill(located.dir, id, located.workspaceId);
      return res.status(200).json(skill);
    }

    // List all skills (lightweight — no file contents). Scans the central
    // skills directory at ~/.openclaw/skills/.
    const skills: Array<{
      id: string;
      name: string;
      description: string;
      pillar?: string;
      layer?: string;
      phase?: string;
      agent?: string;
      refCount: number;
      hasScripts: boolean;
      workspace: string;
      file_path: string;
    }> = [];

    for (const ws of SKILL_WORKSPACES) {
      if (!fs.existsSync(ws.dir)) continue;
      for (const entry of fs.readdirSync(ws.dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
        const skillDir = path.join(ws.dir, entry.name);
        const skillMdPath = path.join(skillDir, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;

        const content = fs.readFileSync(skillMdPath, "utf-8");
        const { meta } = parseSkillFrontmatter(content);

        const refsDir = path.join(skillDir, "references");
        const scriptsDir = path.join(skillDir, "scripts");

        const ownerAgent =
          resolveAgentForSkill(entry.name) ??
          (typeof meta.metadata?.agent === "string" ? meta.metadata.agent : undefined) ??
          "sancho";

        skills.push({
          id: entry.name,
          name: meta.name || entry.name,
          description: typeof meta.description === "string" ? meta.description.slice(0, 200) : "",
          pillar: meta.metadata?.pillar,
          layer: meta.metadata?.layer,
          phase: meta.metadata?.phase,
          agent: ownerAgent,
          refCount: fs.existsSync(refsDir)
            ? fs.readdirSync(refsDir).filter((f) => f.endsWith(".md")).length
            : 0,
          hasScripts: fs.existsSync(scriptsDir),
          workspace: ws.id,
          file_path: skillMdPath,
        });
      }
    }

    // Sort by agent then layer then name (UI groups naturally).
    skills.sort((a, b) => {
      const aa = a.agent ?? "zzz";
      const ba = b.agent ?? "zzz";
      if (aa !== ba) return aa.localeCompare(ba);
      const la = Number(a.layer ?? 99);
      const lb = Number(b.layer ?? 99);
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });

    return res.status(200).json({ skills, workspaces: SKILL_WORKSPACES.map((w) => ({ id: w.id, label: w.label })) });
  }

  if (req.method === "POST") {
    const { skillId, fileName, content } = req.body;
    if (!skillId || !fileName || content === undefined) {
      return res.status(400).json({ error: "Missing skillId, fileName, or content" });
    }
    if (fileName.includes("..") || fileName.includes("~")) {
      return res.status(400).json({ error: "Invalid fileName" });
    }

    let located = skillDirFor(skillId);
    if (!located) {
      located = { dir: path.join(SKILLS_ROOT, skillId), workspaceId: "central" };
    }
    if (!fs.existsSync(located.dir)) {
      fs.mkdirSync(located.dir, { recursive: true });
    }

    const filePath = path.join(located.dir, fileName);
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");
    return res.status(200).json({ ok: true, workspace: located.workspaceId });
  }

  if (req.method === "DELETE") {
    const { skillId } = req.body;
    if (!skillId) {
      return res.status(400).json({ error: "Missing skillId" });
    }
    if (skillId.includes("..") || skillId.includes("/") || skillId.includes("~")) {
      return res.status(400).json({ error: "Invalid skillId" });
    }
    const located = skillDirFor(skillId);
    if (!located || !fs.existsSync(located.dir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    fs.rmSync(located.dir, { recursive: true, force: true });
    return res.status(200).json({ ok: true, workspace: located.workspaceId });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
