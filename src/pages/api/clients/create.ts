import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import fs from "fs";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { CLIENTS_FILE } from "@/lib/data/paths";
import { writeClientsFile } from "@/lib/data/clients";
import { provisionYalcBrain } from "@/lib/yalc/provision";
import { provisionClient } from "@/lib/data/provision-client";

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

  // Provision the brand's on-disk scaffolding: dir tree, chat-config, Foundation
  // projects/tasks, and auto-onboarding crons (SAN-309/SAN-336). Shared with the
  // boot reconciler so a wizard-created brand ends up identical to a UI one.
  provisionClient(slug, { name, language });

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
