/**
 * Validates the canonical Product Definition Registry and detects drift in its
 * source, test and UX references. Approved definitions also become findings
 * when their review cadence expires.
 *
 * Usage:
 *   tsx scripts/check-product-capabilities.mts [--strict] [--as-of=YYYY-MM-DD]
 */
import fs from "node:fs";
import path from "node:path";
import { collectProductCapabilityDrift } from "../src/lib/product-definition/drift";
import { parseProductCapabilityManifest } from "../src/lib/product-definition/manifest";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const asOfArgument = process.argv.find((argument) => argument.startsWith("--as-of="));
const asOfValue = asOfArgument?.slice("--as-of=".length);
const asOf = asOfValue ? new Date(`${asOfValue}T00:00:00.000Z`) : new Date();

if (Number.isNaN(asOf.getTime())) {
  console.error(`Invalid --as-of date: ${asOfValue}`);
  process.exit(2);
}

const manifestPath = path.join(root, "config", "product-capability-manifest.json");
let raw: unknown;
try {
  raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`Unable to read ${path.relative(root, manifestPath)}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

let manifest;
try {
  manifest = parseProductCapabilityManifest(raw);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const findings = collectProductCapabilityDrift(manifest, { root, asOf });
console.log(
  `check:product-capabilities — validated ${manifest.capabilities.length} capabilities (manifest v${manifest.version})`,
);
const statusSummary = Object.entries(
  manifest.capabilities.reduce<Record<string, number>>((counts, capability) => {
    counts[capability.definitionStatus] = (counts[capability.definitionStatus] ?? 0) + 1;
    return counts;
  }, {}),
).map(([status, count]) => `${status}=${count}`).join(", ");
const openGapCount = manifest.capabilities.reduce(
  (count, capability) => count + capability.definitionGaps.length,
  0,
);
console.log(`definition states: ${statusSummary}; declared gaps=${openGapCount}`);

if (findings.length === 0) {
  console.log("✓ schema, references and review cadence are current");
  process.exit(0);
}

for (const finding of findings) {
  const location = finding.path ? ` (${finding.path})` : "";
  console.log(`✗ ${finding.capabilityId}: ${finding.message}${location}`);
}
console.log(`${findings.length} finding(s). ${strict ? "Failing (--strict)." : "Report-only; pass --strict to fail."}`);
process.exit(strict ? 1 : 0);
