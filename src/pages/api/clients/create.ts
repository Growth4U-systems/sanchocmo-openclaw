import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { brandDir, chatConfigFile, CLIENTS_FILE } from "@/lib/data/paths";
import { writeClientsFile } from "@/lib/data/clients";
import { provisionYalcBrain } from "@/lib/yalc/provision";
import { FOUNDATION_TASK_SET_KEYS, instantiateFoundationProject } from "@/lib/data/task-blueprints";
import { applyProjectAnchors, applyTaskAnchors } from "@/lib/data/task-create-helpers";
import { seedClientConfig } from "@/lib/data/client-config-seed";

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
  seedFoundationProjects(slug);
}

/**
 * Seed the 4 canonical Foundation projects (P00-Company-Brief, P00-Full-
 * Foundation, P00-Metrics, P00-Strategic-Plan) with their pillar tasks from
 * the declarative registry (SAN-183 F5: every Foundation pillar is a task
 * 1:1; task.status is becoming the single status source). Idempotent — an
 * existing project directory with tasks.json is left untouched. Best-effort:
 * never block client creation.
 */
function seedFoundationProjects(slug: string): void {
  for (const setKey of FOUNDATION_TASK_SET_KEYS) {
    try {
      const { project, tasks } = instantiateFoundationProject(setKey, { slug });
      const projDir = path.join(brandDir(slug), "projects", project.id);
      if (fs.existsSync(path.join(projDir, "tasks.json"))) continue;
      fs.mkdirSync(projDir, { recursive: true });
      applyProjectAnchors(slug, project);
      const anchored = tasks.map((t) => applyTaskAnchors(slug, t));
      fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify(project, null, 2));
      fs.writeFileSync(path.join(projDir, "tasks.json"), JSON.stringify(anchored, null, 2));
    } catch (err) {
      console.error(`[clients/create] Foundation project seed failed (${setKey}, ${slug}):`, err);
    }
  }
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

  // Sembrar client-config.json con los crons de auto-onboarding (default-on, p.ej.
  // Trust Score refresh) para que el cliente quede cron-ready (SAN-309). Best-effort.
  seedClientConfig(slug, name, language);

  // Auto-provision the brand's YALC brain from its website — no CLI, no manual
  // step. Fire-and-forget so brand creation isn't blocked by YALC synthesis;
  // a missing/late website just no-ops (re-sync later via /api/yalc/provision).
  void provisionYalcBrain(slug, { website: url }).catch((err) =>
    console.error(`[clients/create] YALC brain provisioning failed for ${slug}:`, err),
  );

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
