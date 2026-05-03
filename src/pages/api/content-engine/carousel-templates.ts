import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { listAllCarouselTemplates, listCarouselTemplates } from "@/lib/carousel/templates";

/**
 * GET /api/content-engine/carousel-templates?slug=X&channel=linkedin
 *   → templates the brand has enabled, optionally filtered by channel.
 *
 * GET /api/content-engine/carousel-templates?slug=X&channel=linkedin&all=1
 *   → ALL templates including disabled. Used by the Setup UI to render the
 *     enable/disable toggles. Each entry includes `enabled: boolean`.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = (req.query.slug as string | undefined) || undefined;
  const channel = (req.query.channel as string | undefined) || undefined;
  const showAll = req.query.all === "1";

  const enabledList = listCarouselTemplates({ slug, channel });
  const enabledIds = new Set(enabledList.map((t) => t.id));
  const source = showAll ? listAllCarouselTemplates(channel, slug) : enabledList;

  const templates = source.map((t) => ({
    id: t.id,
    name: t.name,
    channel: t.channel,
    description: t.description,
    slideCount: t.slideCount,
    width: t.width,
    height: t.height,
    slots: t.slots,
    preview: t.preview ?? null,
    enabled: enabledIds.has(t.id),
  }));
  return res.status(200).json({ templates });
}

export default withErrorHandler(handler);
