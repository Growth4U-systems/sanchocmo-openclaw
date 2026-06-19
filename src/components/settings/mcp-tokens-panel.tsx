"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe2,
  KeyRound,
  RefreshCw,
  Server,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { ComicCard } from "@/components/shared/comic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface McpTokenSummary {
  id: string;
  source: "SANCHO_MCP_TOKENS" | "SANCHO_MCP_TOKEN";
  storage: "sha256-hash" | "plain-env";
  scopes: string[];
  clients: string[];
  brands: string[];
  hashFingerprint: string;
  tokenRecoverable: false;
}

interface AlarifeMcpInstanceSummary {
  clientSlug: string;
  alarifeSlug: string;
  name: string;
  description?: string;
  adminUrl: string;
  mcpUrl: string;
  secretId: string;
  secretEnvKey: string;
  secretLocation: string;
  secretConfigured: boolean;
  mcpServerName: string;
  tokenReturned: false;
  installProfile: {
    mcpServerName: string;
    transport: "http";
    url: string;
    headers: {
      Authorization: string;
    };
  };
}

interface McpTokensResponse {
  ok: boolean;
  envFile: string;
  sanchoEndpoint?: string;
  availableScopes: string[];
  defaultScopes: string[];
  configured: boolean;
  tokens: McpTokenSummary[];
  sancho?: {
    endpoint: string;
    configured: boolean;
    tokens: McpTokenSummary[];
    note: string;
  };
  alarife?: {
    deliveryEndpoint: string;
    count: number;
    configuredCount: number;
    instances: AlarifeMcpInstanceSummary[];
    note: string;
  };
  note: string;
}

interface GeneratedTokenResponse {
  ok: boolean;
  token: string;
  config: {
    id: string;
    tokenHash: string;
    scopes: string[];
    clients: string[];
    brands?: string[];
  };
  configJson: string;
  activated: boolean;
  persistedCount: number | null;
  warning: string;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultTokenId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `claude-code-${date}`;
}

function PillList({ values, empty = "none" }: { values: string[]; empty?: string }) {
  if (values.length === 0) return <span className="text-xs text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => (
        <Badge key={value} variant="outline" className="font-mono text-[10px]">
          {value}
        </Badge>
      ))}
    </div>
  );
}

function groupAlarifeByClient(instances: AlarifeMcpInstanceSummary[]) {
  return instances.reduce<Array<{ clientSlug: string; instances: AlarifeMcpInstanceSummary[] }>>(
    (groups, instance) => {
      const group = groups.find((item) => item.clientSlug === instance.clientSlug);
      if (group) group.instances.push(instance);
      else groups.push({ clientSlug: instance.clientSlug, instances: [instance] });
      return groups;
    },
    [],
  );
}

function alarifeInstallCommand(instance: AlarifeMcpInstanceSummary) {
  return `SANCHO_MCP_TOKEN=<sancho-token> scripts/install-alarife-mcp.sh ${instance.clientSlug} ${instance.alarifeSlug}`;
}

export function McpTokensPanel() {
  const [data, setData] = useState<McpTokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedTokenResponse | null>(null);

  const [tokenId, setTokenId] = useState(defaultTokenId);
  const [clients, setClients] = useState("growth4u,paymatico");
  const [brands, setBrands] = useState("");
  const [activate, setActivate] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "sancho:read",
    "docs:read",
    "intelligence:read",
  ]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mcp-tokens");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      if (Array.isArray(json.defaultScopes) && json.defaultScopes.length > 0) {
        setSelectedScopes((current) => current.length ? current : json.defaultScopes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const scopes = data?.availableScopes || selectedScopes;
  const sanchoEndpoint = data?.sanchoEndpoint || data?.sancho?.endpoint || "/api/mcp/sancho";
  const sanchoTokens = useMemo(() => data?.sancho?.tokens || data?.tokens || [], [data]);
  const tokenCount = sanchoTokens.length;
  const plainEnvCount = useMemo(
    () => sanchoTokens.filter((token) => token.storage === "plain-env").length,
    [sanchoTokens],
  );
  const alarifeInstances = useMemo(() => data?.alarife?.instances || [], [data]);
  const alarifeGroups = useMemo(() => groupAlarifeByClient(alarifeInstances), [alarifeInstances]);
  const growth4uAlarifeCount = alarifeInstances.filter((instance) => instance.clientSlug === "growth4u").length;

  const copy = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  };

  const generate = async () => {
    setSaving(true);
    setError(null);
    setGenerated(null);
    try {
      const res = await fetch("/api/admin/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tokenId,
          scopes: selectedScopes,
          clients: parseCsv(clients),
          brands: brands.trim() ? parseCsv(brands) : undefined,
          activate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setGenerated(json);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-heading text-xl text-navy flex items-center gap-2">
            <KeyRound className="size-5" aria-hidden="true" />
            MCP tokens
          </h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Gestiona el acceso a Sancho MCP y revisa los MCP directos de Alarife sin mezclar sus tokens.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading} className="w-fit">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
          Refrescar
        </Button>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Hay dos tokens distintos. El generador de esta pantalla crea tokens de <strong>Sancho MCP</strong>.
            Los tokens de <strong>Alarife MCP</strong> pertenecen a cada sitio Alarife y se muestran abajo como
            instancias ya configuradas; no se rotan ni se reemplazan desde esta acción.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ComicCard>
          <div className="flex items-start gap-3">
            <Server className="mt-1 size-5 text-navy" aria-hidden="true" />
            <div>
              <h3 className="font-heading text-lg text-navy">Sancho MCP</h3>
              <p className="text-sm text-muted-foreground">
                Token para conectar Claude Code con Sancho y sus tools.
              </p>
              <code className="mt-2 inline-block rounded bg-muted px-2 py-1 text-xs">{sanchoEndpoint}</code>
            </div>
          </div>
        </ComicCard>
        <ComicCard>
          <div className="flex items-start gap-3">
            <Globe2 className="mt-1 size-5 text-navy" aria-hidden="true" />
            <div>
              <h3 className="font-heading text-lg text-navy">Alarife MCP</h3>
              <p className="text-sm text-muted-foreground">
                Tokens por sitio Alarife. Growth4U tiene dos: <strong>web</strong> y <strong>sancho-web</strong>.
              </p>
              <code className="mt-2 inline-block rounded bg-muted px-2 py-1 text-xs">admin.&lt;alarife&gt;/api/mcp</code>
            </div>
          </div>
        </ComicCard>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-xl text-navy flex items-center gap-2">
            <Server className="size-5" aria-hidden="true" />
            Sancho MCP
          </h3>
          <p className="text-sm text-muted-foreground">
            Estos bearer tokens autorizan llamadas a Sancho. El formulario de abajo genera solo este tipo de token.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ComicCard>
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Tokens Sancho</div>
            <div className="mt-1 text-2xl font-heading text-navy">{loading ? "..." : tokenCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">Activos para {sanchoEndpoint}.</div>
          </ComicCard>
          <ComicCard>
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Formato seguro</div>
            <div className="mt-1 text-2xl font-heading text-navy">
              {loading ? "..." : tokenCount - plainEnvCount}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Entradas guardadas como hash.</div>
          </ComicCard>
          <ComicCard>
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Env Sancho</div>
            <div className="mt-1 truncate font-mono text-xs text-navy" title={data?.envFile || ""}>
              {data?.envFile || "..."}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Actualiza <code>SANCHO_MCP_TOKENS</code> en GitHub Environment para persistir deploys.
            </div>
          </ComicCard>
        </div>

        <ComicCard>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-heading text-lg text-navy">Tokens actuales de Sancho</h4>
            <Badge variant={data?.configured ? "secondary" : "destructive"}>
              {data?.configured ? "Sancho MCP activo" : "sin configurar"}
            </Badge>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando tokens...</p>
          ) : sanchoTokens.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Clientes</th>
                    <th className="py-2 pr-3">Brands</th>
                    <th className="py-2 pr-3">Scopes</th>
                    <th className="py-2 pr-3">Storage</th>
                    <th className="py-2">Fingerprint</th>
                  </tr>
                </thead>
                <tbody>
                  {sanchoTokens.map((token) => (
                    <tr key={`${token.source}:${token.id}:${token.hashFingerprint}`} className="border-b border-border/70 align-top">
                      <td className="py-3 pr-3">
                        <div className="font-mono text-xs font-semibold text-navy">{token.id}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{token.source}</div>
                      </td>
                      <td className="py-3 pr-3"><PillList values={token.clients} /></td>
                      <td className="py-3 pr-3"><PillList values={token.brands} /></td>
                      <td className="py-3 pr-3"><PillList values={token.scopes} /></td>
                      <td className="py-3 pr-3">
                        <Badge variant={token.storage === "sha256-hash" ? "secondary" : "destructive"}>
                          {token.storage}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">{token.hashFingerprint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay tokens Sancho MCP configurados.
            </p>
          )}
        </ComicCard>

        <ComicCard>
          <h4 className="font-heading text-lg text-navy">Generar token nuevo de Sancho MCP</h4>
          <p className="mb-4 text-sm text-muted-foreground">
            Este token es para <code>{sanchoEndpoint}</code>. No crea ni cambia tokens de Alarife.
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Token ID</span>
                <input
                  value={tokenId}
                  onChange={(event) => setTokenId(event.target.value)}
                  className="w-full rounded-md border-2 border-ink bg-background px-3 py-2 font-mono text-sm"
                  placeholder="claude-code-martin"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Clientes Sancho permitidos</span>
                <input
                  value={clients}
                  onChange={(event) => setClients(event.target.value)}
                  className="w-full rounded-md border-2 border-ink bg-background px-3 py-2 font-mono text-sm"
                  placeholder="growth4u,paymatico o *"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Brands opcionales</span>
                <input
                  value={brands}
                  onChange={(event) => setBrands(event.target.value)}
                  className="w-full rounded-md border-2 border-ink bg-background px-3 py-2 font-mono text-sm"
                  placeholder="vacío = igual que clientes"
                />
              </label>

              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={activate}
                  onChange={(event) => setActivate(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-navy">Activar ahora en este servidor</span>
                  <span className="block text-xs text-muted-foreground">
                    Añade el hash a <code>SANCHO_MCP_TOKENS</code> en el `.env` y actualiza el runtime actual.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Scopes Sancho</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {scopes.map((scope) => (
                  <label
                    key={scope}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border-2 p-2 text-sm transition",
                      selectedScopes.includes(scope)
                        ? "border-ink bg-muted"
                        : "border-ink/25 hover:border-ink/60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span className="font-mono text-xs">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generate} disabled={saving}>
              <KeyRound className="size-4" aria-hidden="true" />
              {saving ? "Generando..." : "Generar token Sancho"}
            </Button>
            <span className="text-xs text-muted-foreground">
              No uses tokens compartidos para producción si puedes emitir uno por persona/cliente.
            </span>
          </div>
        </ComicCard>

        {generated && (
          <ComicCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="font-heading text-lg text-navy">Token Sancho generado</h4>
                <p className="text-sm text-muted-foreground">{generated.warning}</p>
              </div>
              <Badge variant={generated.activated ? "secondary" : "outline"}>
                {generated.activated ? "activo" : "no activado"}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Bearer token Sancho</div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={generated.token}
                    className="min-w-0 flex-1 rounded-md border-2 border-ink bg-background px-3 py-2 font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={() => copy("token", generated.token)}>
                    {copied === "token" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    Copiar
                  </Button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Config hash Sancho</div>
                <pre className="max-h-72 overflow-auto rounded-md bg-ink p-3 text-xs text-background">
                  {JSON.stringify(generated.config, null, 2)}
                </pre>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copy("config", JSON.stringify(generated.config, null, 2))}
                  >
                    {copied === "config" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    Copiar config
                  </Button>
                  {generated.activated && (
                    <span className="text-xs text-muted-foreground">
                      Persistido en este servidor. Actualiza el GitHub Environment secret para que no se pierda en deploys.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </ComicCard>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-xl text-navy flex items-center gap-2">
            <Globe2 className="size-5" aria-hidden="true" />
            Alarife MCP
          </h3>
          <p className="text-sm text-muted-foreground">
            Cada fila es un MCP directo a un sitio Alarife. Los secretos actuales se conservan; esta UI no devuelve el bearer token.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ComicCard>
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Instancias Alarife</div>
            <div className="mt-1 text-2xl font-heading text-navy">{loading ? "..." : alarifeInstances.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">MCPs directos registrados en Sancho.</div>
          </ComicCard>
          <ComicCard>
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Growth4U</div>
            <div className="mt-1 text-2xl font-heading text-navy">{loading ? "..." : growth4uAlarifeCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">Incluye `web` y `sancho-web` dentro de Growth4U.</div>
          </ComicCard>
          <ComicCard>
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Secretos configurados</div>
            <div className="mt-1 text-2xl font-heading text-navy">
              {loading ? "..." : data?.alarife?.configuredCount || 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Sancho los usa internamente para validar o instalar Alarife MCP.
            </div>
          </ComicCard>
        </div>

        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-[12px] leading-relaxed text-sky-950">
          <div className="flex gap-2">
            <Terminal className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Para instalar Alarife MCP directo, primero se autentica contra Sancho MCP con un token Sancho válido.
              Luego Sancho entrega internamente el token Alarife de esa instancia mediante{" "}
              <code>{data?.alarife?.deliveryEndpoint || "/api/alarife/mcp-token"}</code>. Ese token Alarife no se muestra aquí.
            </p>
          </div>
        </div>

        {loading ? (
          <ComicCard>
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando instancias Alarife...</p>
          </ComicCard>
        ) : alarifeGroups.length ? (
          alarifeGroups.map((group) => (
            <ComicCard key={group.clientSlug}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-heading text-lg text-navy capitalize">{group.clientSlug}</h4>
                  <p className="text-xs text-muted-foreground">
                    {group.clientSlug === "growth4u"
                      ? "Sancho web vive dentro de este cliente junto con el sitio Growth4U."
                      : "Instancias Alarife de este cliente."}
                  </p>
                </div>
                <Badge variant="outline">{group.instances.length} MCP</Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Instancia</th>
                      <th className="py-2 pr-3">MCP directo</th>
                      <th className="py-2 pr-3">Secret Alarife</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2">Instalación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.instances.map((instance) => {
                      const command = alarifeInstallCommand(instance);
                      const copyId = `${instance.clientSlug}:${instance.alarifeSlug}`;
                      return (
                        <tr key={copyId} className="border-b border-border/70 align-top">
                          <td className="py-3 pr-3">
                            <div className="font-semibold text-navy">{instance.name}</div>
                            <div className="mt-1 font-mono text-xs text-muted-foreground">
                              {instance.clientSlug}/{instance.alarifeSlug}
                            </div>
                            {instance.description && (
                              <div className="mt-1 text-xs text-muted-foreground">{instance.description}</div>
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex max-w-md items-start gap-2">
                              <code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-xs">
                                {instance.mcpUrl}
                              </code>
                              <a
                                href={instance.adminUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 text-navy hover:text-primary"
                                aria-label={`Abrir admin de ${instance.name}`}
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="font-mono text-xs text-navy">{instance.secretEnvKey}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">{instance.secretLocation}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">{instance.secretId}</div>
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant={instance.secretConfigured ? "secondary" : "destructive"}>
                              {instance.secretConfigured ? "configurado" : "faltante"}
                            </Badge>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              tokenReturned: {String(instance.tokenReturned)}
                            </div>
                          </td>
                          <td className="py-3">
                            <div className="font-mono text-xs font-semibold text-navy">{instance.mcpServerName}</div>
                            <pre className="mt-2 max-w-lg overflow-auto rounded-md bg-muted p-2 text-[11px] text-navy">
                              {command}
                            </pre>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              className="mt-2"
                              onClick={() => copy(`alarife-${copyId}`, command)}
                            >
                              {copied === `alarife-${copyId}` ? <Check className="size-3" /> : <Copy className="size-3" />}
                              Copiar comando
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ComicCard>
          ))
        ) : (
          <ComicCard>
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay instancias Alarife MCP registradas.
            </p>
          </ComicCard>
        )}
      </section>
    </section>
  );
}
