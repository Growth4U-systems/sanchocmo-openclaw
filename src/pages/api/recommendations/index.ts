import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

type Recommendation = {
  id: string;
  source: string;
  type: string;
  priority: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  _file: string;
  idea_ids?: string[];
  suggested_project?: string;
  task_type?: string;
  rationale?: string;
  operational?: {
    linked_project?: string | null;
    linked_metric?: string | null;
    suggested_action?: string;
  };
  converted_to?: string | null;
};

type GroupedItem = {
  id?: string;
  source?: string;
  type?: string;
  priority?: string;
  title?: string;
  description?: string;
  idea_ids?: string[];
  suggested_project?: string;
  task_type?: string;
  status?: string;
  created_at?: string;
};

type MonitoringItem = {
  id?: string;
  type?: string;
  priority?: string;
  title?: string;
  description?: string;
  rationale?: string;
  linked_project?: string | null;
  linkedProject?: string | null;
  linked_metric?: string | null;
  linkedMetric?: string | null;
  suggested_action?: string;
  suggestedAction?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  converted_to_task?: string;
};

type TrustEngineItem = {
  rec_id?: string;
  id?: string;
  type?: string;
  priority?: string;
  severity?: string;
  title?: string;
  rationale?: string;
  description?: string;
  status?: string;
  created_at?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  const filterType = (req.query.type as string) || "";
  const filterSource = (req.query.source as string) || "";
  const filterStatus = (req.query.status as string) || "pending";

  const brandDir = path.join(BASE, "brand", slug);
  let allRecs: Recommendation[] = [];

  const grouped = readJSON<{ recommendations?: GroupedItem[] }>(
    path.join(brandDir, "recommendations.json"),
    {},
  );
  for (const item of grouped.recommendations || []) {
    allRecs.push({
      id: item.id || "",
      source: item.source || "atalaya",
      type: item.type || "content_task",
      priority: item.priority || "medium",
      title: item.title || "",
      description: item.description || "",
      idea_ids: item.idea_ids || [],
      suggested_project: item.suggested_project || "",
      task_type: item.task_type || "content",
      status: item.status || "pending",
      created_at: item.created_at || "",
      _file: "recommendations.json",
    });
  }

  const monitoringRaw = readJSON<MonitoringItem[] | { recommendations?: MonitoringItem[] }>(
    path.join(brandDir, "monitoring", "pending-recommendations.json"),
    [],
  );
  const monitoringItems = Array.isArray(monitoringRaw)
    ? monitoringRaw
    : monitoringRaw.recommendations || [];
  for (const item of monitoringItems) {
    allRecs.push({
      id: item.id || "",
      source: "performance-analysis",
      type: item.type === "content_idea" ? "content_idea" : "operational",
      priority: item.priority || "medium",
      title: item.title || "",
      description: item.description || item.rationale || "",
      rationale: item.rationale || "",
      operational: {
        linked_project: item.linked_project || item.linkedProject || null,
        linked_metric: item.linked_metric || item.linkedMetric || null,
        suggested_action: item.suggested_action || item.suggestedAction || "",
      },
      status: item.status || "pending",
      created_at: item.created_at || item.createdAt || "",
      converted_to: item.converted_to_task ? "task:" + item.converted_to_task : null,
      _file: "monitoring/pending-recommendations.json",
    });
  }

  const trustEngine = readJSON<{
    recommendations?: TrustEngineItem[];
    data?: { recommendations?: TrustEngineItem[] };
  }>(path.join(brandDir, "trust-engine", "recommendations.json"), {});
  const trustItems = trustEngine.recommendations || trustEngine.data?.recommendations || [];
  for (const item of trustItems) {
    allRecs.push({
      id: item.rec_id || item.id || "",
      source: "trust-engine",
      type: item.type || "content_idea",
      priority: item.priority || item.severity || "medium",
      title: item.title || "",
      description: item.rationale || item.description || "",
      rationale: item.rationale || "",
      status: item.status || "pending",
      created_at: item.created_at || "",
      _file: "trust-engine/recommendations.json",
    });
  }

  if (filterStatus && filterStatus !== "all") {
    allRecs = allRecs.filter((r) => r.status === filterStatus);
  }
  if (filterType) {
    allRecs = allRecs.filter((r) => r.type === filterType);
  }
  if (filterSource) {
    allRecs = allRecs.filter((r) => r.source.startsWith(filterSource));
  }

  return res.status(200).json({ recommendations: allRecs, total: allRecs.length });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
