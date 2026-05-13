import { readBrandSecret } from "@/lib/brand-env";
import type {
  GenerateInput,
  GenerateResult,
  ImageProvider,
} from "@/lib/image-gen/types";

/**
 * Replicate — runs hosted models like flux-schnell / flux-dev / sdxl. Uses
 * Replicate's per-model `predictions` endpoint with `Prefer: wait` so we get
 * the finished prediction synchronously (and poll if the model is slow).
 */

const MODELS = [
  { id: "black-forest-labs/flux-schnell", label: "Flux Schnell (rápido, ~5s)", default: true },
  { id: "black-forest-labs/flux-dev", label: "Flux Dev (mejor calidad, ~15s)" },
  { id: "stability-ai/sdxl", label: "Stable Diffusion XL" },
];

function loadToken(slug: string): string | undefined {
  return (
    readBrandSecret(slug, "replicate", "API_TOKEN") ||
    readBrandSecret(slug, "replicate", "API_KEY") ||
    process.env.REPLICATE_API_TOKEN
  );
}

export const replicateProvider: ImageProvider = {
  id: "replicate",
  name: "Replicate",
  models: MODELS,
  capabilities: {
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "1.91:1", "21:9", "2:3", "3:2"],
  },

  inspect(slug) {
    const tok = loadToken(slug);
    return tok ? { configured: true } : { configured: false, missing: "Falta REPLICATE_API_TOKEN." };
  },

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const token = loadToken(input.slug);
    if (!token) return { ok: false, error: "Replicate token no encontrado" };

    const model = input.model && MODELS.some((m) => m.id === input.model)
      ? input.model
      : MODELS[0].id;

    const startUrl = `https://api.replicate.com/v1/models/${model}/predictions`;
    const body = {
      input: {
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio,
        num_outputs: 1,
        output_format: "png",
      },
    };

    let prediction: ReplicatePrediction;
    try {
      const startRes = await fetch(startUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify(body),
      });
      if (!startRes.ok) {
        const errBody = await startRes.text().catch(() => "");
        return { ok: false, error: `Replicate ${startRes.status}: ${errBody.slice(0, 300)}` };
      }
      prediction = (await startRes.json()) as ReplicatePrediction;

      while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
        await sleep(1500);
        const pollRes = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` } });
        if (!pollRes.ok) return { ok: false, error: `Replicate poll ${pollRes.status}` };
        prediction = (await pollRes.json()) as ReplicatePrediction;
      }

      if (prediction.status !== "succeeded") {
        return { ok: false, error: prediction.error || `Generation ${prediction.status}` };
      }

      const remoteUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!remoteUrl || typeof remoteUrl !== "string") {
        return { ok: false, error: "Replicate no devolvió URL de imagen" };
      }
      const imageRes = await fetch(remoteUrl);
      if (!imageRes.ok) return { ok: false, error: `Descarga falló (${imageRes.status})` };
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      return { ok: true, buffer, mimeType: "image/png", model };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls: { get: string; cancel: string };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
