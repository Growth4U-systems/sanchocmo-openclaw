import { readBrandSecret } from "@/lib/brand-env";
import type {
  GenerateInput,
  GenerateResult,
  ImageProvider,
} from "@/lib/image-gen/types";

/**
 * FAL.ai — runs Flux + a wide selection of community models. Uses the
 * synchronous /run endpoint so we don't need to poll.
 *
 * NOTE: this provider is registered but kept lightweight; if FAL_API_KEY is
 * missing, `inspect()` returns not-configured and the registry hides it.
 */

const MODELS = [
  { id: "fal-ai/flux/schnell", label: "FAL · Flux Schnell", default: true },
  { id: "fal-ai/flux/dev", label: "FAL · Flux Dev" },
];

const IMAGE_SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "square_hd",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
};

function loadKey(slug: string): string | undefined {
  return readBrandSecret(slug, "fal", "API_KEY") || process.env.FAL_API_KEY;
}

export const falProvider: ImageProvider = {
  id: "fal",
  name: "FAL.ai",
  models: MODELS,
  capabilities: {
    aspectRatios: Object.keys(IMAGE_SIZE_BY_RATIO),
  },

  inspect(slug) {
    const key = loadKey(slug);
    return key ? { configured: true } : { configured: false, missing: "Falta FAL_API_KEY." };
  },

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const key = loadKey(input.slug);
    if (!key) return { ok: false, error: "FAL API key no encontrada" };

    const model = input.model && MODELS.some((m) => m.id === input.model)
      ? input.model
      : MODELS[0].id;
    const imageSize = IMAGE_SIZE_BY_RATIO[input.aspectRatio] || "square_hd";

    try {
      const res = await fetch(`https://fal.run/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.prompt,
          image_size: imageSize,
          num_images: 1,
          enable_safety_checker: true,
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `FAL ${res.status}: ${err.slice(0, 300)}` };
      }
      const data = (await res.json()) as { images?: Array<{ url?: string; content_type?: string }> };
      const remoteUrl = data.images?.[0]?.url;
      if (!remoteUrl) return { ok: false, error: "FAL no devolvió URL de imagen" };

      const imageRes = await fetch(remoteUrl);
      if (!imageRes.ok) return { ok: false, error: `Descarga falló (${imageRes.status})` };
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const mime = data.images?.[0]?.content_type || "image/jpeg";
      return { ok: true, buffer, mimeType: mime, model };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
