import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { strategiesCatalogFile } from "@/lib/data/paths";

interface Strategy {
  id: string;
  name: string;
  quadrant: string;
  objetivo: string;
  prerequisitos: string;
  tiempoResultado: string;
  b2b: string;
  b2c: string;
  velocidad: string;
  sectores: string[];
  skills: string[];
  objetivos: string[];
  workflow?: Record<string, string>;
  cuandoUsar?: string[];
  cuandoNoUsar?: string[];
}

interface Catalog {
  version?: string;
  strategies: Strategy[];
  quadrants: Array<{ id: string; label: string; icon: string }>;
  clientStrategies?: Record<string, Array<{ id: string; score: number; justification: string }>>;
}

function loadCatalog(): Catalog {
  try {
    return JSON.parse(fs.readFileSync(strategiesCatalogFile(), "utf-8"));
  } catch {
    return { strategies: [], quadrants: [], clientStrategies: {} };
  }
}

function saveCatalog(catalog: Catalog) {
  fs.writeFileSync(strategiesCatalogFile(), JSON.stringify(catalog, null, 2), "utf-8");
}

/* ── Serialize a strategy to markdown ── */
function strategyToMarkdown(s: Strategy): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: "${s.id}"`);
  lines.push(`name: "${s.name}"`);
  lines.push(`quadrant: "${s.quadrant}"`);
  lines.push(`velocidad: "${s.velocidad}"`);
  lines.push(`b2b: "${s.b2b}"`);
  lines.push(`b2c: "${s.b2c}"`);
  lines.push(`tiempoResultado: "${s.tiempoResultado}"`);
  lines.push(`prerequisitos: "${s.prerequisitos}"`);
  if (s.sectores.length) lines.push(`sectores: ${JSON.stringify(s.sectores)}`);
  if (s.skills.length) lines.push(`skills: ${JSON.stringify(s.skills)}`);
  if (s.objetivos.length) lines.push(`objetivos: ${JSON.stringify(s.objetivos)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# #${s.id} ${s.name}`);
  lines.push("");
  lines.push(`## Objetivo`);
  lines.push(s.objetivo);
  lines.push("");

  if (s.workflow && Object.keys(s.workflow).length > 0) {
    lines.push("## Workflow");
    lines.push("");
    for (const [key, val] of Object.entries(s.workflow)) {
      lines.push(`### ${key.charAt(0).toUpperCase() + key.slice(1)}`);
      lines.push(val);
      lines.push("");
    }
  }

  if (s.cuandoUsar?.length) {
    lines.push("## Cuándo usar");
    for (const item of s.cuandoUsar) lines.push(`- ${item}`);
    lines.push("");
  }

  if (s.cuandoNoUsar?.length) {
    lines.push("## Cuándo NO usar");
    for (const item of s.cuandoNoUsar) lines.push(`- ${item}`);
    lines.push("");
  }

  return lines.join("\n");
}

/* ── Parse markdown back to strategy fields ── */
function markdownToStrategy(md: string, existing: Strategy): Strategy {
  const updated = { ...existing };

  // Parse YAML frontmatter
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const yaml = fmMatch[1];
    for (const line of yaml.split("\n")) {
      const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!kv) continue;
      const [, key, rawVal] = kv;
      const val = rawVal.replace(/^["']|["']$/g, "").trim();
      if (key === "name") updated.name = val;
      else if (key === "quadrant") updated.quadrant = val;
      else if (key === "velocidad") updated.velocidad = val;
      else if (key === "b2b") updated.b2b = val;
      else if (key === "b2c") updated.b2c = val;
      else if (key === "tiempoResultado") updated.tiempoResultado = val;
      else if (key === "prerequisitos") updated.prerequisitos = val;
      else if (key === "sectores") try { updated.sectores = JSON.parse(rawVal); } catch { /* keep */ }
      else if (key === "skills") try { updated.skills = JSON.parse(rawVal); } catch { /* keep */ }
      else if (key === "objetivos") try { updated.objetivos = JSON.parse(rawVal); } catch { /* keep */ }
    }
  }

  // Parse body sections
  const body = fmMatch ? md.slice(fmMatch[0].length) : md;

  // Objetivo
  const objMatch = body.match(/## Objetivo\n([\s\S]*?)(?=\n## |$)/);
  if (objMatch) updated.objetivo = objMatch[1].trim();

  // Workflow sections
  const workflowMatch = body.match(/## Workflow\n([\s\S]*?)(?=\n## (?!#)|$)/);
  if (workflowMatch) {
    const wf: Record<string, string> = {};
    const sections = workflowMatch[1].split(/\n### /);
    for (const sec of sections) {
      if (!sec.trim()) continue;
      const nlIdx = sec.indexOf("\n");
      if (nlIdx === -1) continue;
      const key = sec.slice(0, nlIdx).trim().toLowerCase();
      const val = sec.slice(nlIdx + 1).trim();
      if (key && val) wf[key] = val;
    }
    if (Object.keys(wf).length) updated.workflow = wf;
  }

  // Cuándo usar
  const usarMatch = body.match(/## Cuándo usar\n([\s\S]*?)(?=\n## |$)/);
  if (usarMatch) {
    updated.cuandoUsar = usarMatch[1].trim().split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());
  }

  // Cuándo NO usar
  const noUsarMatch = body.match(/## Cuándo NO usar\n([\s\S]*?)(?=\n## |$)/);
  if (noUsarMatch) {
    updated.cuandoNoUsar = noUsarMatch[1].trim().split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());
  }

  return updated;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const catalog = loadCatalog();
    const { id } = req.query;

    // Single strategy detail → return markdown
    if (id && typeof id === "string") {
      const strategy = catalog.strategies.find((s) => s.id === id);
      if (!strategy) return res.status(404).json({ error: "Strategy not found" });
      return res.status(200).json({
        id: strategy.id,
        name: strategy.name,
        markdown: strategyToMarkdown(strategy),
      });
    }

    // List all
    return res.status(200).json(catalog);
  }

  if (req.method === "POST") {
    const { strategyId, content } = req.body;
    if (!strategyId || content === undefined) {
      return res.status(400).json({ error: "Missing strategyId or content" });
    }

    const catalog = loadCatalog();
    const idx = catalog.strategies.findIndex((s) => s.id === strategyId);
    if (idx === -1) return res.status(404).json({ error: "Strategy not found" });

    catalog.strategies[idx] = markdownToStrategy(content, catalog.strategies[idx]);
    saveCatalog(catalog);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
