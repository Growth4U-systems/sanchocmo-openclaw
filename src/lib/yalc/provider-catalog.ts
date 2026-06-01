export const YALC_PROVIDER_API_PREFIX = "yalc-provider:";

export interface YalcProviderEnvVar {
  name: string;
  description?: string;
  example?: string;
  required?: boolean;
}

export interface YalcProviderKnowledge {
  id: string;
  display_name?: string;
  homepage?: string | null;
  docs_url?: string | null;
  key_acquisition_url?: string | null;
  integration_kind?: string;
  env_vars?: YalcProviderEnvVar[];
  install_steps?: string[];
}

export interface YalcKnowledgePayload {
  providers?: YalcProviderKnowledge[];
}

export interface CredentialField {
  key: string;
  label: string;
  type: "string";
  help?: string;
  sensitive: boolean;
  required: boolean;
  placeholder?: string;
}

export interface ApiCatalogEntry {
  id: string;
  name: string;
  provider: string;
  description: string;
  desc: string;
  icon: string;
  ownership: "client" | "system";
  authType: "api_key";
  docs?: string;
  docsUrl?: string;
  credentials: CredentialField[];
  config: CredentialField[];
}

export interface ApiCatalogCategory {
  label: string;
  apis: Record<string, ApiCatalogEntry>;
}

export interface ApiCatalog {
  categories: Record<string, ApiCatalogCategory>;
}

export function toYalcProviderApiId(providerId: string): string {
  return `${YALC_PROVIDER_API_PREFIX}${providerId}`;
}

export function parseYalcProviderApiId(apiId: unknown): string | null {
  if (typeof apiId !== "string" || !apiId.startsWith(YALC_PROVIDER_API_PREFIX)) {
    return null;
  }
  const provider = apiId.slice(YALC_PROVIDER_API_PREFIX.length);
  return /^[a-z][a-z0-9-]*$/.test(provider) ? provider : null;
}

export function isYalcProviderApiId(apiId: unknown): boolean {
  return parseYalcProviderApiId(apiId) !== null;
}

export function mergeYalcProvidersIntoCatalog(
  catalog: ApiCatalog,
  knowledge: YalcKnowledgePayload,
): ApiCatalog {
  const categories = { ...(catalog.categories || {}) };
  const yalcApis: Record<string, ApiCatalogEntry> = {};

  for (const provider of knowledge.providers || []) {
    const entry = yalcProviderToCatalogEntry(provider);
    if (entry) yalcApis[entry.id] = entry;
  }

  if (Object.keys(yalcApis).length === 0) {
    return { ...catalog, categories };
  }

  categories.yalc_providers = {
    label: "🧭 YALC: APIs outbound",
    apis: {
      ...(categories.yalc_providers?.apis || {}),
      ...yalcApis,
    },
  };

  return { ...catalog, categories };
}

export function yalcProviderToCatalogEntry(
  provider: YalcProviderKnowledge,
): ApiCatalogEntry | null {
  if (!provider.id || !/^[a-z][a-z0-9-]*$/.test(provider.id)) return null;

  const envVars = (provider.env_vars || []).filter((field) =>
    /^[A-Z][A-Z0-9_]*$/.test(field.name || ""),
  );
  if (envVars.length === 0) return null;

  const apiId = toYalcProviderApiId(provider.id);
  const displayName = provider.display_name || provider.id;
  const docsUrl = provider.docs_url || provider.key_acquisition_url || provider.homepage || undefined;
  const description = `Credenciales que YALC necesita para usar ${displayName} en campañas, datos y automatizaciones outbound.`;

  return {
    id: apiId,
    name: `${displayName} (YALC)`,
    provider: `${displayName} (YALC)`,
    description,
    desc: description,
    icon: "🧭",
    ownership: "client",
    authType: "api_key",
    docs: docsUrl,
    docsUrl,
    credentials: envVars.map((field) => ({
      key: field.name,
      label: field.name,
      type: "string",
      help: field.description,
      sensitive: true,
      required: field.required !== false,
      placeholder: field.example || field.name,
    })),
    config: [],
  };
}

export function buildYalcSetupGuide(provider: YalcProviderKnowledge | null) {
  if (!provider) return null;

  const steps = (provider.install_steps || []).map((instructions, index) => ({
    title: index === 0 ? "Crear o localizar la API key" : `Paso ${index + 1}`,
    instructions,
  }));

  const docsUrl = provider.docs_url || provider.key_acquisition_url || provider.homepage;
  if (docsUrl && steps.length === 0) {
    steps.push({
      title: "Obtener credenciales",
      instructions: `Abre <a href="${docsUrl}" target="_blank" rel="noopener noreferrer">la documentacion del proveedor</a> y genera las variables indicadas abajo.`,
    });
  }

  if (steps.length === 0) return null;

  return {
    difficulty: "media",
    time: "5-10 min",
    warning: "Estas credenciales se guardan en YALC desde Sancho. Sancho no muestra de nuevo el valor completo despues de guardarlo.",
    steps,
  };
}
