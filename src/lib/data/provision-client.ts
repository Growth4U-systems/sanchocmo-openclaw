/**
 * Brand provisioning — the on-disk scaffolding a brand needs to be operable:
 * the brand/<slug>/ directory tree, chat-config.json, the Foundation projects +
 * pillar tasks, and the auto-onboarding crons.
 *
 * Single source of truth shared by:
 *   - the UI create-client handler (`src/pages/api/clients/create.ts`), and
 *   - the boot-time reconciler (`ensureAllClientsProvisioned`, run from
 *     `src/instrumentation.ts`) that backfills brands written WITHOUT going
 *     through the UI — e.g. the setup wizard's first brand, which only writes
 *     the `clients.json` entry. Before this, a wizard-created brand booted inert
 *     (no Foundation tasks, no crons). (SAN-336)
 *
 * Every step is idempotent (skip-if-exists) and best-effort (never throws), so
 * it is safe to run on every boot and self-heals a partially-provisioned brand.
 * It NEVER touches clients.json — the caller owns the client entry.
 */
import fs from "fs";
import path from "path";
import { brandDir, chatConfigFile, CLIENTS_FILE, integrationsFile } from "@/lib/data/paths";
import { FOUNDATION_TASK_SET_KEYS, instantiateFoundationProject } from "@/lib/data/task-blueprints";
import { applyProjectAnchors, applyTaskAnchors } from "@/lib/data/task-create-helpers";
import { seedClientConfig } from "@/lib/data/client-config-seed";

/**
 * Seed brand/{slug}/chat-config.json from the repo default template so Foundation
 * pillar threads resolve to the right skill+agent (per-brand override point). The
 * hardcoded fallback in src/lib/skill-resolver.ts covers brands without this file,
 * but seeding it keeps the server-side quick-actions and per-brand overrides aligned.
 * Best-effort: never block provisioning if the template is missing or unreadable.
 */
export function seedChatConfig(slug: string): void {
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
 * Seed the canonical Foundation projects (P00-Company-Brief, P00-Site-Audit,
 * P00-Full-Foundation, P00-Metrics, P00-Strategic-Plan) with their pillar tasks
 * from the declarative registry (SAN-183 F5: every Foundation pillar is a task
 * 1:1; task.status is the single status source). Idempotent — an existing project
 * directory with tasks.json is left untouched. Best-effort per set.
 */
export function seedFoundationProjects(slug: string): void {
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
      console.error(`[provision-client] Foundation project seed failed (${setKey}, ${slug}):`, err);
    }
  }
}

export function seedIntegrations(slug: string): void {
  const target = integrationsFile(slug);
  if (fs.existsSync(target)) return;
  try {
    fs.writeFileSync(target, JSON.stringify({
      client: slug,
      dataSources: {},
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // non-fatal: readers already tolerate a missing integrations.json
  }
}

/**
 * Create the brand/{slug}/ directory tree and seed its chat-config + Foundation
 * projects. Idempotent (mkdir recursive, skip-if-exists in the seeders).
 */
export function createClientDirs(slug: string): void {
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
  seedIntegrations(slug);
  seedFoundationProjects(slug);
}

export interface ProvisionClientOpts {
  name: string;
  language?: string;
}

/**
 * Provision a brand's on-disk scaffolding: directory tree + chat-config +
 * Foundation projects/tasks + auto-onboarding crons. Idempotent and best-effort.
 * Does NOT write clients.json and does NOT do YALC sync (the UI handler fires
 * that fire-and-forget; the boot reconciler skips it to avoid startup network).
 */
export function provisionClient(slug: string, opts: ProvisionClientOpts): void {
  createClientDirs(slug);
  seedClientConfig(slug, opts.name, opts.language === "en" ? "en" : "es");
}

/**
 * A brand counts as provisioned once at least one Foundation project with a
 * tasks.json exists. (chat-config alone is too weak: createClientDirs writes it
 * before the projects, so a crash between would falsely read as provisioned.)
 */
export function isClientProvisioned(slug: string): boolean {
  const projects = path.join(brandDir(slug), "projects");
  try {
    return fs
      .readdirSync(projects, { withFileTypes: true })
      .some((d) => d.isDirectory() && fs.existsSync(path.join(projects, d.name, "tasks.json")));
  } catch {
    return false;
  }
}

/**
 * Backfill provisioning for every client in clients.json that isn't provisioned
 * yet. Run once per server start (instrumentation). Best-effort per client — one
 * bad entry never blocks the others or the boot. Returns the slugs it provisioned.
 */
export function ensureAllClientsProvisioned(): { provisioned: string[]; skipped: number } {
  const result = { provisioned: [] as string[], skipped: 0 };
  let data: { clients?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
  } catch {
    return result; // no clients.json yet (pre-wizard) — nothing to do
  }
  const clients = Array.isArray(data?.clients) ? data.clients : [];
  for (const client of clients) {
    const slug = typeof client?.slug === "string" ? client.slug : "";
    if (!slug) continue;
    if (isClientProvisioned(slug)) {
      result.skipped++;
      continue;
    }
    try {
      provisionClient(slug, {
        name: typeof client?.name === "string" ? client.name : slug,
        language: typeof client?.language === "string" ? client.language : "es",
      });
      result.provisioned.push(slug);
    } catch (err) {
      console.error(`[provision-client] failed to provision "${slug}":`, err);
    }
  }
  return result;
}
