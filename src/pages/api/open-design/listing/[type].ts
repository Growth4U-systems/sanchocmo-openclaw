/**
 * GET /api/open-design/listing/[type]
 *
 * Endpoint server-side unificado para listar el catálogo upstream de Open Design.
 * Llama al daemon (localhost:7456) con el shape correcto según type, normaliza
 * a `{ items: [...] }` y enriquece con `filePath` absoluto. Si el daemon no
 * expone el endpoint (404), cae a leer el filesystem directamente del repo.
 *
 * type ∈ { skills, design-systems, prompt-templates, craft-guides }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { resolveOdConfig } from "@/lib/open-design/client";

interface DaemonPayload {
  skills?: unknown[];
  designSystems?: unknown[];
  "design-systems"?: unknown[];
  promptTemplates?: unknown[];
  "prompt-templates"?: unknown[];
  items?: unknown[];
  [key: string]: unknown;
}

const TYPE_DAEMON_PATH: Record<string, { endpoint: string; payloadKey: string }> = {
  skills: { endpoint: "/api/skills", payloadKey: "skills" },
  "design-systems": { endpoint: "/api/design-systems", payloadKey: "designSystems" },
  "prompt-templates": { endpoint: "/api/prompt-templates", payloadKey: "promptTemplates" },
  // Fork exposes craft guides at /api/craft (singular). Earlier upstream
  // versions didn't expose it at all, hence the fallback path below.
  "craft-guides": { endpoint: "/api/craft", payloadKey: "craft" },
};

async function fsListSkills(repoPath: string): Promise<unknown[]> {
  const dir = path.join(repoPath, "skills");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
      .map((e) => ({ id: e.name, name: e.name }));
  } catch {
    return [];
  }
}

async function fsListDesignSystems(repoPath: string): Promise<unknown[]> {
  const dir = path.join(repoPath, "design-systems");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
      .map((e) => ({ id: e.name, title: e.name.charAt(0).toUpperCase() + e.name.slice(1) }));
  } catch {
    return [];
  }
}

async function fsListPromptTemplates(repoPath: string): Promise<unknown[]> {
  const baseDir = path.join(repoPath, "prompt-templates");
  const cats: Array<"image" | "video" | "audio"> = ["image", "video", "audio"];
  const collected: unknown[] = [];
  for (const cat of cats) {
    try {
      const dir = path.join(baseDir, cat);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
        collected.push({ id: `${cat}/${e.name}`, title: e.name.replace(/-/g, " "), surface: cat });
      }
    } catch {
      // ignora subdir ausente
    }
  }
  return collected;
}

async function fsListCraftGuides(repoPath: string): Promise<unknown[]> {
  const dir = path.join(repoPath, "craft");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const items: { id: string; name: string; summary?: string; filePath: string }[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md") || e.name === "README.md") continue;
      const full = path.join(dir, e.name);
      const id = e.name.replace(/\.md$/, "");
      let summary: string | undefined;
      try {
        const buf = await fs.readFile(full, "utf8");
        // Primer párrafo después del título: línea no vacía no-heading
        const lines = buf.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i].trim();
          if (!ln || ln.startsWith("#")) continue;
          summary = ln.slice(0, 200);
          break;
        }
      } catch {
        /* skip */
      }
      items.push({
        id,
        name: id.replace(/-/g, " "),
        summary,
        filePath: full,
      });
    }
    return items;
  } catch {
    return [];
  }
}

function enrichFilePath<T extends { id?: unknown; filePath?: string }>(
  type: string,
  items: T[],
  repoPath: string,
): T[] {
  return items.map((item) => {
    if (item.filePath) return item;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) return item;
    let filePath: string | undefined;
    if (type === "skills") {
      filePath = path.join(repoPath, "skills", id, "SKILL.md");
    } else if (type === "design-systems") {
      filePath = path.join(repoPath, "design-systems", id, "DESIGN.md");
    } else if (type === "prompt-templates") {
      // ID format: "image/foo" or "video/bar"
      filePath = path.join(repoPath, "prompt-templates", id);
    }
    return { ...item, filePath };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const typeParam = req.query.type;
  const type = Array.isArray(typeParam) ? typeParam[0] : typeParam;
  if (!type || !["skills", "design-systems", "prompt-templates", "craft-guides"].includes(type)) {
    res.status(400).json({ error: "type must be one of: skills, design-systems, prompt-templates, craft-guides" });
    return;
  }

  const config = resolveOdConfig();

  // Probar daemon, si falla o vuelve vacío usar FS. Bearer +
  // spoofed Origin son requeridos por la guarda Phase 5 del fork; sin
  // ellos el daemon devuelve 401 y caemos al fallback FS en un path que
  // probablemente no existe (OD_REPO_PATH default = laptop del autor).
  const daemonInfo = TYPE_DAEMON_PATH[type];
  let items: unknown[] = [];
  let source = "daemon";
  try {
    const daemonHeaders: Record<string, string> = {};
    if (config.apiToken) {
      daemonHeaders["Authorization"] = `Bearer ${config.apiToken}`;
      daemonHeaders["Origin"] = config.webUrl;
    }
    const r = await fetch(`${config.daemonUrl}${daemonInfo.endpoint}`, { headers: daemonHeaders });
    if (r.ok) {
      const payload = (await r.json()) as DaemonPayload;
      const candidates = [
        payload[daemonInfo.payloadKey],
        payload.items,
        payload[type], // try kebab-case key as fallback
        Array.isArray(payload) ? payload : null,
      ];
      for (const c of candidates) {
        if (Array.isArray(c)) {
          items = c;
          break;
        }
      }
    }
  } catch {
    // daemon no responde — FS fallback
  }

  if (items.length === 0) {
    source = "fs";
    if (type === "skills") items = await fsListSkills(config.repoPath);
    else if (type === "design-systems") items = await fsListDesignSystems(config.repoPath);
    else if (type === "prompt-templates") items = await fsListPromptTemplates(config.repoPath);
    else if (type === "craft-guides") items = await fsListCraftGuides(config.repoPath);
  }

  // Enriquecer con filePath absoluto + sanitizar campos array-of-strings
  // (algunas skills upstream tienen items malformados en triggers/tags por YAML
  // mal parseado, p.ej. meeting-notes:`{"1": "1 notes"}` en `triggers`).
  const STRING_ARRAY_FIELDS = ["triggers", "tags", "craftRequires", "defaultFor"];
  const sanitized = (items as Record<string, unknown>[]).map((item) => {
    const out: Record<string, unknown> = { ...item };
    // El daemon expone craft guides como `{ id, label, bytes }`, mientras que
    // OdCraftGuide (y CraftGuidesList) esperan `name`. Mapear para que las
    // tarjetas muestren título en lugar de quedar vacías.
    if (type === "craft-guides" && typeof out.label === "string" && out.name == null) {
      out.name = out.label;
    }
    for (const field of STRING_ARRAY_FIELDS) {
      const v = out[field];
      if (Array.isArray(v)) {
        out[field] = v.filter((x): x is string => typeof x === "string");
      }
    }
    return out;
  });
  const enriched = enrichFilePath(type, sanitized as { id?: unknown; filePath?: string }[], config.repoPath);

  res.status(200).json({ items: enriched, count: enriched.length, source });
}
