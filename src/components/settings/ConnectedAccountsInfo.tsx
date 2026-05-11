"use client";

import { useQuery } from "@tanstack/react-query";

export interface ApiAccount {
  type: string;
  name: string;
  handle?: string;
  subAccounts?: ApiAccount[];
}

interface HealthService {
  status?: string;
  details?: Record<string, unknown>;
}

interface HealthResponse {
  services: Record<string, HealthService>;
}

interface MetricoolAccountResponse {
  ok: boolean;
  info?: {
    brand_name: string | null;
    brand_id: string;
    networks: Array<{ network: string; handle?: string | null; connected: boolean }>;
  };
  error?: string;
}

const TYPE_VISUAL: Record<string, { emoji: string; label: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn" },
  twitter:   { emoji: "🐦", label: "X" },
  instagram: { emoji: "📷", label: "Instagram" },
  facebook:  { emoji: "📘", label: "Facebook" },
  tiktok:    { emoji: "🎵", label: "TikTok" },
  youtube:   { emoji: "📺", label: "YouTube" },
  workspace: { emoji: "🏢", label: "Workspace" },
  bot:       { emoji: "🤖", label: "Bot" },
  user:      { emoji: "👤", label: "Usuario" },
  account:   { emoji: "👤", label: "Cuenta" },
  email:     { emoji: "✉️", label: "Email" },
  project:   { emoji: "📦", label: "Proyecto" },
  brand:     { emoji: "📡", label: "Brand" },
};

/**
 * Convert ad-hoc fields populated by health checks (`account`, `username`,
 * `botName`, `team`, `user`, `login`, `project`, `plan`) into the canonical
 * ApiAccount shape. Lossy but predictable — provider checks should migrate to
 * a `details.accounts: ApiAccount[]` array over time.
 */
function deriveFromLegacy(details: Record<string, unknown> | undefined): ApiAccount[] {
  if (!details) return [];
  const accounts: ApiAccount[] = [];
  const seen = new Set<string>();
  const push = (a: ApiAccount) => {
    const k = `${a.type}:${a.name}`;
    if (seen.has(k)) return;
    seen.add(k);
    accounts.push(a);
  };
  if (typeof details.account === "string") push({ type: "account", name: details.account });
  if (typeof details.username === "string") push({ type: "user", name: details.username });
  if (typeof details.botName === "string") push({ type: "bot", name: details.botName });
  if (typeof details.team === "string") push({ type: "workspace", name: details.team });
  if (typeof details.user === "string" && details.user !== details.username) {
    push({ type: "user", name: String(details.user) });
  }
  if (typeof details.login === "string") push({ type: "user", name: details.login });
  if (typeof details.project === "string") push({ type: "project", name: details.project });
  if (typeof details.plan === "string" && accounts[0]) {
    accounts[0].handle = `plan: ${details.plan}`;
  }
  return accounts;
}

/**
 * Generic "connected accounts" block rendered inside the hero zone of
 * `ApiConnectPanel`. Reads `api-health.services[apiId].details` and surfaces
 * any known account-shaped fields. For Metricool, also pulls the rich brand +
 * networks breakdown from `/api/publishing/account-info`.
 *
 * Returns null when there is nothing useful to show, so the UI stays clean
 * for system APIs that only report status.
 */
export function ConnectedAccountsInfo({ apiId, slug }: { apiId: string; slug: string }) {
  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["api-health"],
    queryFn: async () => {
      const res = await fetch("/api/system/api-health");
      if (!res.ok) return { services: {} };
      return res.json();
    },
    staleTime: 30_000,
  });

  const isMetricool = apiId === "metricool";
  const { data: metricool } = useQuery<MetricoolAccountResponse>({
    queryKey: ["publishing", "account-info", slug],
    queryFn: async () => {
      const res = await fetch(`/api/publishing/account-info?slug=${slug}`);
      if (!res.ok) return { ok: false };
      return res.json();
    },
    enabled: isMetricool && !!slug,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const legacy = deriveFromLegacy(health?.services?.[apiId]?.details);

  const accounts: ApiAccount[] = [];
  if (isMetricool && metricool?.ok && metricool.info) {
    const info = metricool.info;
    accounts.push({
      type: "brand",
      name: info.brand_name || `Blog ${info.brand_id}`,
      handle: info.brand_id !== (info.brand_name || "") ? info.brand_id : undefined,
      subAccounts: info.networks
        .filter((n) => n.connected)
        .map((n) => ({
          type: n.network,
          name: TYPE_VISUAL[n.network]?.label || n.network,
          handle: n.handle || undefined,
        })),
    });
  }
  for (const a of legacy) accounts.push(a);

  if (accounts.length === 0) return null;

  return (
    <div
      className="mt-3 pt-3 border-t-2 border-dashed space-y-2.5"
      style={{ borderColor: "var(--sc-ink)" }}
    >
      <div
        className="text-[11px] font-heading uppercase tracking-wider"
        style={{ color: "var(--sc-fg-muted)" }}
      >
        Cuentas conectadas
      </div>
      <ul className="flex flex-col gap-2">
        {accounts.map((a, i) => {
          const v = TYPE_VISUAL[a.type] || { emoji: "·", label: a.type };
          return (
            <li key={`${a.type}-${a.name}-${i}`} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm flex-wrap" style={{ color: "var(--sc-ink)" }}>
                <span className="text-base">{v.emoji}</span>
                <span className="font-semibold">{a.name}</span>
                <span className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>· {v.label}</span>
                {a.handle && (
                  <span className="text-xs font-mono" style={{ color: "var(--sc-fg-muted)" }}>
                    · {a.handle}
                  </span>
                )}
              </div>
              {a.subAccounts && a.subAccounts.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-6">
                  {a.subAccounts.map((s, j) => {
                    const sv = TYPE_VISUAL[s.type] || { emoji: "·", label: s.type };
                    return (
                      <li
                        key={`${s.type}-${j}`}
                        className="text-xs flex items-center gap-1.5 flex-wrap"
                        style={{ color: "var(--sc-fg-muted)" }}
                      >
                        <span>{sv.emoji}</span>
                        <span className="font-semibold" style={{ color: "var(--sc-ink)" }}>
                          {sv.label}
                        </span>
                        {s.handle && <span className="font-mono">· {s.handle}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
