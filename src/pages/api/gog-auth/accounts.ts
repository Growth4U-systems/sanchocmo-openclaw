import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const EXEC_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const output = execSync("/opt/homebrew/bin/gog auth list --json 2>&1", {
      timeout: 10000,
      encoding: "utf-8",
      env: { ...process.env, PATH: EXEC_PATH },
    });
    // Output is already JSON
    return res.status(200).json(JSON.parse(output));
  } catch {
    return res.status(200).json([]);
  }
}

export default compose(withErrorHandler, withAuth)(handler);
