import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import { runMetricKpis } from "@/lib/data/metric-kpi-runner";
import { withInternalAuth } from "@/lib/sancho-internal-api";

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstString(value[0]);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanParam(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value === "1" || value.toLowerCase() === "true";
}

function numberParam(value: unknown): number | undefined {
  const raw = firstString(value);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = firstString(req.query.slug);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const body = (req.body ?? {}) as {
    from?: unknown;
    to?: unknown;
    range?: { from?: unknown; to?: unknown } | null;
    trigger?: unknown;
    force?: unknown;
    definitionVersion?: unknown;
  };

  const result = await runMetricKpis({
    slug,
    range: {
      from:
        firstString(body.range?.from) ??
        firstString(body.from) ??
        firstString(req.query.from),
      to:
        firstString(body.range?.to) ??
        firstString(body.to) ??
        firstString(req.query.to),
    },
    trigger:
      firstString(body.trigger) ??
      firstString(req.query.trigger) ??
      "internal",
    force: booleanParam(body.force) || booleanParam(req.query.force),
    definitionVersion:
      numberParam(body.definitionVersion) ??
      numberParam(req.query.definitionVersion),
  });

  if (!result.ok) {
    return res.status(result.configured ? 500 : 503).json(result);
  }
  return res.status(200).json(result);
}

export default withErrorHandler(withInternalAuth(withMethod(["POST"], handler)));
