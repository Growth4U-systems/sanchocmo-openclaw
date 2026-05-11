import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";

const DRIVE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const apiKey = readEnv("NEXT_PUBLIC_GOOGLE_PICKER_API_KEY", "GOOGLE_PICKER_API_KEY");
  const clientId = readEnv(
    "NEXT_PUBLIC_GOOGLE_PICKER_CLIENT_ID",
    "GOOGLE_PICKER_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_CLIENT_ID"
  );
  const appId = readEnv(
    "NEXT_PUBLIC_GOOGLE_PICKER_APP_ID",
    "GOOGLE_PICKER_APP_ID",
    "GOOGLE_CLOUD_PROJECT_NUMBER"
  );

  const missing = [
    !apiKey ? "GOOGLE_PICKER_API_KEY" : null,
    !clientId ? "GOOGLE_PICKER_CLIENT_ID" : null,
  ].filter(Boolean);

  return res.status(200).json({
    ok: true,
    configured: missing.length === 0,
    apiKey: missing.length === 0 ? apiKey : "",
    clientId: missing.length === 0 ? clientId : "",
    appId,
    scope: DRIVE_METADATA_SCOPE,
    missing,
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
