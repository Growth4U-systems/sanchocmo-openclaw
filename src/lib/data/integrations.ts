import { readJSON, writeJSON } from "./json-io";
import { integrationsFile } from "./paths";
import type { Integration } from "@/types";

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
