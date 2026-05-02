import { readBrandSecret } from "@/lib/brand-env";
import type {
  GenerateInput,
  GenerateResult,
  ImageProvider,
} from "@/lib/image-gen/types";

/**
 * Nano Banana — Google's gemini-2.5-flash-image-preview (and successors).
 * Uses the Gemini API key (shared workspace-level by default). Aspect ratios
 * are conveyed via the prompt; the model honors them best when stated
 * explicitly ("square 1:1", "vertical 9:16", etc.).
 */

const MODELS = [
  { id: "gemini-2.5-flash-image-preview", label: "Gemini 2.5 Flash Image (Nano Banana Pro)", default: true },
  { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash Image (legacy)" },
];

const ASPECT_HINTS: Record<string, string> = {
  "1:1": "square 1:1 composition",
  "16:9": "horizontal 16:9 widescreen composition",
  "9:16": "vertical 9:16 portrait composition",
  "1.91:1": "1.91:1 LinkedIn feed wide composition",
  "4:3": "4:3 horizontal composition",
  "3:4": "3:4 portrait composition",
};

function loadKey(slug: string): string | undefined {
  // Brand-scoped first, then global GEMINI_API_KEY (shared infra).
  return (
    readBrandSecret(slug, "gemini", "API_KEY") ||
    readBrandSecret(slug, "nanobanana", "API_KEY") ||
    process.env.GEMINI_API_KEY
  );
}

export const nanobananaProvider: ImageProvider = {
  id: "nanobanana",
  name: "Nano Banana (Gemini)",
  models: MODELS,
  capabilities: {
    aspectRatios: ["1:1", "16:9", "9:16", "1.91:1", "4:3", "3:4"],
  },

  inspect(slug) {
    const key = loadKey(slug);
    return key
      ? { configured: true }
      : { configured: false, missing: "Falta GEMINI_API_KEY (compartida) o credencial de Nano Banana." };
  },

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const key = loadKey(input.slug);
    if (!key) return { ok: false, error: "Gemini API key no encontrada" };

    const model = input.model && MODELS.some((m) => m.id === input.model)
      ? input.model
      : MODELS[0].id;

    const aspectHint = ASPECT_HINTS[input.aspectRatio] || "";
    const fullPrompt = aspectHint
      ? `${input.prompt}\n\nFormato: ${aspectHint}.`
      : input.prompt;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `Gemini ${res.status}: ${err.slice(0, 300)}` };
      }
      const data = (await res.json()) as GeminiResponse;
      const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      const inline = part?.inlineData;
      if (!inline?.data) {
        return { ok: false, error: "Gemini no devolvió imagen (modelo puede haber rechazado el prompt)" };
      }
      const buffer = Buffer.from(inline.data, "base64");
      return {
        ok: true,
        buffer,
        mimeType: inline.mimeType || "image/png",
        model,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }>;
}
