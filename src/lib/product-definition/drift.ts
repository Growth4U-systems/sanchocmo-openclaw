import fs from "node:fs";
import path from "node:path";
import type { ProductCapabilityManifest } from "./schema";

export type ProductCapabilityDriftKind = "missing-reference" | "review-overdue";

export interface ProductCapabilityDriftFinding {
  capabilityId: string;
  kind: ProductCapabilityDriftKind;
  message: string;
  path?: string;
}

function referencedPaths(manifest: ProductCapabilityManifest): Array<{
  capabilityId: string;
  source: string;
  path: string;
}> {
  return manifest.capabilities.flatMap((capability) => [
    ...capability.sourceFiles.map((sourcePath) => ({
      capabilityId: capability.id,
      source: "sourceFiles",
      path: sourcePath,
    })),
    ...capability.acceptanceTests.map((test) => ({
      capabilityId: capability.id,
      source: `acceptanceTests.${test.id}`,
      path: test.sourcePath,
    })),
    ...capability.uxReferences.map((reference, index) => ({
      capabilityId: capability.id,
      source: `uxReferences.${index}`,
      path: reference.path,
    })),
  ]);
}

export function collectProductCapabilityDrift(
  manifest: ProductCapabilityManifest,
  options: { root?: string; asOf?: Date } = {},
): ProductCapabilityDriftFinding[] {
  const root = path.resolve(options.root ?? process.cwd());
  const asOf = options.asOf ?? new Date();
  const findings: ProductCapabilityDriftFinding[] = [];

  for (const reference of referencedPaths(manifest)) {
    const absolutePath = path.resolve(root, reference.path);
    const insideRoot = absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`);
    let isFile = false;
    try {
      isFile = insideRoot && fs.statSync(absolutePath).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      findings.push({
        capabilityId: reference.capabilityId,
        kind: "missing-reference",
        path: reference.path,
        message: `${reference.source} points to a missing repository file`,
      });
    }
  }

  for (const capability of manifest.capabilities) {
    if (capability.definitionStatus !== "approved") continue;
    const reviewedAt = new Date(`${capability.lastReviewedAt}T00:00:00.000Z`);
    const reviewDueAt = new Date(reviewedAt.getTime() + capability.reviewCadenceDays * 86_400_000);
    if (asOf.getTime() > reviewDueAt.getTime()) {
      findings.push({
        capabilityId: capability.id,
        kind: "review-overdue",
        message: `Approved definition review was due on ${reviewDueAt.toISOString().slice(0, 10)}; review it or mark it stale`,
      });
    }
  }

  return findings.sort((left, right) => (
    left.capabilityId.localeCompare(right.capabilityId)
    || left.kind.localeCompare(right.kind)
    || String(left.path).localeCompare(String(right.path))
  ));
}
