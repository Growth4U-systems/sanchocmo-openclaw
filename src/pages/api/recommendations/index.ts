import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rSlug = (req.query.slug as string) || "";
  const filterType = (req.query.type as string) || "";
  const filterSource = (req.query.source as string) || "";
  const filterStatus = (req.query.status as string) || "pending";

  const brandDir = path.join(BASE, "brand", rSlug);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allRecs: any[] = [];

  // Source 1: Atalaya pending files
  const atalayaDir = path.join(brandDir, "atalaya");
  const atalayaFiles: Record<string, string> = {
    "profiles-pending.json": "atalaya-profiles",
    "competitors-pending.json": "atalaya-competitors",
    "ads-pending.json": "atalaya-ads",
    "pending-ideas.json": "atalaya",
  };
  for (const [fname, src] of Object.entries(atalayaFiles)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = readJSON<any>(path.join(atalayaDir, fname), []);
      const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.ideas || raw.ideas_generated || []);
      for (const item of items) {
        const adapted = (item.adapted_idea || {}) as Record<string, unknown>;
        allRecs.push({
          id: item.id || "rec-" + src + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          source: item.source || src,
          type: item.type || "content_idea",
          priority: item.priority || adapted.priority || "medium",
          title: item.title || adapted.title || "",
          description: item.description || adapted.description || "",
          rationale: item.rationale || item.source_content_snippet || "",
          content: item.content || (adapted ? { channels: adapted.recommended_channels || [], format: adapted.format || "" } : undefined),
          contact: item.contact || undefined,
          status: item.status || "pending",
          created_at: item.created_at || "",
          _file: fname,
        });
      }
    } catch { /* empty */ }
  }

  // Source 2: Performance Analysis
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = readJSON<any>(path.join(brandDir, "monitoring", "pending-recommendations.json"), []);
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.recommendations || []);
    for (const item of items) {
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
  } catch { /* empty */ }

  // Source 3: Trust Engine recommendations
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = readJSON<any>(path.join(brandDir, "trust-engine", "recommendations.json"), { recommendations: [] });
    const items: Record<string, unknown>[] = raw.recommendations || raw.data?.recommendations || [];
    for (const item of items) {
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
  } catch { /* empty */ }

  // Apply filters
  if (filterStatus && filterStatus !== "all") allRecs = allRecs.filter((r) => r.status === filterStatus);
  if (filterType) allRecs = allRecs.filter((r) => r.type === filterType);
  if (filterSource) allRecs = allRecs.filter((r) => r.source.startsWith(filterSource));

  return res.status(200).json({ recommendations: allRecs, total: allRecs.length });
}

export default compose(withErrorHandler, withAuth)(handler);
