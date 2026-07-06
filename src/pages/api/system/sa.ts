import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const saPath = path.join(BASE, ".secrets", "google-service-account.json");

  if (req.method === "GET") {
    try {
      const sa = JSON.parse(fs.readFileSync(saPath, "utf-8"));
      return res.status(200).json({
        configured: true,
        email: sa.client_email,
        projectId: sa.project_id,
      });
    } catch {
      return res.status(200).json({ configured: false });
    }
  }

  if (req.method === "POST") {
    const sa = req.body;
    if (!sa.client_email || !sa.private_key) {
      return res.status(400).json({
        error: "Invalid service account JSON: missing client_email or private_key",
      });
    }

    const secretsDir = path.join(BASE, ".secrets");
    fs.mkdirSync(secretsDir, { recursive: true });
    fs.writeFileSync(saPath, JSON.stringify(sa, null, 2), "utf-8");

    return res.status(200).json({
      ok: true,
      email: sa.client_email,
      projectId: sa.project_id,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
