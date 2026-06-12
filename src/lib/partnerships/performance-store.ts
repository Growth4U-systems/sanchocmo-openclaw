/**
 * Performance por creator · store (SAN-81).
 *
 * Los registros persisten en `brand/{slug}/outreach/performance.json`
 * (mismo patrón de stores file-based que discovery-store/template-store).
 * Hoy los escribe el seed (`ensurePerformanceSeed`); en Fase 2 (SAN-82) los
 * escribirá el tracking real (Impact) con `source: "impact"`.
 */

import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import type { CreatorPerformanceRecord } from "./creator-report";
import { materializePerformanceSeeds } from "./performance-seeds";

interface PerformanceFilePayload {
  records: CreatorPerformanceRecord[];
}

export function performanceFile(slug: string): string {
  return path.join(brandDir(slug), "outreach", "performance.json");
}

export function loadPerformance(slug: string): CreatorPerformanceRecord[] {
  const file = performanceFile(slug);
  if (!fs.existsSync(file)) return [];
  const payload = readJSON<PerformanceFilePayload | null>(file, null);
  return Array.isArray(payload?.records) ? payload.records : [];
}

export function savePerformance(slug: string, records: CreatorPerformanceRecord[]): void {
  writeJSON(performanceFile(slug), { records } satisfies PerformanceFilePayload);
}

/**
 * Siembra (o refresca) los registros de performance del mockup. Idempotente
 * y re-ejecutable: los registros `source: "seed"` se regeneran con fechas
 * relativas a `now` (la demo cae siempre en las ventanas 30/90); los
 * registros de otras fuentes (p.ej. `impact`, Fase 2) no se tocan.
 */
export function ensurePerformanceSeed(
  slug: string,
  now: Date = new Date(),
): { records: CreatorPerformanceRecord[]; seeded: number } {
  const existing = loadPerformance(slug);
  const seeds = materializePerformanceSeeds(now);
  const seedHandles = new Set(seeds.map((record) => record.handle));
  const kept = existing.filter(
    (record) => record.source !== "seed" && !seedHandles.has(record.handle),
  );
  const records = [...kept, ...seeds];
  savePerformance(slug, records);
  return { records, seeded: seeds.length };
}
