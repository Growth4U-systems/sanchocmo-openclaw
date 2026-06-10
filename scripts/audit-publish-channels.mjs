#!/usr/bin/env node
/**
 * audit-publish-channels.mjs — post-deploy checklist for D5.
 *
 * Lists, per brand, which *publishing* crons (templates whose prompt posts to
 * /api/integrations/publish) have a Slack publish_channel configured vs. which
 * are missing or still point at a Discord id. Use right after deploying the
 * configurable-publish-channel change to see what to set in Recurring Tasks →
 * 📢 Canal (see docs/plans/d5-g4u-publish-cutover.md).
 *
 * Usage:
 *   node scripts/audit-publish-channels.mjs                  # uses $MC_WORKSPACE or ./workspace-sancho
 *   MC_WORKSPACE=/root/.openclaw/workspace-sancho node scripts/audit-publish-channels.mjs
 *   node scripts/audit-publish-channels.mjs --workspace <path>
 *
 * Exit code 0 always (report only). Non-Slack/missing rows are flagged ⚠️/❌.
 */
import fs from "node:fs";
import path from "node:path";

const argIdx = process.argv.indexOf("--workspace");
const WORKSPACE = (argIdx !== -1 && process.argv[argIdx + 1])
  || process.env.MC_WORKSPACE
  || "workspace-sancho";

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return fallback; }
}

// Publishing cronKeys = templates whose prompt posts to the publish endpoint.
const templates = readJson(path.join(WORKSPACE, "_system", "cron-templates.json"), {});
const publishingKeys = Object.entries(templates)
  .filter(([k, t]) => k !== "$comment" && t && typeof t.prompt === "string" && t.prompt.includes("/api/integrations/publish"))
  .map(([k]) => k);

if (publishingKeys.length === 0) {
  console.error(`No publishing templates found under ${WORKSPACE}/_system/cron-templates.json — wrong workspace path?`);
  process.exit(0);
}

// Slack channel ids start with C/G/D (uppercase). Discord ids are 17-19 digits.
function classify(channel) {
  if (!channel) return { ok: false, mark: "❌", note: "sin canal" };
  if (/^[CGD][A-Z0-9]{6,}$/.test(channel)) return { ok: true, mark: "✅", note: "slack" };
  if (/^\d{17,20}$/.test(channel)) return { ok: false, mark: "⚠️", note: "parece Discord id — re-configurar a Slack" };
  return { ok: false, mark: "⚠️", note: `no parece un Slack channel id ("${channel}")` };
}

const brandRoot = path.join(WORKSPACE, "brand");
let brands = [];
try {
  brands = fs.readdirSync(brandRoot).filter((d) => !d.startsWith(".") && !d.startsWith("_"));
} catch {
  console.error(`No brand/ dir under ${WORKSPACE}`);
  process.exit(0);
}

console.log(`Publish-channel audit · workspace=${WORKSPACE}`);
console.log(`Publishing crons: ${publishingKeys.join(", ")}\n`);

let needsAction = 0;
for (const slug of brands.sort()) {
  const cfg = readJson(path.join(brandRoot, slug, "client-config.json"), null);
  if (!cfg) continue;
  const crons = cfg.crons || {};
  // Only report crons this brand actually has configured (an entry under crons).
  const present = publishingKeys.filter((k) => crons[k]);
  if (present.length === 0) continue;

  const rows = present.map((k) => {
    const c = classify(crons[k]?.publish_channel);
    if (!c.ok) needsAction += 1;
    const name = crons[k]?.publish_channel_name ? ` (${crons[k].publish_channel_name})` : "";
    return `  ${c.mark} ${k}: ${crons[k]?.publish_channel || "—"}${name} — ${c.note}`;
  });
  console.log(`${slug}:`);
  console.log(rows.join("\n"));
  console.log("");
}

console.log(needsAction === 0
  ? "All configured publishing crons have a Slack channel. ✅"
  : `${needsAction} cron(s) need a Slack channel set (Recurring Tasks → 📢 Canal).`);
