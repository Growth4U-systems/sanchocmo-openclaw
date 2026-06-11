import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { BASE, brandDir, foundationStateFile } from "@/lib/data/paths";

/**
 * GET /api/brand-brain/download?slug=X
 * Streams a zip with all Brand Brain documents (.md + .html) for a brand.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const stateFile = foundationStateFile(slug);
  if (!fs.existsSync(stateFile)) {
    return res.status(404).json({ error: "Brand Brain state not found" });
  }

  const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  const sections = state.sections || {};

  const docPaths: { filePath: string; zipName: string }[] = [];

  for (const [secKey, secData] of Object.entries(sections) as [string, { pillars?: Record<string, { output_file?: string }> }][]) {
    if (secKey === "foundation-presentation") continue;
    const pillars = secData.pillars || {};
    for (const [pName, pInfo] of Object.entries(pillars)) {
      if (!pInfo.output_file) continue;
      const fullPath = path.resolve(path.join(BASE, pInfo.output_file));
      if (!fullPath.startsWith(path.resolve(BASE))) continue;
      if (!fs.existsSync(fullPath)) continue;
      const ext = path.extname(pInfo.output_file);
      docPaths.push({ filePath: fullPath, zipName: `${secKey}/${pName}${ext}` });
    }
  }

  const presentations = state.presentations || [];
  for (const pres of presentations) {
    if (!pres.file) continue;
    const fullPath = path.resolve(path.join(brandDir(slug), pres.file));
    if (!fullPath.startsWith(path.resolve(BASE))) continue;
    if (!fs.existsSync(fullPath)) continue;
    docPaths.push({ filePath: fullPath, zipName: `presentations/${pres.name || path.basename(pres.file)}${path.extname(pres.file)}` });
  }

  if (docPaths.length === 0) {
    return res.status(404).json({ error: "No documents found" });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}-brand-brain.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err) => { res.status(500).end(); throw err; });
  archive.pipe(res);

  for (const doc of docPaths) {
    archive.file(doc.filePath, { name: doc.zipName });
  }

  await archive.finalize();
}

export default compose(withErrorHandler, withAuth)(handler);
