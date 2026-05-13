import fs from "fs";
import path from "path";
import { brandDir } from "./paths";
import { readJSON, writeJSON } from "./json-io";

// Append-only log of human decisions made on Atalaya signals via Slack
// (or any future surface). Stored at brand/<slug>/atalaya/decisions.json.
//
// The signal-monitor / atalaya skills can read this log to reconcile state:
// e.g. drop approved signals from `pending-ideas.json`, or re-queue "later".

export type DecisionType = "approve" | "reject" | "later";

export interface AtalayaDecision {
  signal_id: string | null;
  decision: DecisionType;
  decided_by: string;        // Slack user_id
  decided_by_team: string;   // Slack team_id
  decided_at: string;        // ISO8601
  raw_action_id: string;
  raw_value?: string;
}

interface DecisionsFile {
  decisions: AtalayaDecision[];
}

function decisionsFile(slug: string): string {
  return path.join(brandDir(slug), "atalaya", "decisions.json");
}

export function recordDecision(slug: string, decision: AtalayaDecision): void {
  const file = decisionsFile(slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = readJSON<DecisionsFile>(file, { decisions: [] });
  data.decisions.push(decision);
  writeJSON(file, data);
}

export function listDecisions(slug: string): AtalayaDecision[] {
  return readJSON<DecisionsFile>(decisionsFile(slug), { decisions: [] }).decisions;
}
