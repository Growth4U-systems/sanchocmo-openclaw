import { readJSON, writeJSON } from "./json-io";
import { integrationsFile } from "./paths";
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
    saveIntegrations(slug, data);
  }
}
