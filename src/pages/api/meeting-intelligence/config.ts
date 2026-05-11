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

function normalizeConfig(slug: string, input: Partial<MeetingIntelligenceConfig>): MeetingIntelligenceConfig {
  const base = defaultConfig(slug);
  return {
    ...base,
    ...input,
    slug,
    updatedAt: new Date().toISOString(),
    sources: {
      googleDrive: { ...base.sources.googleDrive, ...input.sources?.googleDrive },
      notion: { ...base.sources.notion, ...input.sources?.notion },
      slack: { ...base.sources.slack, ...input.sources?.slack },
      discord: { ...base.sources.discord, ...input.sources?.discord },
      manualUpload: { ...base.sources.manualUpload, ...input.sources?.manualUpload },
    },
    routing: { ...base.routing, ...input.routing },
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const filePath = meetingIntelligenceConfigFile(slug);
    const config = readJSON<MeetingIntelligenceConfig>(filePath, defaultConfig(slug));
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
