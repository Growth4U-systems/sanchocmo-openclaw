import fs from "fs";
import { readJSON } from "./json-io";
import { CLIENTS_FILE } from "./paths";
import type { Client } from "@/types";

interface ClientsData {
  clients: Client[];
  adminToken: string | null;
  adminEmails?: string[];
  clientAccess?: Record<string, string[]>;
}

/**
 * Atomic write to the clients file that preserves symlinks.
 *
 * Why: on the VPS, `workspace-sancho/clients.json` is a symlink to
 * `config/clients.json` (created by `docker/entrypoint.sh`). A naive
 * `fs.renameSync(tmp, CLIENTS_FILE)` replaces the symlink with a regular
 * file, breaking the source-of-truth pattern and silently diverging the
 * two paths. We resolve the realpath first and write through it so the
 * symlink stays intact.
 *
 * Pattern: write to a `.tmp` next to the resolved target, then rename
 * (rename is atomic on the same filesystem). A `.bak.<ts>` of the existing
 * file is created first so accidental corruptions are recoverable.
 */
export function writeClientsFile(data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  JSON.parse(json);

  const target = fs.existsSync(CLIENTS_FILE) ? fs.realpathSync(CLIENTS_FILE) : CLIENTS_FILE;

  if (fs.existsSync(target)) {
    const backupPath = `${target}.bak.${Date.now()}`;
    fs.copyFileSync(target, backupPath);
  }

  const tmpPath = `${target}.tmp`;
  fs.writeFileSync(tmpPath, json);
  fs.renameSync(tmpPath, target);
}

/**
 * Load the full clients data (clients + adminToken).
 * Used by auth middleware.
 */
export function loadClientsData(): ClientsData {
  return readJSON<ClientsData>(CLIENTS_FILE, { clients: [], adminToken: null });
}

/**
 * Load all clients.
 */
export function loadClients(): Client[] {
  return loadClientsData().clients || [];
}

/**
 * Load a single client by slug.
 */
export function loadClient(slug: string): Client | undefined {
  return loadClients().find((c) => c.slug === slug);
}

/**
 * Get admin token.
 */
export function getAdminToken(): string | null {
  return loadClientsData().adminToken || null;
}
