import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { brandDir, meetingIntelligenceConfigFile } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

interface SourceScope {
  id: string;
  name: string;
  url?: string;
  notes?: string;
  filter?: {
    property?: string;
    propertyId?: string;
    propertyType?: string;
    operator?: string;
    value?: string;
  };
}

interface MeetingIntelligenceConfig {
  slug: string;
  enabled: boolean;
  updatedAt: string | null;
  sources: {
    googleDrive: {
      enabled: boolean;
      includeSubfolders: boolean;
      folders: SourceScope[];
    };
    notion: {
      enabled: boolean;
      databases: SourceScope[];
      pages: SourceScope[];
    };
    slack: {
      enabled: boolean;
      channels: SourceScope[];
      includeThreads: boolean;
    };
    discord: {
      enabled: boolean;
      channels: SourceScope[];
      includeThreads: boolean;
    };
    manualUpload: {
      enabled: boolean;
    };
  };
  routing: {
    publishChannel: string;
    reviewOwner: string;
    defaultTimezone: string;
  };
}

interface ClientConfig {
  channels?: Record<string, string>;
  crons?: {
    meeting_intelligence?: {
      enabled?: boolean;
      publish_channel?: string;
      google_drive_folder_id?: string;
      tz?: string;
    };
    daily_pulse?: {
      tz?: string;
    };
  };
}

function emptyScope(): SourceScope {
  return { id: "", name: "", url: "", notes: "" };
}

function defaultConfig(slug: string): MeetingIntelligenceConfig {
  const clientConfig = readJSON<ClientConfig>(path.join(brandDir(slug), "client-config.json"), {});
  const meetingCron = clientConfig.crons?.meeting_intelligence || {};
  const publishChannel = meetingCron.publish_channel || "intelligence";
  const driveFolderId = meetingCron.google_drive_folder_id || "";

  return {
    slug,
    enabled: Boolean(meetingCron.enabled ?? true),
    updatedAt: null,
    sources: {
      googleDrive: {
        enabled: Boolean(driveFolderId),
        includeSubfolders: true,
        folders: driveFolderId
          ? [{ id: driveFolderId, name: "Meeting notes folder", url: "", notes: "Seeded from client-config.json" }]
          : [emptyScope()],
      },
      notion: {
        enabled: false,
        databases: [emptyScope()],
        pages: [],
      },
      slack: {
        enabled: false,
        channels: [],
        includeThreads: true,
      },
      discord: {
        enabled: Boolean(clientConfig.channels?.[publishChannel]),
        channels: clientConfig.channels?.[publishChannel]
          ? [{ id: clientConfig.channels[publishChannel], name: publishChannel, notes: "Publish/review channel" }]
          : [],
        includeThreads: true,
      },
      manualUpload: {
        enabled: true,
      },
    },
    routing: {
      publishChannel,
      reviewOwner: "Alfonso",
      defaultTimezone: meetingCron.tz || clientConfig.crons?.daily_pulse?.tz || "Europe/Madrid",
    },
  };
}

function normalizeScope(input: unknown): SourceScope {
  if (!input || typeof input !== "object") return emptyScope();
  const scope = input as Record<string, unknown>;
  const id = typeof scope.id_dashed === "string" ? scope.id_dashed : typeof scope.id === "string" ? scope.id : "";
  const notes = typeof scope.notes === "string"
    ? scope.notes
    : typeof scope.description === "string"
      ? scope.description
      : "";
  return {
    id,
    name: typeof scope.name === "string" ? scope.name : "",
    url: typeof scope.url === "string" ? scope.url : "",
    notes,
    filter: scope.filter && typeof scope.filter === "object"
      ? scope.filter as SourceScope["filter"]
      : undefined,
  };
}

function normalizeScopeList(input: unknown, fallback: SourceScope[], keepEmpty = true) {
  const scopes = Array.isArray(input) ? input.map(normalizeScope) : fallback;
  if (scopes.length) return scopes;
  return keepEmpty ? [emptyScope()] : [];
}

function normalizeConfig(slug: string, input: Partial<MeetingIntelligenceConfig>, touch = true): MeetingIntelligenceConfig {
  const base = defaultConfig(slug);
  type RawSources = Partial<MeetingIntelligenceConfig["sources"]> & {
    google_drive?: { enabled?: boolean; folders?: unknown[] };
  };
  type RawRouting = Partial<MeetingIntelligenceConfig["routing"]> & {
    review_owner?: string;
    timezone?: string;
    target?: string;
  };
  const raw = input as Partial<MeetingIntelligenceConfig> & {
    client?: string;
    sources?: RawSources;
    routing?: RawRouting;
  };
  const rawSources: RawSources = raw.sources || {};
  const legacyDrive = rawSources.google_drive;
  const rawGoogleDrive: Partial<MeetingIntelligenceConfig["sources"]["googleDrive"]> = rawSources.googleDrive || {};
  const rawNotion: Partial<MeetingIntelligenceConfig["sources"]["notion"]> = rawSources.notion || {};
  const rawSlack: Partial<MeetingIntelligenceConfig["sources"]["slack"]> = rawSources.slack || {};
  const rawDiscord: Partial<MeetingIntelligenceConfig["sources"]["discord"]> = rawSources.discord || {};
  const rawManualUpload: Partial<MeetingIntelligenceConfig["sources"]["manualUpload"]> = rawSources.manualUpload || {};
  const rawRouting: RawRouting = raw.routing || {};

  return {
    ...base,
    ...input,
    slug,
    enabled: Boolean(input.enabled ?? base.enabled),
    updatedAt: touch ? new Date().toISOString() : input.updatedAt || base.updatedAt,
    sources: {
      googleDrive: {
        ...base.sources.googleDrive,
        ...rawGoogleDrive,
        enabled: Boolean(rawGoogleDrive.enabled ?? legacyDrive?.enabled ?? base.sources.googleDrive.enabled),
        includeSubfolders: Boolean(rawGoogleDrive.includeSubfolders ?? base.sources.googleDrive.includeSubfolders),
        folders: normalizeScopeList(rawGoogleDrive.folders ?? legacyDrive?.folders, base.sources.googleDrive.folders),
      },
      notion: {
        ...base.sources.notion,
        ...rawNotion,
        enabled: Boolean(rawNotion.enabled ?? base.sources.notion.enabled),
        databases: normalizeScopeList(rawNotion.databases, base.sources.notion.databases),
        pages: normalizeScopeList(rawNotion.pages, [], false),
      },
      slack: {
        ...base.sources.slack,
        ...rawSlack,
        enabled: Boolean(rawSlack.enabled ?? base.sources.slack.enabled),
        channels: normalizeScopeList(rawSlack.channels, []).filter((scope) => scope.id || scope.name || scope.url),
        includeThreads: Boolean(rawSlack.includeThreads ?? base.sources.slack.includeThreads),
      },
      discord: {
        ...base.sources.discord,
        ...rawDiscord,
        enabled: Boolean(rawDiscord.enabled ?? base.sources.discord.enabled),
        channels: normalizeScopeList(rawDiscord.channels, []).filter((scope) => scope.id || scope.name || scope.url),
        includeThreads: Boolean(rawDiscord.includeThreads ?? base.sources.discord.includeThreads),
      },
      manualUpload: {
        ...base.sources.manualUpload,
        ...rawManualUpload,
        enabled: Boolean(rawManualUpload.enabled ?? base.sources.manualUpload.enabled),
      },
    },
    routing: {
      ...base.routing,
      ...rawRouting,
      publishChannel: rawRouting.publishChannel || rawRouting.target || base.routing.publishChannel,
      reviewOwner: rawRouting.reviewOwner || rawRouting.review_owner || base.routing.reviewOwner,
      defaultTimezone: rawRouting.defaultTimezone || rawRouting.timezone || base.routing.defaultTimezone,
    },
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const filePath = meetingIntelligenceConfigFile(slug);
    const config = normalizeConfig(slug, readJSON<Partial<MeetingIntelligenceConfig>>(filePath, defaultConfig(slug)), false);
    return res.status(200).json({ ok: true, config });
  }

  if (req.method === "PUT" || req.method === "POST") {
    const nextConfig = normalizeConfig(slug, req.body?.config || req.body || {});
    writeJSON(meetingIntelligenceConfigFile(slug), nextConfig);
    return res.status(200).json({ ok: true, config: nextConfig });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
