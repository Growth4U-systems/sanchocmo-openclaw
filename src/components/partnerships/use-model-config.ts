/**
 * SAN-76 · hook compartido de la config EFECTIVA del modelo de creators
 * (GET /api/yalc/model-config → defaults calc-creator-core + overrides Yalc).
 * Lo consumen el tab Settings, la calc del drawer y el Inbox (break-even con
 * la misma config que verá el funnel de Settings).
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";

export interface ModelConfigPayload {
  ok: boolean;
  /** Config efectiva (defaults + overrides) — la que consume la calc. */
  config: CreatorModelConfig;
  /** Documento de overrides almacenado en Yalc ({} si no hay). */
  overrides: Record<string, unknown>;
  defaults: CreatorModelConfig;
  source: "yalc" | "defaults";
  updatedAt: string | null;
  yalcError?: string;
}

export function modelConfigQueryKey(slug: string) {
  return ["yalc", slug, "model-config"] as const;
}

export function useModelConfig(slug: string) {
  return useQuery({
    queryKey: modelConfigQueryKey(slug),
    queryFn: async (): Promise<ModelConfigPayload> => {
      const res = await fetch(`/api/yalc/model-config?slug=${encodeURIComponent(slug)}`);
      const text = await res.text();
      const payload = text ? (JSON.parse(text) as ModelConfigPayload & { error?: string }) : null;
      if (!res.ok || !payload) {
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      return payload;
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}
