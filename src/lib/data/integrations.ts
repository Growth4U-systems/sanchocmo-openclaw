import fs from "fs";
import path from "path";
import { readJSON, writeJSON } from "./json-io";
import { integrationsFile } from "./paths";
import { BASE } from "./paths";
import type { Integration, SlackIntegration } from "@/types";
import { decryptToken } from "@/lib/encryption";

export function loadIntegrations(slug: string): Integration {
  return readJSON<Integration>(integrationsFile(slug), {
    client: slug,
    dataSources: {},
    updatedAt: new Date().toISOString(),
  });
}

export function saveIntegrations(slug: string, data: Integration): void {
  data.updatedAt = new Date().toISOString();
  writeJSON(integrationsFile(slug), data);
}

export function saveSlackIntegration(slug: string, slack: SlackIntegration): void {
  const data = loadIntegrations(slug);
  data.slack = slack;
  data.dataSources = data.dataSources || {};
  data.dataSources.slack = {
    provider: "slack",
    status: slack.status,
    config: {
      WORKSPACE: slack.team_name,
      TEAM_ID: slack.team_id,
    },
    envVars: [],
    lastTestedAt: slack.installed_at,
  };
  saveIntegrations(slug, data);
}

export function getSlackBotToken(slug: string): string | null {
  const data = loadIntegrations(slug);
  if (!data.slack || data.slack.status !== "connected") return null;
  return decryptToken(data.slack.bot_token_encrypted);
}

export function disconnectSlack(slug: string): void {
  const data = loadIntegrations(slug);
  if (data.slack) {
    data.slack.status = "disconnected";
    data.dataSources = data.dataSources || {};
    data.dataSources.slack = {
      ...(data.dataSources.slack || {
        provider: "slack",
        config: {},
        envVars: [],
        lastTestedAt: new Date().toISOString(),
      }),
      status: "disconnected",
      lastTestedAt: new Date().toISOString(),
    };
    saveIntegrations(slug, data);
  }
}

// Reverse lookup: given a Slack team_id, find which client slug owns that
// integration. Used by /events and /interactivity to route per-tenant.
// Linear scan over brand/*/integrations.json — fine for <100 clients.
export function findSlugByTeamId(teamId: string): string | null {
  const brandRoot = path.join(BASE, "brand");
  let entries: string[];
  try {
    entries = fs.readdirSync(brandRoot);
  } catch {
    return null;
  }
  for (const slug of entries) {
    if (slug.startsWith(".") || slug.startsWith("_")) continue;
    const file = path.join(brandRoot, slug, "integrations.json");
    if (!fs.existsSync(file)) continue;
    try {
      const data = readJSON<Integration>(file, { client: slug, dataSources: {}, updatedAt: "" });
      if (data.slack?.team_id === teamId && data.slack?.status === "connected") {
        return slug;
      }
    } catch {
      // ignore unreadable files
    }
  }
  return null;
}
