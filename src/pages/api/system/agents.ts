import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const OC_BASE = process.env.HOME
  ? path.join(process.env.HOME, ".openclaw")
  : "/Users/ragi/.openclaw";

/** Agent metadata — 9 agents (Fase 1 reorg, 2026-05-11). Escudero removed from UI but workspace-escudero/ kept until Fase 2. */
const AGENTS_META = [
  { slug: "cervantes",   name: "Cervantes",   emoji: "✒️",  channel: "Webchat + #admin",                  model: "Opus 4.6",   role: "Arquitecto del sistema" },
  { slug: "sancho",      name: "Sancho",      emoji: "🤠", channel: "Todos los canales Discord (default)", model: "Opus 4.6",   role: "CMO Estratega / Orchestrator" },
  { slug: "hamete",      name: "Hamete",      emoji: "📜", channel: "#research, #intelligence",            model: "Sonnet 4.5", role: "Cronista — Research & Market Intel" },
  { slug: "dulcinea",    name: "Dulcinea",    emoji: "✍️",  channel: "#content, #web",                     model: "Sonnet 4.5", role: "Musa — Contenido escrito" },
  { slug: "rocinante",   name: "Rocinante",   emoji: "🐴", channel: "#prospecting, #partners",             model: "Sonnet 4.5", role: "Outreach & Partnerships" },
  { slug: "maese-pedro", name: "Maese Pedro", emoji: "🎭", channel: "#creatives, #design, #web",           model: "Opus 4.6",   role: "Visual Director / Creative Engine" },
  { slug: "yalc",        name: "Yalc Agent",   emoji: "🧭", channel: "Mission Control / GTM-OS",            model: "Sonnet 4.5", role: "YALC operator / outbound GTM" },
  { slug: "mambrino",    name: "Mambrino",    emoji: "🪖", channel: "#paid-ads",                           model: "Sonnet 4.5", role: "Paid Ads & Retargeting" },
  { slug: "merlin",      name: "Merlín",      emoji: "🔮", channel: "#learning",                           model: "Sonnet 4.5", role: "Data, atribución & forecasting" },
  { slug: "sanson",      name: "Sansón",      emoji: "🛡️", channel: "Invocado por Sancho (QA)",            model: "Sonnet 4.5", role: "QA, brand-check & devil's advocate" },
];

/** Key agent files to expose (order matters for tabs) */
const KEY_FILES = ["SOUL.md", "IDENTITY.md", "TOOLS.md", "TASKS.md", "AGENTS.md", "USER.md", "HEARTBEAT.md", "MEMORY.md"];

function readAgentFiles(slug: string) {
  const wsDir = path.join(OC_BASE, `workspace-${slug}`);
  if (!fs.existsSync(wsDir)) return [];

  const files: { name: string; content: string }[] = [];

  // First add key files in order
  for (const fname of KEY_FILES) {
    const fpath = path.join(wsDir, fname);
    if (fs.existsSync(fpath)) {
      files.push({ name: fname, content: fs.readFileSync(fpath, "utf-8") });
    }
  }

  // Then add any other .md files not in KEY_FILES
  try {
    for (const entry of fs.readdirSync(wsDir)) {
      if (entry.endsWith(".md") && !KEY_FILES.includes(entry) && !entry.startsWith(".")) {
        const fpath = path.join(wsDir, entry);
        if (fs.statSync(fpath).isFile()) {
          files.push({ name: entry, content: fs.readFileSync(fpath, "utf-8") });
        }
      }
    }
  } catch { /* ignore */ }

  return files;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const agents = AGENTS_META.map((meta) => ({
      ...meta,
      files: readAgentFiles(meta.slug),
    }));
    return res.status(200).json(agents);
  }

  if (req.method === "POST") {
    // Save a file for an agent
    const { slug, fileName, content } = req.body;
    if (!slug || !fileName || content === undefined) {
      return res.status(400).json({ error: "Missing slug, fileName, or content" });
    }

    // Security: only allow .md files in the workspace root
    if (!fileName.endsWith(".md") || fileName.includes("/") || fileName.includes("..")) {
      return res.status(400).json({ error: "Invalid fileName — only .md files allowed" });
    }

    const wsDir = path.join(OC_BASE, `workspace-${slug}`);
    if (!fs.existsSync(wsDir)) {
      return res.status(404).json({ error: `Workspace for ${slug} not found` });
    }

    const fpath = path.join(wsDir, fileName);
    fs.writeFileSync(fpath, content, "utf-8");
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
