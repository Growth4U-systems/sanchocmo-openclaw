/**
 * Cuentas remitentes de Unipile (SAN-480) — qué cuenta conectada (Instagram /
 * LinkedIn) firma el DM de Outreach.
 *
 * El envío real lo ejecuta el daemon de Yalc al aprobar el gate
 * `approve-send`; las credenciales UNIPILE_API_KEY/UNIPILE_DSN viven allí,
 * NO en Mission Control. MC solo necesita LISTAR las cuentas conectadas para
 * que el operador elija remitente, y propagar `senderAccountId` en el
 * contacto (`contactPartnerLeads`).
 *
 * Fuente de datos, por orden de preferencia:
 *
 *  1. **Yalc** — `GET /api/unipile/accounts` (CONTRATO hacia delante; el
 *     daemon actual aún no lo expone — hoy solo publica `/api/keys/list`,
 *     que es estado de credenciales por proveedor, sin detalle de cuentas).
 *     Shape esperado (tolerante):
 *       { ok?: true, accounts: [{ id | account_id | accountId,
 *         provider | type | network: "instagram" | "linkedin" | "IG" | ...,
 *         label | name | display_name | username,
 *         status | state: "connected" | "OK" | "CREATION_SUCCESS" | ... }] }
 *     También se aceptan `items: [...]` o el array a pelo.
 *  2. **Config de brand** — env `UNIPILE_SENDER_ACCOUNTS` (JSON con el mismo
 *     shape), resuelto por la cadena estándar brand/.env → workspace/.env →
 *     process.env, con prefijo de slug opcional (`{SLUG}_UNIPILE_SENDER_ACCOUNTS`).
 *  3. Nada → `{ configured: false, accounts: [] }` — la UI oculta el selector
 *     sin romperse.
 *
 * La SELECCIÓN persiste por tenant en `brand/{slug}/outreach/settings.json`
 * (mismo hogar en disco que las plantillas de Outreach, `template-store.ts`).
 */

import path from "path";
import { buildBrandRuntimeEnv } from "@/lib/brand-env";
import { brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import {
  isYalcConfigured,
  resolveYalcConfig,
  yalcFetch,
} from "@/lib/yalc/client";

export type SenderAccountProvider = "instagram" | "linkedin";
export type SenderAccountStatus = "connected" | "disconnected" | "unknown";

export interface SenderAccount {
  id: string;
  provider: SenderAccountProvider;
  label: string;
  status: SenderAccountStatus;
}

export interface SenderAccountsResult {
  /** true cuando alguna fuente devolvió cuentas utilizables. */
  configured: boolean;
  source: "yalc" | "config" | "none";
  accounts: SenderAccount[];
  /** Error de transporte al degradar de Yalc a config (informativo). */
  yalcError?: string;
}

/** Env var (global o `{SLUG}_`-prefijada) con el JSON de cuentas de respaldo. */
export const SENDER_ACCOUNTS_ENV = "UNIPILE_SENDER_ACCOUNTS";

/** Endpoint del daemon de Yalc que lista las cuentas (contrato SAN-480). */
export const YALC_UNIPILE_ACCOUNTS_PATH = "/api/unipile/accounts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value: unknown): SenderAccountProvider | null {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (/instagram|(^|\b)ig(\b|$)/.test(raw)) return "instagram";
  if (/linkedin|(^|\b)li(\b|$)/.test(raw)) return "linkedin";
  return null;
}

function normalizeStatus(value: unknown): SenderAccountStatus {
  const raw = text(value).toLowerCase();
  if (!raw) return "unknown";
  if (/disconnect|error|invalid|revoked|expired|credential|stopped|deleted/.test(raw)) {
    return "disconnected";
  }
  if (/ok|connected|active|success|ready|running|sync/.test(raw)) {
    return "connected";
  }
  return "unknown";
}

function normalizeSenderAccount(value: unknown): SenderAccount | null {
  if (!isRecord(value)) return null;
  const id =
    text(value.id) || text(value.account_id) || text(value.accountId);
  if (!id) return null;
  const provider =
    normalizeProvider(value.provider) ??
    normalizeProvider(value.type) ??
    normalizeProvider(value.network);
  if (!provider) return null;
  const label =
    text(value.label) ||
    text(value.name) ||
    text(value.display_name) ||
    text(value.displayName) ||
    text(value.username) ||
    id;
  const status = normalizeStatus(value.status ?? value.state);
  return { id, provider, label, status };
}

/** Acepta `[...]`, `{ accounts: [...] }` o `{ items: [...] }`. */
export function normalizeSenderAccounts(payload: unknown): SenderAccount[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.accounts)
      ? payload.accounts
      : isRecord(payload) && Array.isArray(payload.items)
        ? payload.items
        : [];
  const seen = new Set<string>();
  const accounts: SenderAccount[] = [];
  for (const row of rows) {
    const account = normalizeSenderAccount(row);
    if (!account || seen.has(account.id)) continue;
    seen.add(account.id);
    accounts.push(account);
  }
  return accounts;
}

function accountsFromBrandConfig(slug: string): SenderAccount[] {
  const env = buildBrandRuntimeEnv(slug);
  const raw = env[SENDER_ACCOUNTS_ENV];
  if (!raw) return [];
  try {
    return normalizeSenderAccounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Lista las cuentas remitentes conectadas para un cliente.
 * Nunca lanza: degrada Yalc → config de brand → `configured:false`.
 */
export async function listSenderAccounts(
  slug: string,
  options: { signal?: AbortSignal } = {},
): Promise<SenderAccountsResult> {
  let yalcError: string | undefined;

  if (isYalcConfigured(slug)) {
    try {
      const payload = await yalcFetch<unknown>(
        resolveYalcConfig(slug),
        YALC_UNIPILE_ACCOUNTS_PATH,
        { signal: options.signal },
      );
      const accounts = normalizeSenderAccounts(payload);
      if (accounts.length > 0) {
        return { configured: true, source: "yalc", accounts };
      }
    } catch (err) {
      // El daemon actual aún no expone el endpoint (404) o está caído —
      // seguimos con el respaldo de configuración sin romper la UI.
      yalcError = err instanceof Error ? err.message : "YALC unreachable";
    }
  }

  const fallback = accountsFromBrandConfig(slug);
  if (fallback.length > 0) {
    return { configured: true, source: "config", accounts: fallback, yalcError };
  }
  return { configured: false, source: "none", accounts: [], yalcError };
}

// ── Persistencia de la selección por tenant ──────────────────────────────

interface OutreachSettingsFile {
  senderAccountId?: string | null;
  updatedAt?: string;
}

export function outreachSettingsFile(slug: string): string {
  return path.join(brandDir(slug), "outreach", "settings.json");
}

export function getSenderAccountSelection(slug: string): string | null {
  const settings = readJSON<OutreachSettingsFile>(outreachSettingsFile(slug), {});
  const id = text(settings.senderAccountId);
  return id || null;
}

export function saveSenderAccountSelection(
  slug: string,
  senderAccountId: string | null,
): string | null {
  const file = outreachSettingsFile(slug);
  const settings = readJSON<OutreachSettingsFile>(file, {});
  const id = text(senderAccountId);
  writeJSON(file, {
    ...settings,
    senderAccountId: id || null,
    updatedAt: new Date().toISOString(),
  });
  return id || null;
}
