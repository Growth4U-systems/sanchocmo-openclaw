import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const EXEC_PATH = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
const GOG_PATH = "gog";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { email, authUrl } = req.body;
  if (!email || !authUrl) {
    return res.status(400).json({ error: "Falta email o authUrl (redirect URL)" });
  }

  try {
    const output = execSync(
      `${GOG_PATH} auth add "${email}" --remote --step 2 --auth-url "${authUrl}" --plain 2>&1`,
      { timeout: 30000, encoding: "utf-8", env: { ...process.env, PATH: EXEC_PATH } }
    );

    return res.status(200).json({ ok: true, detail: output.trim() });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
