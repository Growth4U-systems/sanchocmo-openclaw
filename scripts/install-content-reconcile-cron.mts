/**
 * Install the "Content Reconcile — All Brands (15min)" cron job (SAN-153).
 *
 * `cron/jobs.json` is runtime data (volume, gitignored), so the job can't
 * ship in the repo — this script inserts it idempotently. Run once per
 * environment after deploying the reconciler endpoints:
 *
 *   npx tsx scripts/install-content-reconcile-cron.mts [path/to/jobs.json]
 *
 * Default target: $OPENCLAW_HOME/cron/jobs.json, else ~/.openclaw/cron/jobs.json.
 * The job is a deliberate clone of "Publishing Reconcile — All Brands (10min)":
 * an isolated haiku agentTurn whose prompt is a single curl — the most
 * deterministic job shape OpenClaw supports (no shell-only kind exists).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const JOB_NAME = "Content Reconcile — All Brands (15min)";

const target =
  process.argv[2] ||
  path.join(
    process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw"),
    "cron",
    "jobs.json",
  );

if (!fs.existsSync(target)) {
  console.error(`jobs.json not found at ${target} — pass the path as an argument.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(target, "utf-8")) as {
  version: number;
  jobs: Array<Record<string, unknown>>;
};

if (data.jobs.some((j) => j.name === JOB_NAME)) {
  console.log(`"${JOB_NAME}" already installed at ${target} — nothing to do.`);
  process.exit(0);
}

data.jobs.push({
  id: crypto.randomUUID(),
  agentId: "sancho",
  name: JOB_NAME,
  enabled: true,
  createdAtMs: Date.now(),
  schedule: { kind: "cron", expr: "*/15 * * * *", tz: "Europe/Madrid" },
  sessionTarget: "isolated",
  wakeMode: "now",
  payload: {
    kind: "agentTurn",
    message: [
      "Content reconcile — todas las marcas. Ejecuta UN solo paso y termina.",
      "",
      "PASO 1 — Llamar al reconciler del content pipeline:",
      "Ejecuta este comando con Bash y captura el JSON:",
      "  curl -s -X POST 'http://localhost:3000/api/content-engine/reconcile-all'",
      "",
      'Respuesta esperada: {"ok":true,"brands_scanned":N,"promoted_total":M,"desyncs_total":K,"by_brand":[...],"errors":[...]}',
      "Si la respuesta no es JSON válido o ok!=true, considera el run como error.",
      "",
      "PASO 2 — NO escribas nada. NO publiques en Discord. Solo termina con un resumen de UNA línea: 'OK · {brands_scanned} marcas · {promoted_total} promovidas · {desyncs_total} desyncs · {len(errors)} errores'.",
    ].join("\n"),
    model: "claude-haiku-4-5",
    lightContext: true,
  },
  delivery: { mode: "none", channel: "mc-chat" },
  state: {},
});

fs.writeFileSync(target, JSON.stringify(data, null, 2));
console.log(`Installed "${JOB_NAME}" into ${target} (${data.jobs.length} jobs total).`);
