import type { NextApiRequest, NextApiResponse } from "next";
import { execFileSync } from "child_process";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { apiHealthFile } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

const GOG_BIN = "/opt/homebrew/bin/gog";
const FOLDER_MIME = "application/vnd.google-apps.folder";

interface DriveItem {
  id?: string;
  name?: string;
  title?: string;
  mimeType?: string;
  webViewLink?: string;
  url?: string;
  modifiedTime?: string;
}

function parseItems(raw: unknown): DriveItem[] {
  if (Array.isArray(raw)) return raw as DriveItem[];
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const key of ["files", "items", "data", "results"]) {
    const val = obj[key];
    if (Array.isArray(val)) return val as DriveItem[];
  }
  return [];
}

function getAccount(): string | null {
  const data = readJSON<{ services?: Record<string, { details?: Record<string, unknown> }> }>(apiHealthFile(), {});
  const account = data.services?.gog?.details?.account;
  return typeof account === "string" && account ? account : process.env.GOG_ACCOUNT || null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const account = getAccount();
  if (!account) {
    return res.status(200).json({ ok: false, error: "Google Workspace account not found in api-health.", folders: [] });
  }

  const q = String(req.query.q || "").trim();
  const parent = String(req.query.parent || "").trim();
  const args = ["--account", account, "drive"];
  if (q) {
    args.push("search", q, "--json", "--max", "40");
  } else {
    args.push(
      "ls",
      "--json",
      "--max",
      "80",
      "--query",
      `mimeType='${FOLDER_MIME}' and trashed=false`
    );
    if (parent) args.push("--parent", parent);
  }

  try {
    const stdout = execFileSync(GOG_BIN, args, { encoding: "utf-8", timeout: 20_000 });
    const parsed = JSON.parse(stdout);
    const items = parseItems(parsed);
    const folders = items
      .filter((item) => !item.mimeType || item.mimeType === FOLDER_MIME)
      .map((item) => ({
        id: item.id || "",
        name: item.name || item.title || "Untitled folder",
        mimeType: item.mimeType || FOLDER_MIME,
        url: item.webViewLink || item.url || (item.id ? `https://drive.google.com/drive/folders/${item.id}` : ""),
        modifiedTime: item.modifiedTime || null,
      }))
      .filter((item) => item.id);

    return res.status(200).json({ ok: true, account, folders });
  } catch (error) {
    const err = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    return res.status(200).json({
      ok: false,
      account,
      error: (stderr || stdout || err.message || "Google Drive browse failed").slice(0, 600),
      folders: [],
    });
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
