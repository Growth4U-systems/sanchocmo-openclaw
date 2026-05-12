import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { BASE, meetingIntelligenceDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

type RawRecord = Record<string, unknown>;

interface MeetingRecord {
  id: string;
  title: string;
  date: string;
  time: string;
  source: string;
  sourceId?: string;
  status: "processed" | "needs review" | "duplicate" | "low confidence";
  type: string;
  participants: string[];
  decisions: number;
  actions: number;
  file?: string;
}

interface IntelligenceItem {
  type: "Decision" | "Action" | "Insight" | "Quote" | "Risk" | "Run";
  title: string;
  source: string;
  date: string;
  confidence: string;
  tone: "ok" | "warn" | "critical" | "proposal";
}

interface DecisionEntry {
  date: string;
  decision: string;
  rationale: string;
  owner: string;
  source: string;
  documents: string[];
  status: "Logged" | "Linked" | "Proposal pending" | "Applied" | "Rejected";
}

interface ProposalEntry {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  doc: string;
  source: string;
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" ? value as RawRecord : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function titleFromId(id: string) {
  return id
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateFromName(name: string) {
  return name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function titleFromPathName(name: string) {
  return name
    .replace(/\.(md|txt)$/i, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || titleFromId(name);
}

function normalizeSource(source: string) {
  if (source.toLowerCase().startsWith("google drive")) return "Google Drive";
  if (source.toLowerCase().startsWith("notion")) return "Notion";
  if (source.toLowerCase().startsWith("slack")) return "Slack";
  if (source.toLowerCase().startsWith("discord")) return "Discord";
  return source || "Manual";
}

function normalizeStatus(raw: RawRecord): MeetingRecord["status"] {
  const status = asString(raw.status).toLowerCase();
  if (status === "needs review" || status === "duplicate" || status === "low confidence") return status;
  if (status === "processed" || raw.processed === true) return "processed";
  return "needs review";
}

function normalizeMeeting(value: unknown): MeetingRecord | null {
  const raw = asRecord(value);
  const id = asString(raw.id);
  const date = asString(raw.date);
  if (!id && !date) return null;
  const source = asString(raw.source, "Manual");
  const participants = asStringArray(raw.participants);
  return {
    id: id || `${date}-${asString(raw.title, "meeting").toLowerCase().replace(/\s+/g, "-")}`,
    title: asString(raw.title) || titleFromId(id),
    date,
    time: asString(raw.time),
    source: normalizeSource(source),
    sourceId: asString(raw.sourceId) || source.split(" - ")[1] || undefined,
    status: normalizeStatus(raw),
    type: asString(raw.type, "meeting"),
    participants,
    decisions: asNumber(raw.decisions),
    actions: asNumber(raw.actions),
    file: asString(raw.file) || undefined,
  };
}

function readMeetingIndex(slug: string) {
  const rootIndex = path.join(meetingIntelligenceDir(slug), "meetings.json");
  const nestedIndex = path.join(meetingIntelligenceDir(slug), "meetings", "meetings.json");
  const rootData = readJSON<RawRecord>(rootIndex, {});
  const nestedData = readJSON<RawRecord>(nestedIndex, {});
  const data = Array.isArray(rootData.meetings) && rootData.meetings.length ? rootData : nestedData;
  let meetings = (Array.isArray(data.meetings) ? data.meetings : [])
    .map(normalizeMeeting)
    .filter((meeting): meeting is MeetingRecord => Boolean(meeting))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  if (meetings.length === 0) meetings = readMeetingFiles(slug);
  return {
    meetings,
    lastSync: asString(data.lastSync) || asString(data.lastUpdated) || asString(data._lastCheckTime) || null,
    lastCheckStatus: asString(data._lastCheckStatus) || null,
    totals: {
      meetings: asNumber(data.totalMeetings, meetings.length),
      decisions: asNumber(data.totalDecisions, meetings.reduce((sum, meeting) => sum + meeting.decisions, 0)),
      actions: asNumber(data.totalActions, meetings.reduce((sum, meeting) => sum + meeting.actions, 0)),
    },
  };
}

function readMeetingFiles(slug: string) {
  const dir = path.join(meetingIntelligenceDir(slug), "meetings");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => !entry.startsWith(".") && entry !== "meetings.json")
    .map((entry) => {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      const file = stat.isDirectory()
        ? fs.existsSync(path.join(fullPath, "summary.md"))
          ? path.join(entry, "summary.md")
          : path.join(entry, "transcript.md")
        : entry;
      return {
        id: entry.replace(/\.(md|txt)$/i, ""),
        title: titleFromPathName(entry),
        date: dateFromName(entry),
        time: "",
        source: "Workspace",
        status: "processed" as const,
        type: "meeting",
        participants: [],
        decisions: 0,
        actions: 0,
        file,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function latestJsonFromDir(dir: string) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse();
  const file = files[0];
  if (!file) return null;
  return {
    file: path.join(dir, file),
    date: file.replace(".json", ""),
    data: readJSON<RawRecord>(path.join(dir, file), {}),
  };
}

function loadLatestRun(slug: string) {
  const direct = latestJsonFromDir(meetingIntelligenceDir(slug));
  const recurring = latestJsonFromDir(path.join(BASE, "brand", slug, "recurring-tasks", "meeting-intelligence"));
  if (!direct) return recurring;
  if (!recurring) return direct;
  return direct.date >= recurring.date ? direct : recurring;
}

function trimTitle(value: unknown, fallback: string) {
  const text = asString(value, fallback).replace(/\s+/g, " ").trim();
  return text.length > 150 ? `${text.slice(0, 147)}...` : text;
}

function fromStructuredRun(run: RawRecord, runDate: string) {
  const intelligence = asRecord(run.intelligence);
  const decisionsRaw = Array.isArray(intelligence.decisions) ? intelligence.decisions.map(asRecord) : [];
  const actionsRaw = Array.isArray(intelligence.action_items) ? intelligence.action_items.map(asRecord) : [];
  const insightsRaw = Array.isArray(intelligence.insights) ? intelligence.insights.map(asRecord) : [];
  const quotesRaw = Array.isArray(intelligence.quotes) ? intelligence.quotes.map(asRecord) : [];
  const risksRaw = Array.isArray(intelligence.risks) ? intelligence.risks.map(asRecord) : [];

  const items: IntelligenceItem[] = [
    ...decisionsRaw.slice(0, 5).map((item) => ({
      type: "Decision" as const,
      title: trimTitle(item.decision, "Decision detected"),
      source: asString(item.source, "Meeting Intelligence"),
      date: asString(item.date, runDate),
      confidence: "logged",
      tone: "ok" as const,
    })),
    ...actionsRaw.slice(0, 4).map((item) => ({
      type: "Action" as const,
      title: trimTitle(item.task, "Action item detected"),
      source: asString(item.source, "Meeting Intelligence"),
      date: asString(item.deadline, runDate),
      confidence: "owner check",
      tone: "warn" as const,
    })),
    ...insightsRaw.slice(0, 5).map((item) => ({
      type: "Insight" as const,
      title: trimTitle(item.insight, "Insight detected"),
      source: asString(item.source, "Meeting Intelligence"),
      date: runDate,
      confidence: asString(item.type, "insight"),
      tone: "proposal" as const,
    })),
    ...quotesRaw.slice(0, 3).map((item) => ({
      type: "Quote" as const,
      title: trimTitle(item.quote, "Quote detected"),
      source: asString(item.source, "Meeting Intelligence"),
      date: runDate,
      confidence: asString(item.speaker, "source quote"),
      tone: "ok" as const,
    })),
    ...risksRaw.slice(0, 4).map((item) => ({
      type: "Risk" as const,
      title: trimTitle(item.description, "Risk detected"),
      source: asString(item.source, "Meeting Intelligence"),
      date: runDate,
      confidence: asString(item.impact, "risk"),
      tone: asString(item.impact) === "high" ? "critical" as const : "warn" as const,
    })),
  ];

  const decisions: DecisionEntry[] = decisionsRaw.map((item) => ({
    date: asString(item.date, runDate),
    decision: trimTitle(item.decision, "Decision detected"),
    rationale: asString(item.rationale, "Pending review"),
    owner: asString(item.owner, "TBD"),
    source: asString(item.source, "Meeting Intelligence"),
    documents: ["POV Bank", "StrategyPlan"],
    status: "Logged",
  }));

  const proposalsRaw = Array.isArray(run.proposals) ? run.proposals.map(asRecord) : [];
  const proposals: ProposalEntry[] = proposalsRaw.map((item, index) => ({
    id: asString(item.id, `PROP-${String(index + 1).padStart(3, "0")}`),
    title: trimTitle(item.title || item.change, "Review proposed change"),
    priority: asString(item.priority) === "high" || asString(item.priority) === "low" ? asString(item.priority) as "high" | "low" : "medium",
    doc: asString(item.doc || item.document, "POV Bank"),
    source: asString(item.source, "Meeting Intelligence"),
  }));

  return { items, decisions, proposals };
}

function fromMarkdownRun(content: string, runDate: string) {
  const items: IntelligenceItem[] = [];
  const decisions: DecisionEntry[] = [];
  let section = "";
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (/decisiones clave/i.test(line)) section = "decision";
    else if (/acciones pendientes/i.test(line)) section = "action";
    else if (/insights/i.test(line)) section = "insight";
    else if (/^#{1,4}\s/.test(line)) section = "";
    const bullet = line.replace(/^[-*]\s+/, "").replace(/^✅\s*/, "").trim();
    if (!bullet || bullet === line || !section) continue;
    const type = section === "decision" ? "Decision" : section === "action" ? "Action" : "Insight";
    const tone = section === "decision" ? "ok" : section === "action" ? "warn" : "proposal";
    items.push({
      type,
      title: trimTitle(bullet, `${type} detected`),
      source: "Meeting Intelligence run",
      date: runDate,
      confidence: "parsed",
      tone,
    });
    if (section === "decision") {
      decisions.push({
        date: runDate,
        decision: trimTitle(bullet, "Decision detected"),
        rationale: "Parsed from latest Meeting Intelligence run; pending human review.",
        owner: "TBD",
        source: "Meeting Intelligence run",
        documents: ["POV Bank", "StrategyPlan"],
        status: "Logged",
      });
    }
  }
  if (items.length === 0 && content.trim()) {
    items.push({
      type: "Run",
      title: trimTitle(content, "Meeting Intelligence run completed"),
      source: "Meeting Intelligence run",
      date: runDate,
      confidence: "run",
      tone: "ok",
    });
  }
  return { items, decisions, proposals: [] as ProposalEntry[] };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const index = readMeetingIndex(slug);
  const latestRun = loadLatestRun(slug);
  const runData = latestRun?.data || {};
  const runDate = asString(runData.date, latestRun?.date || "");
  const structured = asRecord(runData.intelligence);
  const extracted = Object.keys(structured).length
    ? fromStructuredRun(runData, runDate)
    : fromMarkdownRun(asString(runData.content), runDate);
  const actionItems = Array.isArray(structured.action_items) ? structured.action_items : [];
  const runMeetings = Array.isArray(runData.meetings_processed) ? runData.meetings_processed : [];
  const totals = {
    meetings: index.totals.meetings || runMeetings.length || index.meetings.length,
    decisions: index.totals.decisions || extracted.decisions.length,
    actions: index.totals.actions || actionItems.length,
  };

  return res.status(200).json({
    ok: true,
    meetings: index.meetings,
    totals,
    intelligence: extracted.items,
    decisions: extracted.decisions,
    proposals: extracted.proposals,
    lastSync: index.lastSync,
    lastCheckStatus: index.lastCheckStatus,
    lastRun: latestRun ? {
      date: runDate,
      status: asString(runData.status, "ok"),
      file: path.relative(BASE, latestRun.file),
      contentPreview: trimTitle(runData.content, ""),
    } : null,
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
