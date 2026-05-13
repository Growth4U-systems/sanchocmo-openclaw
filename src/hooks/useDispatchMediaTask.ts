import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface DispatchMediaTaskBody {
  slug: string;
  prompt: string;
  skill?: string;
  upstreamSkill?: string;
  designSystemId?: string;
  kind?: "template" | "mockup" | "logo" | "style-reference" | "export" | "design-md" | "misc";
  context?: Record<string, unknown>;
  source?: string;
}

export interface DispatchMediaTaskResponse {
  ok: boolean;
  taskId: string;
  inboxPath: string;
  task: Record<string, unknown>;
}

/** Crea una task type=media y la deposita en el inbox de Maese Pedro. */
export function useDispatchMediaTask() {
  const qc = useQueryClient();
  return useMutation<DispatchMediaTaskResponse, Error, DispatchMediaTaskBody>({
    mutationFn: async (body) => {
      const res = await fetch("/api/media-tasks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "dispatch failed"));
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["brand-assets", variables.slug] });
    },
  });
}
