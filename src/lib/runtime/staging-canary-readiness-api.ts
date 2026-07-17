import type { NextApiRequest, NextApiResponse } from "next";

import {
  STAGING_CANARY_READINESS_SCHEMA,
  type StagingCanaryReadinessResponse,
  type StagingCanaryReadinessSurface,
} from "./staging-canary-readiness-contract";

interface StagingCanaryReadinessDependencies {
  surface: StagingCanaryReadinessSurface;
  authorize(req: NextApiRequest, res: NextApiResponse): boolean;
  getReady(): boolean;
  logError?: (message: string) => void;
}

export function createStagingCanaryReadinessHandler(
  dependencies: StagingCanaryReadinessDependencies,
) {
  return function stagingCanaryReadinessHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!dependencies.authorize(req, res)) return;

    try {
      const response: StagingCanaryReadinessResponse = {
        schemaVersion: STAGING_CANARY_READINESS_SCHEMA,
        surface: dependencies.surface,
        ready: dependencies.getReady() === true,
      };
      return res.status(200).json(response);
    } catch {
      try {
        (dependencies.logError ?? console.error)(
          "[staging-canary-readiness] lookup failed",
        );
      } catch {
        // Logging must not affect the stable, credential-free response.
      }
      return res.status(500).json({ error: "Canary readiness unavailable" });
    }
  };
}
