import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const SKILLS_DIR = path.join(BASE, "skills");

interface SkillMeta {
  name: string;
  description: string;
  metadata?: Record<string, string>;
  context_required?: string[];
  context_writes?: string[];
}

function parseYamlFrontmatter(content: string): { meta: SkillMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: { name: "", description: "" }, body: content };

  const yamlStr = match[1];
  const body = match[2];
  const meta: Record<string, unknown> = {};

  // Simple YAML parser for flat + simple nested fields
  let currentKey = "";
  for (const line of yamlStr.split("\n")) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "" || val === "[]") {
        meta[currentKey] = val === "[]" ? [] : {};
      } else if (val.startsWith('"') || val.startsWith("'")) {
        meta[currentKey] = val.replace(/^['"]|['"]$/g, "");
      } else {
        meta[currentKey] = val;
      }
    } else if (line.startsWith("- ") && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      (meta[currentKey] as string[]).push(line.slice(2).trim());
    } else if (line.startsWith("  ") && currentKey === "metadata") {
      const subMatch = line.trim().match(/^(\w[\w_]*)\s*:\s*['"]?(.+?)['"]?\s*$/);
      if (subMatch) {
        if (typeof meta.metadata !== "object" || Array.isArray(meta.metadata)) meta.metadata = {};
        (meta.metadata as Record<string, string>)[subMatch[1]] = subMatch[2];
      }
    }
  }

  return { meta: meta as unknown as SkillMeta, body };
}

function readSkill(skillDir: string, skillId: string) {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) return null;

  const skillMd = fs.readFileSync(skillMdPath, "utf-8");
  const { meta, body } = parseYamlFrontmatter(skillMd);

  // Read reference files
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

  // Check for scripts
  const scriptsDir = path.join(skillDir, "scripts");
  const scripts: string[] = [];
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      scripts.push(f);
    }
  }

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
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { id } = req.query;

    // Single skill detail
    if (id && typeof id === "string") {
      const skillDir = path.join(SKILLS_DIR, id);
      if (!fs.existsSync(skillDir)) {
        return res.status(404).json({ error: "Skill not found" });
      }
      const skill = readSkill(skillDir, id);
      return res.status(200).json(skill);
    }

    // List all skills (lightweight — no file contents)
    const skills: Array<{
      id: string;
      name: string;
      description: string;
      pillar?: string;
      layer?: string;
      phase?: string;
      refCount: number;
      hasScripts: boolean;
    }> = [];

    if (!fs.existsSync(SKILLS_DIR)) {
      return res.status(200).json({ skills });
    }

    for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const skillMdPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, "utf-8");
      const { meta } = parseYamlFrontmatter(content);

      const refsDir = path.join(SKILLS_DIR, entry.name, "references");
      const scriptsDir = path.join(SKILLS_DIR, entry.name, "scripts");

      skills.push({
        id: entry.name,
        name: meta.name || entry.name,
        description: typeof meta.description === "string"
          ? meta.description.slice(0, 200)
          : "",
        pillar: meta.metadata?.pillar,
        layer: meta.metadata?.layer,
        phase: meta.metadata?.phase,
        refCount: fs.existsSync(refsDir)
          ? fs.readdirSync(refsDir).filter((f) => f.endsWith(".md")).length
          : 0,
        hasScripts: fs.existsSync(scriptsDir),
      });
    }

    // Sort by layer then name
    skills.sort((a, b) => {
      const la = Number(a.layer ?? 99);
      const lb = Number(b.layer ?? 99);
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });

    return res.status(200).json({ skills });
  }

  if (req.method === "POST") {
    // Save a file within a skill
    const { skillId, fileName, content } = req.body;
    if (!skillId || !fileName || content === undefined) {
      return res.status(400).json({ error: "Missing skillId, fileName, or content" });
    }

    // Security: only allow known paths
    if (fileName.includes("..") || fileName.includes("~")) {
      return res.status(400).json({ error: "Invalid fileName" });
    }

    const skillDir = path.join(SKILLS_DIR, skillId);
    // Create skill directory if it doesn't exist (new skill)
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const filePath = path.join(skillDir, fileName);
    // Ensure parent dir exists (for references/prompt.md etc.)
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { skillId } = req.body;
    if (!skillId) {
      return res.status(400).json({ error: "Missing skillId" });
    }
    if (skillId.includes("..") || skillId.includes("/") || skillId.includes("~")) {
      return res.status(400).json({ error: "Invalid skillId" });
    }
    const skillDir = path.join(SKILLS_DIR, skillId);
    if (!fs.existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    fs.rmSync(skillDir, { recursive: true, force: true });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
