/**
 * Partnerships discovery · modo fixture (SAN-79)
 *
 * Carga los 9 creators fake del mockup (seeds de calc-creator-core) para
 * ejecutar el runner end-to-end SIN llamar a ScrapeCreators. Es el camino
 * que usan los tests y el verificador del DoD.
 *
 * Activación:
 *  - flag explícito (`--fixtures` en el script, `fixtures: true` en el
 *    endpoint/tool MCP), o
 *  - env `DISCOVERY_FIXTURES=1|true`.
 */

import fs from "fs";
import fixtureFile from "./fixtures/discovery-creators.json";
import { normalizeCandidates } from "./discovery-normalize";
import type { RawDiscoveryCandidate } from "./discovery-types";

/** ¿Está activado el modo fixture por entorno? */
export function fixturesEnabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.DISCOVERY_FIXTURES || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Carga y normaliza los candidatos del fixture (o de un JSON alternativo). */
export function loadFixtureCandidates(file?: string): RawDiscoveryCandidate[] {
  const raw: unknown = file ? (JSON.parse(fs.readFileSync(file, "utf-8")) as unknown) : fixtureFile;
  const { candidates } = normalizeCandidates(raw);
  if (candidates.length === 0) {
    throw new Error(`Fixture source has no usable candidates${file ? `: ${file}` : ""}`);
  }
  return candidates;
}
