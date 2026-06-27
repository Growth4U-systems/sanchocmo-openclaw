#!/usr/bin/env node
import fs from "fs";
import path from "path";

const workspace = process.env.MC_WORKSPACE || process.cwd();
const brandRoot = path.join(workspace, "brand");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

let clients = [];
try {
  clients = fs.readdirSync(brandRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_"))
    .map((entry) => entry.name);
} catch {
  clients = [];
}

let touched = 0;
let created = 0;
let synced = 0;

for (const slug of clients) {
  const file = path.join(brandRoot, slug, "integrations.json");
  const existed = fs.existsSync(file);
  const data = readJson(file, {
    client: slug,
    dataSources: {},
    updatedAt: new Date().toISOString(),
  });

  let changed = false;
  if (!data.client) {
    data.client = slug;
    changed = true;
  }
  if (!data.dataSources || typeof data.dataSources !== "object") {
    data.dataSources = {};
    changed = true;
  }

  if (data.slack?.status) {
    const next = {
      provider: "slack",
      status: data.slack.status,
      config: {
        WORKSPACE: data.slack.team_name,
        TEAM_ID: data.slack.team_id,
      },
      envVars: [],
      lastTestedAt: data.slack.installed_at || data.updatedAt || new Date().toISOString(),
    };
    if (JSON.stringify(data.dataSources.slack || null) !== JSON.stringify(next)) {
      data.dataSources.slack = next;
      changed = true;
      synced++;
    }
  }

  if (!existed || changed) {
    data.updatedAt = new Date().toISOString();
    writeJson(file, data);
    touched++;
    if (!existed) created++;
  }
}

console.log(JSON.stringify({ workspace, clients: clients.length, touched, created, synced }, null, 2));
