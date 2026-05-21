import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CatalogProvider {
  id: string;
  configured: boolean;
  authKind: string;
  sourceLabel: string | null;
  modelCount: number;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
  curated: boolean;
}

export interface ModelCatalogResponse {
  ok: true;
  providers: CatalogProvider[];
  models: CatalogModel[];
  curated: string[];
  generatedAt: number;
  complete: boolean;
}

export function useModelCatalog(opts: { all?: boolean } = {}) {
  const all = opts.all === true;
  return useQuery<ModelCatalogResponse>({
    queryKey: ["models-catalog", all],
    queryFn: async () => {
      const url = all ? "/api/models/catalog?all=1" : "/api/models/catalog";
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch model catalog");
      }
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useDefaultModel() {
  return useQuery<{ ok: true; model: string | null }>({
    queryKey: ["models-default"],
    queryFn: async () => {
      const res = await fetch("/api/admin/default-model");
      if (!res.ok) throw new Error("Failed to fetch default model");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useSetDefaultModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (model: string) => {
      const res = await fetch("/api/admin/default-model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to set default model");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["models-default"] });
      qc.invalidateQueries({ queryKey: ["models-catalog"] });
    },
  });
}

export function useSetAgentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agentId: string; model: string | null }) => {
      const res = await fetch(`/api/admin/agents/${encodeURIComponent(input.agentId)}/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: input.model }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to set agent model");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["models-catalog"] });
      qc.invalidateQueries({ queryKey: ["agents-list"] });
    },
  });
}

export function useSetCronModel(slug: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cronId: string; model: string }) => {
      const res = await fetch(`/api/crons/${encodeURIComponent(input.cronId)}/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: input.model }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to set cron model");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-tasks", slug] });
      qc.invalidateQueries({ queryKey: ["cron-snapshot"] });
      qc.invalidateQueries({ queryKey: ["admin-cron-snapshot"] });
      qc.invalidateQueries({ queryKey: ["models-catalog"] });
    },
  });
}

export interface RichAgent {
  id: string;
  name: string;
  emoji: string | null;
  workspace: string | null;
  resolvedModel: string | null;
  overrideModel: string | null;
  isDefault: boolean;
  registered: boolean;
}

export function useAgentsList() {
  return useQuery<{ ok: true; agents: RichAgent[] }>({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
    staleTime: 60_000,
  });
}
