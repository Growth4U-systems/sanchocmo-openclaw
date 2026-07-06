import path from "path";
import { readJSON } from "./json-io";
import { monitoringDir } from "./paths";

export function loadHealthScore(slug: string): unknown {
  return readJSON(path.join(monitoringDir(slug), "health-score.json"), null);
}

export function loadPendingRecommendations(slug: string): unknown[] {
  return readJSON<unknown[]>(
    path.join(monitoringDir(slug), "pending-recommendations.json"),
    []
  );
}
