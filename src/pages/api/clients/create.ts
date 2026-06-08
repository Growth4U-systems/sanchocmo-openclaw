import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { brandDir, chatConfigFile, CLIENTS_FILE } from "@/lib/data/paths";
import { writeClientsFile } from "@/lib/data/clients";

type ClientsFileData = {
  clients?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function createClientDirs(slug: string): void {
  const root = brandDir(slug);
  const dirs = [
    root,
    path.join(root, "chat"),
    path.join(root, "idea-generation"),
    path.join(root, "market-and-us", "competitors"),
    path.join(root, "metrics"),
    path.join(root, "monitoring"),
    path.join(root, "projects"),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  seedChatConfig(slug);
}

/**
 * Seed brand/{slug}/chat-config.json from the repo default template so Foundation
 * pillar threads resolve to the right skill+agent (per-brand override point). The
 * hardcoded fallback in src/lib/skill-resolver.ts covers brands without this file,
 * but seeding it keeps the server-side quick-actions and per-brand overrides aligned.
 * Best-effort: never block client creation if the template is missing or unreadable.
 */
function seedChatConfig(slug: string): void {
  const target = chatConfigFile(slug);
  if (fs.existsSync(target)) return;
  const template = path.join(process.cwd(), "config", "chat-config.default.json");
  try {
    if (!fs.existsSync(template)) return;
    fs.copyFileSync(template, target);
  } catch {
    // non-fatal: brands without chat-config.json fall back to skill-resolver defaults
  }
}

/**
 * POST /api/clients/create
 * Admin only — creates a client entry in clients.json and a base brand folder.
 * Body: { slug, name, emoji?, url?, language?, active? }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const slug = normalizeSlug(String(req.body?.slug || ""));
  const name = String(req.body?.name || "").trim();
  const emoji = String(req.body?.emoji || "🏢").trim() || "🏢";
  const url = String(req.body?.url || "").trim();
  const language = String(req.body?.language || "es") === "en" ? "en" : "es";
  const active = req.body?.active !== false;

  if (!name) return res.status(400).json({ error: "Missing client name" });
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug format. Use lowercase letters, numbers, and hyphens." });
  }

  const data = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8")) as ClientsFileData;
  const clients = data.clients || [];
  if (clients.some((client) => client.slug === slug)) {
    return res.status(409).json({ error: `Client "${slug}" already exists` });
  }

  const client: Record<string, unknown> = {
    slug,
    name,
    emoji,
    url,
    active,
    language,
    phase: 0,
    paths: { brand: "brand/" },
    mcToken: crypto.randomBytes(16).toString("hex"),
    metrics: { apis: [] },
  };

  data.clients = [...clients, client];
  writeClientsFile(data);
  createClientDirs(slug);

  return res.status(201).json({
    ok: true,
    client: {
      slug,
      name,
      emoji,
      url,
      active,
      language,
      phase: 0,
    },
  });
}

export default compose(withErrorHandler, withAuth)(handler);
