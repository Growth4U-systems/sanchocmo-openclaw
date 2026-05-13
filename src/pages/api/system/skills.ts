import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import os from "os";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

// El panel Skills escanea múltiples workspaces. workspace-sancho es el default
// (legacy + skills generales). workspace-maese-pedro contiene las skills del
// agente visual Maese Pedro (od-*, design-system, sancho-visual, etc.).
const SKILL_WORKSPACES: Array<{ id: string; label: string; dir: string }> = [
  {
    id: "workspace-sancho",
    label: "Sancho",
    dir: path.join(BASE, "skills"),
  },
  {
    id: "workspace-maese-pedro",
    label: "Maese Pedro",
    dir: path.join(
      process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
      "workspace-maese-pedro",
      "skills",
    ),
  },
];

function skillDirFor(skillId: string, workspace?: string): { dir: string; workspaceId: string } | null {
  if (workspace) {
    const ws = SKILL_WORKSPACES.find((w) => w.id === workspace);
    if (ws) return { dir: path.join(ws.dir, skillId), workspaceId: ws.id };
  }
  // Buscar en cualquier workspace
  for (const ws of SKILL_WORKSPACES) {
    const candidate = path.join(ws.dir, skillId);
    if (fs.existsSync(candidate)) return { dir: candidate, workspaceId: ws.id };
  }
  return null;
}

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

function readSkill(skillDir: string, skillId: string, workspaceId: string) {
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
    workspace: workspaceId,
    file_path: skillMdPath,
    skill_dir: skillDir,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { id, workspace } = req.query;
    const workspaceParam = typeof workspace === "string" ? workspace : undefined;

    // Single skill detail
    if (id && typeof id === "string") {
      const located = skillDirFor(id, workspaceParam);
      if (!located) {
        return res.status(404).json({ error: "Skill not found" });
      }
      const skill = readSkill(located.dir, id, located.workspaceId);
      return res.status(200).json(skill);
    }

    // List all skills (lightweight — no file contents). Escanea TODOS los workspaces.
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
        const { meta } = parseYamlFrontmatter(content);

        const refsDir = path.join(skillDir, "references");
        const scriptsDir = path.join(skillDir, "scripts");

        skills.push({
          id: entry.name,
          name: meta.name || entry.name,
          description: typeof meta.description === "string" ? meta.description.slice(0, 200) : "",
          pillar: meta.metadata?.pillar,
          layer: meta.metadata?.layer,
          phase: meta.metadata?.phase,
          agent: meta.metadata?.agent,
          refCount: fs.existsSync(refsDir)
            ? fs.readdirSync(refsDir).filter((f) => f.endsWith(".md")).length
            : 0,
          hasScripts: fs.existsSync(scriptsDir),
          workspace: ws.id,
          file_path: skillMdPath,
        });
      }
    }

    // Sort by layer then name
    skills.sort((a, b) => {
      const la = Number(a.layer ?? 99);
      const lb = Number(b.layer ?? 99);
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });

    return res.status(200).json({ skills, workspaces: SKILL_WORKSPACES.map((w) => ({ id: w.id, label: w.label })) });
  }

  if (req.method === "POST") {
    // Save a file within a skill
    const { skillId, fileName, content, workspace } = req.body;
    if (!skillId || !fileName || content === undefined) {
      return res.status(400).json({ error: "Missing skillId, fileName, or content" });
    }

    // Security: only allow known paths
    if (fileName.includes("..") || fileName.includes("~")) {
      return res.status(400).json({ error: "Invalid fileName" });
    }

    // Resolver workspace: si ya existe la skill en algún workspace, usar ese; si no,
    // usar el workspace explícito del body, default workspace-sancho.
    let located = skillDirFor(skillId, workspace);
    if (!located) {
      const targetWs = SKILL_WORKSPACES.find((w) => w.id === workspace) ?? SKILL_WORKSPACES[0];
      located = { dir: path.join(targetWs.dir, skillId), workspaceId: targetWs.id };
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
    const { skillId, workspace } = req.body;
    if (!skillId) {
      return res.status(400).json({ error: "Missing skillId" });
    }
    if (skillId.includes("..") || skillId.includes("/") || skillId.includes("~")) {
      return res.status(400).json({ error: "Invalid skillId" });
    }
    const located = skillDirFor(skillId, workspace);
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
