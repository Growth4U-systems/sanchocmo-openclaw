"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Plus,
  RefreshCw,
  Server,
} from "lucide-react";
import { ComicCard } from "@/components/shared/comic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActiveView = "sancho" | "alarife";

interface McpTokenSummary {
  id: string;
  source: "SANCHO_MCP_TOKENS" | "SANCHO_MCP_TOKEN";
  storage: "sha256-hash" | "plain-env";
  scopes: string[];
  clients: string[];
  brands: string[];
  hashFingerprint: string;
  tokenRecoverable: boolean;
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
}

interface McpTokensResponse {
  ok: boolean;
  sanchoEndpoint?: string;
  availableScopes: string[];
  defaultScopes: string[];
  configured: boolean;
  tokens: McpTokenSummary[];
  sancho?: {
    endpoint: string;
    configured: boolean;
    tokens: McpTokenSummary[];
  };
  alarife?: {
    deliveryEndpoint: string;
    count: number;
    configuredCount: number;
    instances: AlarifeMcpInstanceSummary[];
  };
}

interface GeneratedTokenResponse {
  ok: boolean;
  token: string;
  activated: boolean;
  persistedCount: number | null;
  runtimeStorage: "plain-env" | "not-activated";
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

function SecretBox({
  id,
  value,
  canReveal,
  revealDisabledText,
  isVisible,
  isLoading,
  copied,
  onReveal,
  onToggleVisible,
  onCopy,
}: {
  id: string;
  value?: string;
  canReveal: boolean;
  revealDisabledText?: string;
  isVisible: boolean;
  isLoading: boolean;
  copied: boolean;
  onReveal: () => void;
  onToggleVisible: () => void;
  onCopy: () => void;
}) {
  const hasValue = Boolean(value);
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={id}
          readOnly
          type={hasValue && isVisible ? "text" : "password"}
          value={hasValue ? value : "hidden-token-value"}
          className={cn(
            "h-9 w-full min-w-0 rounded-md border-2 border-ink bg-background px-3 font-mono text-xs sm:min-w-[220px]",
            !hasValue && "text-muted-foreground",
          )}
          aria-label="Token value"
        />
        <div className="flex shrink-0 gap-2">
          {hasValue ? (
            <Button type="button" variant="outline" size="sm" onClick={onToggleVisible}>
              {isVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {isVisible ? "Ocultar" : "Ver"}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onReveal} disabled={!canReveal || isLoading}>
              <Eye className="size-3.5" />
              {isLoading ? "Cargando..." : "Revelar"}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={!hasValue}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copiar
          </Button>
        </div>
      </div>
      {!canReveal && !hasValue && (
        <div className="text-xs text-muted-foreground">{revealDisabledText || "No revelable"}</div>
      )}
    </div>
  );
}

function ViewButton({
  active,
  title,
  subtitle,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  count: string | number;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[92px] w-full items-start gap-3 rounded-lg border-[3px] p-4 text-left transition",
        active ? "border-rust bg-rust/10 shadow-comic" : "border-ink/30 bg-card hover:border-ink/70",
      )}
    >
      <span className={cn("mt-0.5", active ? "text-rust" : "text-navy")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("font-heading text-lg", active ? "text-rust" : "text-navy")}>{title}</span>
          <Badge variant={active ? "secondary" : "outline"}>{count}</Badge>
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

export function McpTokensPanel() {
  const [activeView, setActiveView] = useState<ActiveView>("sancho");
  const [data, setData] = useState<McpTokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedTokenResponse | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const [tokenId, setTokenId] = useState(defaultTokenId);
  const [clients, setClients] = useState("growth4u,example");
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
      const res = await fetch("/api/admin/mcp-tokens", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      if (Array.isArray(json.defaultScopes) && json.defaultScopes.length > 0) {
        setSelectedScopes((current) => (current.length ? current : json.defaultScopes));
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
  const alarifeInstances = useMemo(() => data?.alarife?.instances || [], [data]);
  const configuredAlarifeCount = data?.alarife?.configuredCount || 0;

  const copy = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const reveal = async (key: string, body: Record<string, unknown>) => {
    setRevealing(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/mcp-token-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRevealed((current) => ({ ...current, [key]: json.token }));
      setVisible((current) => ({ ...current, [key]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevealing(null);
    }
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
      setVisible((current) => ({ ...current, "generated-sancho-token": true }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setSecretVisible = (key: string) => {
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl text-navy">
            <KeyRound className="size-5" aria-hidden="true" />
            MCP tokens
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tokens separados para Sancho y para cada Alarife. Los valores se leen desde el runtime del VPS.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading} className="w-fit">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
          Refrescar
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ViewButton
          active={activeView === "sancho"}
          title="Sancho MCP"
          subtitle={`${sanchoTokens.length} token${sanchoTokens.length === 1 ? "" : "s"} para operar Sancho`}
          count={loading ? "..." : sanchoTokens.length}
          icon={<Server className="size-5" aria-hidden="true" />}
          onClick={() => setActiveView("sancho")}
        />
        <ViewButton
          active={activeView === "alarife"}
          title="Alarife MCP"
          subtitle={`${configuredAlarifeCount}/${alarifeInstances.length} instancia${alarifeInstances.length === 1 ? "" : "s"} con secreto`}
          count={loading ? "..." : `${configuredAlarifeCount}/${alarifeInstances.length}`}
          icon={<Globe2 className="size-5" aria-hidden="true" />}
          onClick={() => setActiveView("alarife")}
        />
      </div>

      {activeView === "sancho" ? (
        <div className="space-y-4">
          <ComicCard>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase text-muted-foreground">Endpoint Sancho</div>
                <code className="mt-1 inline-block rounded bg-muted px-2 py-1 text-xs">{sanchoEndpoint}</code>
              </div>
              <Badge variant={data?.sancho?.configured || data?.configured ? "secondary" : "destructive"}>
                {data?.sancho?.configured || data?.configured ? "activo" : "sin tokens"}
              </Badge>
            </div>
          </ComicCard>

          <ComicCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-heading text-lg text-navy">Tokens Sancho</h3>
              <Badge variant="outline">runtime VPS</Badge>
            </div>

            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando tokens...</p>
            ) : sanchoTokens.length ? (
              <div className="divide-y divide-border">
                {sanchoTokens.map((token) => {
                  const key = `sancho:${token.source}:${token.id}:${token.hashFingerprint}`;
                  return (
                    <div key={key} className="grid gap-3 py-4 lg:grid-cols-[1.1fr_1.4fr_1.6fr] lg:items-start">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm font-semibold text-navy">{token.id}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={token.storage === "plain-env" ? "secondary" : "outline"}>
                            {token.storage === "plain-env" ? "revelable" : "hash-only"}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">{token.hashFingerprint}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Clientes</div>
                          <PillList values={token.clients} />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Scopes</div>
                          <PillList values={token.scopes} />
                        </div>
                      </div>
                      <SecretBox
                        id={key}
                        value={revealed[key]}
                        canReveal={token.tokenRecoverable}
                        revealDisabledText="Token antiguo guardado solo como hash"
                        isVisible={Boolean(visible[key])}
                        isLoading={revealing === key}
                        copied={copied === key}
                        onReveal={() =>
                          reveal(key, {
                            kind: "sancho",
                            id: token.id,
                            source: token.source,
                            hashFingerprint: token.hashFingerprint,
                          })
                        }
                        onToggleVisible={() => setSecretVisible(key)}
                        onCopy={() => copy(key, revealed[key])}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No hay tokens Sancho MCP.</p>
            )}
          </ComicCard>

          <ComicCard>
            <div className="mb-4 flex items-center gap-2">
              <Plus className="size-4 text-navy" aria-hidden="true" />
              <h3 className="font-heading text-lg text-navy">Generar token Sancho</h3>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">ID</span>
                  <input
                    value={tokenId}
                    onChange={(event) => setTokenId(event.target.value)}
                    className="h-9 w-full rounded-md border-2 border-ink bg-background px-3 font-mono text-sm"
                    placeholder="claude-code-martin"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Clientes</span>
                  <input
                    value={clients}
                    onChange={(event) => setClients(event.target.value)}
                    className="h-9 w-full rounded-md border-2 border-ink bg-background px-3 font-mono text-sm"
                    placeholder="growth4u,example o *"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Brands</span>
                  <input
                    value={brands}
                    onChange={(event) => setBrands(event.target.value)}
                    className="h-9 w-full rounded-md border-2 border-ink bg-background px-3 font-mono text-sm"
                    placeholder="vacío = igual que clientes"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={activate}
                    onChange={(event) => setActivate(event.target.checked)}
                  />
                  Guardar en runtime del VPS
                </label>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Scopes</div>
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
                {saving ? "Generando..." : "Generar"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Los nuevos tokens guardados en runtime se podrán revelar después.
              </span>
            </div>
          </ComicCard>

          {generated && (
            <ComicCard>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-heading text-lg text-navy">Token generado</h3>
                <Badge variant={generated.activated ? "secondary" : "outline"}>
                  {generated.activated ? "activo" : "no activado"}
                </Badge>
              </div>
              <SecretBox
                id="generated-sancho-token"
                value={generated.token}
                canReveal
                isVisible={Boolean(visible["generated-sancho-token"] ?? true)}
                isLoading={false}
                copied={copied === "generated-sancho-token"}
                onReveal={() => undefined}
                onToggleVisible={() => setSecretVisible("generated-sancho-token")}
                onCopy={() => copy("generated-sancho-token", generated.token)}
              />
              <p className="mt-2 text-xs text-muted-foreground">{generated.warning}</p>
            </ComicCard>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <ComicCard>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-heading text-lg text-navy">Instancias Alarife</h3>
                <p className="text-sm text-muted-foreground">
                  Cada token apunta a un Alarife concreto. Growth4U tiene `web` y `sancho-web`.
                </p>
              </div>
              <Badge variant="outline">{configuredAlarifeCount}/{alarifeInstances.length} configurados</Badge>
            </div>
          </ComicCard>

          {loading ? (
            <ComicCard>
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando instancias...</p>
            </ComicCard>
          ) : alarifeInstances.length ? (
            <ComicCard>
              <div className="divide-y divide-border">
                {alarifeInstances.map((instance) => {
                  const key = `alarife:${instance.clientSlug}:${instance.alarifeSlug}`;
                  return (
                    <div key={key} className="grid gap-3 py-4 lg:grid-cols-[1.1fr_1.4fr_1.6fr] lg:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-navy">{instance.name}</div>
                          <Badge variant={instance.secretConfigured ? "secondary" : "destructive"}>
                            {instance.secretConfigured ? "configurado" : "faltante"}
                          </Badge>
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {instance.clientSlug}/{instance.alarifeSlug}
                        </div>
                        {instance.description && (
                          <div className="mt-1 text-xs text-muted-foreground">{instance.description}</div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">MCP URL</div>
                          <div className="flex items-start gap-2">
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
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Alcance</div>
                          <PillList values={[instance.clientSlug, instance.alarifeSlug, "payload-cms"]} />
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{instance.secretEnvKey}</div>
                      </div>

                      <SecretBox
                        id={key}
                        value={revealed[key]}
                        canReveal={instance.secretConfigured}
                        revealDisabledText="Secreto faltante en runtime"
                        isVisible={Boolean(visible[key])}
                        isLoading={revealing === key}
                        copied={copied === key}
                        onReveal={() =>
                          reveal(key, {
                            kind: "alarife",
                            clientSlug: instance.clientSlug,
                            alarifeSlug: instance.alarifeSlug,
                          })
                        }
                        onToggleVisible={() => setSecretVisible(key)}
                        onCopy={() => copy(key, revealed[key])}
                      />
                    </div>
                  );
                })}
              </div>
            </ComicCard>
          ) : (
            <ComicCard>
              <p className="py-6 text-center text-sm text-muted-foreground">No hay Alarifes registrados.</p>
            </ComicCard>
          )}

          <p className="text-xs text-muted-foreground">
            Rotar un token Alarife requiere cambiar el secreto en la instancia Alarife y en el runtime de Sancho.
          </p>
        </div>
      )}
    </section>
  );
}
