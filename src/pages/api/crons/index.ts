import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";

const EXEC_PATH = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

function enrichCronJob(job: Record<string, unknown>, clients: { slug: string; name: string }[]) {
  const name = ((job.name as string) || "").toLowerCase();
  const msg = (((job.payload as Record<string, unknown>)?.message as string) || "").toLowerCase();
  let clientSlug: string | null = null;
  for (const c of clients) {
    const s = (c.slug || "").toLowerCase();
    const n2 = (c.name || "").toLowerCase();
    if (name.includes(s) || msg.includes(s) || name.includes(n2)) { clientSlug = c.slug; break; }
  }
  let category = "other";
  if (/metric|morning|analytics/.test(name)) category = "metrics";
  else if (/pulse|meeting|synthesis|intelligence|thief/.test(name)) category = "intelligence";
  else if (/lead|outreach|call prep|prospecting/.test(name)) category = "outreach";
  else if (/content|blog|social|idea.gen/.test(name)) category = "content";
  else if (/backup|health|cost|update|watchdog|memory|regenerar|changelog|skill|mejora|image-opt|token.audit|activity|observa/.test(name)) category = "system";
  const st = (job.state as Record<string, unknown>) || {};
  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled !== false,
    schedule: job.schedule,
    agent: job.agentId,
    model: ((job.payload as Record<string, unknown>)?.model as string) || null,
    client_slug: clientSlug,
    category,
    last_run: st.lastRunAtMs ? new Date(st.lastRunAtMs as number).toISOString() : null,
    next_run: st.nextRunAtMs ? new Date(st.nextRunAtMs as number).toISOString() : null,
    last_status: st.lastRunStatus || null,
    duration_ms: st.lastDurationMs || null,
    consecutive_errors: st.consecutiveErrors || 0,
  };
}

function loadCronJobs(): Record<string, unknown>[] {
  try {
    const output = execSync("openclaw cron list --json", {
      timeout: 15000,
      encoding: "utf-8",
      env: { ...process.env, PATH: EXEC_PATH },
    });
    return (JSON.parse(output).jobs || []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slugParam = req.ctx?.clientSlug || (req.query.slug as string) || null;
  const clients = loadClients() as { slug: string; name: string }[];
  const enriched = loadCronJobs().map((j) => enrichCronJob(j, clients));

  let filtered = enriched;
  if (req.ctx?.clientSlug) {
    filtered = enriched.filter((j) => j.client_slug === slugParam);
  } else if (slugParam) {
    filtered = enriched.filter((j) => j.client_slug === slugParam || (!j.client_slug && j.category === "system"));
  }

  return res.status(200).json({ ok: true, crons: filtered });
}

export default compose(withErrorHandler, withAuth)(handler);
