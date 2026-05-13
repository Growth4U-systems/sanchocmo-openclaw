import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import {
  dependencyIds,
  inferTaskExecutionContract,
  normalizeAgentSlug,
  type TaskDocumentRef,
} from "../src/lib/data/task-execution-contract";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv();

type DbTaskRow = Record<string, any>;

function toTaskInput(row: DbTaskRow) {
  return {
    id: row.id,
    brand_slug: row.brandSlug,
    type: row.type,
    status: row.status,
    name: row.name,
    slug: row.slug,
    owner: row.owner,
    agent: row.agent,
    skill: row.skill,
    skills: row.skills,
    channel: row.channel,
    tool: row.tool,
    strategy: row.strategy,
    pillar: row.pillar,
    deliverable: row.deliverable,
    deliverable_file: row.deliverableFile,
    output_files: row.outputFiles,
    documents: row.documents,
    attachments: row.attachments,
    input_documents: row.inputDocuments,
    required_inputs: row.requiredInputs,
    output_documents: row.outputDocuments,
    depends_on: row.dependsOn,
    idea_id: row.ideaId,
    target_channels: row.targetChannels,
  };
}

function asLegacyExtras(row: DbTaskRow, agent: string) {
  const extras = row.legacyExtras && typeof row.legacyExtras === "object" && !Array.isArray(row.legacyExtras)
    ? { ...(row.legacyExtras as Record<string, unknown>) }
    : {};
  const ownerSlug = normalizeAgentSlug(row.owner);
  if (row.owner && ownerSlug && ownerSlug !== agent && !extras.previous_owner) {
    extras.previous_owner = row.owner;
  }
  return extras;
}

async function main() {
  const { db } = await import("../src/db/drizzle");
  const { tasks: tasksTable } = await import("../src/db/schema");
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;
  const rows = await db.select().from(tasksTable);
  const outputByWorkspaceBrandId = new Map<string, TaskDocumentRef[]>();

  for (const row of rows) {
    const contract = inferTaskExecutionContract(toTaskInput(row), { brandSlug: row.brandSlug });
    outputByWorkspaceBrandId.set(`${row.workspaceSlug}:${row.brandSlug}:${row.id}`, contract.outputDocuments);
  }

  const updates: Array<{
    row: DbTaskRow;
    agent: string;
    skill: string;
    skills: string[];
    inputDocuments: TaskDocumentRef[];
    requiredInputs: unknown[];
    outputDocuments: TaskDocumentRef[];
  }> = [];

  for (const row of rows) {
    const dependencyOutputs = dependencyIds(row.dependsOn).flatMap((depId) => {
      const direct = outputByWorkspaceBrandId.get(`${row.workspaceSlug}:${row.brandSlug}:${depId}`);
      if (direct) return direct;
      if (row.parentId && !depId.startsWith(row.parentId)) {
        return outputByWorkspaceBrandId.get(`${row.workspaceSlug}:${row.brandSlug}:${row.parentId}-${depId}`) || [];
      }
      return [];
    });
    const contract = inferTaskExecutionContract(toTaskInput(row), {
      brandSlug: row.brandSlug,
      dependencyOutputs,
    });
    updates.push({
      row,
      agent: contract.agent,
      skill: contract.skill,
      skills: contract.skills,
      inputDocuments: contract.inputDocuments,
      requiredInputs: contract.requiredInputs,
      outputDocuments: contract.outputDocuments,
    });
  }

  const missing = {
    agent: updates.filter((u) => !u.agent).length,
    skill: updates.filter((u) => !u.skill).length,
    skills: updates.filter((u) => u.skills.length === 0).length,
    outputDocuments: updates.filter((u) => u.outputDocuments.length === 0).length,
  };

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    rows: rows.length,
    missingAfterBackfill: missing,
    sample: updates.slice(0, 8).map((u) => ({
      id: u.row.id,
      type: u.row.type,
      agent: u.agent,
      skill: u.skill,
      skills: u.skills,
      outputDocuments: u.outputDocuments.map((doc) => doc.path),
    })),
  }, null, 2));

  if (dryRun) return;

  for (const update of updates) {
    await db.update(tasksTable)
      .set({
        agent: update.agent,
        skill: update.skill,
        skills: update.skills,
        inputDocuments: update.inputDocuments,
        requiredInputs: update.requiredInputs,
        outputDocuments: update.outputDocuments,
        legacyExtras: asLegacyExtras(update.row, update.agent),
        updatedAt: new Date(),
      })
      .where(eq(tasksTable.sourceKey, update.row.sourceKey));
  }

  console.log(`Backfilled ${updates.length} tasks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
