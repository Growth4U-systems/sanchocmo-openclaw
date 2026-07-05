import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import {
  RUNTIME_OPTIONS,
  createRuntimeAdapter,
  isRuntimeConfigured,
  readRuntimeSelection,
  resetRuntimeCache,
  resolveRuntimeId,
  writeRuntimeSelection,
  type RuntimeId,
} from "@/lib/runtime";

const HEALTH_TIMEOUT_MS = 3000;

interface RuntimeHealth {
  ok: boolean;
  details?: Record<string, unknown>;
}

async function runtimeHealth(runtime: RuntimeId): Promise<RuntimeHealth> {
  const adapter = createRuntimeAdapter(runtime);
  return Promise.race<RuntimeHealth>([
    adapter.lifecycle.healthcheck().catch((err: unknown) => ({
      ok: false,
      details: { error: err instanceof Error ? err.message : String(err) },
    })),
    new Promise<RuntimeHealth>((resolve) => {
      setTimeout(
        () =>
          resolve({
            ok: false,
            details: { error: `healthcheck timeout after ${HEALTH_TIMEOUT_MS}ms` },
          }),
        HEALTH_TIMEOUT_MS,
      );
    }),
  ]);
}

async function buildRuntimePayload() {
  const selection = readRuntimeSelection();
  const options = await Promise.all(
    RUNTIME_OPTIONS.map(async (meta) => {
      const adapter = createRuntimeAdapter(meta.id);
      const configured = isRuntimeConfigured(meta.id);
      const health = configured
        ? await runtimeHealth(meta.id)
        : {
            ok: false,
            details: { error: "runtime is not configured" },
          };

      return {
        ...meta,
        displayName: adapter.displayName,
        configured,
        capabilities: adapter.capabilities,
        health,
      };
    }),
  );

  return {
    ok: true,
    active: selection.runtime,
    source: selection.source,
    envRuntime: selection.envRuntime,
    selected: {
      updatedAt: selection.updatedAt || null,
      updatedBy: selection.updatedBy || null,
    },
    options,
  };
}

function runtimeFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { runtime?: unknown }).runtime;
  return typeof value === "string" ? value : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PATCH" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PATCH, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  if (req.method === "GET") {
    return res.status(200).json(await buildRuntimePayload());
  }

  const runtime = resolveRuntimeId(runtimeFromBody(req.body));
  if (!runtime) {
    return res.status(400).json({ error: "Unknown runtime" });
  }

  if (!isRuntimeConfigured(runtime)) {
    const meta = RUNTIME_OPTIONS.find((option) => option.id === runtime);
    return res.status(400).json({
      error: `${meta?.label || runtime} no está configurado todavía.`,
      requiredEnv: meta?.requiredEnv || [],
    });
  }

  const health = await runtimeHealth(runtime);
  if (!health.ok) {
    const meta = RUNTIME_OPTIONS.find((option) => option.id === runtime);
    return res.status(400).json({
      error: `${meta?.label || runtime} no responde OK todavía.`,
      details: health.details || {},
    });
  }

  writeRuntimeSelection(runtime, "admin");
  resetRuntimeCache();

  const payload = await buildRuntimePayload();
  return res.status(200).json({
    ...payload,
    warning: null,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
