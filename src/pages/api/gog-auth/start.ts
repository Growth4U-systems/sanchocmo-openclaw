import { EXEC_PATH } from "@/lib/data/paths";
import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const GOG_PATH = "gog";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { email, services } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Email inv\u00e1lido" });
  }

  const svcList = services || "gmail,calendar,drive,contacts,sheets";

  try {
    const output = execSync(
      `${GOG_PATH} auth add "${email}" --remote --step 1 --services "${svcList}" --force-consent --plain 2>&1`,
      { timeout: 15000, encoding: "utf-8", env: { ...process.env, PATH: EXEC_PATH } }
    );

    const urlMatch = output.match(/auth_url\t(https:\/\/[^\s]+)/);
    if (urlMatch) {
      return res.status(200).json({ ok: true, authUrl: urlMatch[1], email });
    } else {
      return res.status(500).json({
        error: "No se pudo generar la URL de autorizaci\u00f3n",
        output: output.slice(0, 500),
      });
    }
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
