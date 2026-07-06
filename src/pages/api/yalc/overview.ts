import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  countYalcRows,
  isYalcConfigured,
  publicYalcConfig,
  resolveYalcConfig,
  yalcFetch,
} from "@/lib/yalc/client";

const CHECKS = {
  skills: "/api/skills/list",
  today: "/api/today/feed",
  campaigns: "/api/campaigns",
  gates: "/api/gates/awaiting",
  providers: "/api/keys/list",
} as const;

type CheckName = keyof typeof CHECKS;
type CheckResult = {
  ok: boolean;
  count: number | null;
  data?: unknown;
  error?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const config = resolveYalcConfig(slug);

  // Outreach is an opt-in service. When it isn't wired up, skip the health
  // probes (they'd just fail against the localhost fallback) and let the
  // cockpit render its "set up Outreach" placeholder instead of errors.
  if (!isYalcConfigured(slug)) {
    return res.status(200).json({
      ok: false,
      configured: false,
      runtime: publicYalcConfig(config),
      checks: {},
    });
  }

  const entries: Array<readonly [CheckName, CheckResult]> = await Promise.all(
    Object.entries(CHECKS).map(async ([name, endpoint]) => {
      try {
        const data = await yalcFetch(config, endpoint);
        return [name as CheckName, { ok: true, count: countYalcRows(data), data }] as const;
      } catch (err) {
        return [
          name as CheckName,
          {
            ok: false,
            count: null,
            error: err instanceof Error ? err.message : "YALC request failed",
          },
        ] as const;
      }
    }),
  );

  const checks = Object.fromEntries(entries) as Record<CheckName, CheckResult>;
  const ok = Object.values(checks).every((check) => check.ok);

  return res.status(200).json({
    ok,
    configured: true,
    runtime: publicYalcConfig(config),
    checks,
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
