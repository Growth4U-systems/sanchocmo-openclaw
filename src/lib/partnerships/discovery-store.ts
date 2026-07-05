/**
 * Partnerships discovery · store de búsquedas (SAN-79)
 *
 * Cada búsqueda persiste como `brand/{slug}/outreach/searches/{id}.json`
 * (`DiscoverySearchRecord`): plan + campaignId de Yalc + tarea Outreach +
 * estado del runner. La tarea madre referencia este archivo vía
 * `output_files`, así el chat/MCP/UI resuelven el estado por lookup directo.
 */

import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import type { DiscoveryRunnerState, DiscoverySearchRecord } from "./discovery-types";

export function searchesDir(slug: string): string {
  return path.join(brandDir(slug), "outreach", "searches");
}

export function searchFile(slug: string, searchId: string): string {
  return path.join(searchesDir(slug), `${searchId}.json`);
}

/** Ruta relativa a brand/{slug}/ — para `output_files` de la tarea. */
export function searchRelativePath(searchId: string): string {
  return path.posix.join("outreach", "searches", `${searchId}.json`);
}

export function newSearchId(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `ds-${stamp}-${random}`;
}

export function saveSearch(record: DiscoverySearchRecord): DiscoverySearchRecord {
  const next = { ...record, updatedAt: new Date().toISOString() };
  writeJSON(searchFile(record.slug, record.id), next);
  return next;
}

export function getSearch(slug: string, searchId: string): DiscoverySearchRecord | null {
  const file = searchFile(slug, searchId);
  if (!fs.existsSync(file)) return null;
  return readJSON<DiscoverySearchRecord | null>(file, null);
}

export function listSearches(slug: string): DiscoverySearchRecord[] {
  const dir = searchesDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJSON<DiscoverySearchRecord | null>(path.join(dir, file), null))
    .filter((record): record is DiscoverySearchRecord => Boolean(record && record.id))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function isSearchArchived(search: DiscoverySearchRecord): boolean {
  return Boolean(search.archivedAt);
}

export function archiveSearch(
  slug: string,
  searchId: string,
  reason = "Archivada desde Encuentra",
): DiscoverySearchRecord {
  const record = getSearch(slug, searchId);
  if (!record) throw new Error(`Discovery search not found: ${searchId} (${slug})`);
  return saveSearch({
    ...record,
    archivedAt: record.archivedAt || new Date().toISOString(),
    archiveReason: reason,
  });
}

/** Patch parcial del estado del runner (merge superficial + updatedAt). */
export function updateRunnerState(
  slug: string,
  searchId: string,
  patch: Partial<DiscoveryRunnerState>,
): DiscoverySearchRecord {
  const record = getSearch(slug, searchId);
  if (!record) throw new Error(`Discovery search not found: ${searchId} (${slug})`);
  record.runner = { ...record.runner, ...patch };
  return saveSearch(record);
}
