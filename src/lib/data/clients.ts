import { readJSON } from "./json-io";
import { CLIENTS_FILE } from "./paths";
import type { Client } from "@/types";

interface ClientsData {
  clients: Client[];
  adminToken: string | null;
  adminEmails?: string[];
}

/**
 * Load the full clients data (clients + adminToken).
 * Used by auth middleware.
 */
export function loadClientsData(): ClientsData {
  return readJSON<ClientsData>(CLIENTS_FILE, { clients: [], adminToken: null });
}

/**
 * Load all clients.
 */
export function loadClients(): Client[] {
  return loadClientsData().clients || [];
}

/**
 * Load a single client by slug.
 */
export function loadClient(slug: string): Client | undefined {
  return loadClients().find((c) => c.slug === slug);
}

/**
 * Get admin token.
 */
export function getAdminToken(): string | null {
  return loadClientsData().adminToken || null;
}
