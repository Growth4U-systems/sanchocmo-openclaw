#!/usr/bin/env tsx
import { loadClients } from "../src/lib/data/clients";
import { ensureMeetingIntelligenceSetupTask } from "../src/lib/data/meeting-intelligence-setup";

const includeInactive = process.argv.includes("--include-inactive");
const dryRun = process.argv.includes("--dry-run");

const clients = loadClients().filter((client) => includeInactive || client.active !== false);
const results = clients.map((client) => {
  if (dryRun) return { slug: client.slug, dryRun: true };
  const info = ensureMeetingIntelligenceSetupTask(client.slug);
  return {
    slug: client.slug,
    projectId: info.project.id,
    taskId: info.task.id,
    created: info.created,
    legacyTaskCount: info.legacyTaskCount,
  };
});

console.table(results);
