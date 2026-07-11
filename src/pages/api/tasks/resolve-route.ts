import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  createTask,
  findTaskByThreadId,
} from "@/lib/data/tasks";
import {
  resolveSameGroupTaskRoute,
  type SameGroupTaskRouteResolution,
} from "@/lib/data/task-routing";
import { getRuntime } from "@/lib/runtime";
import { canonicalThreadId } from "@/lib/thread-id";

const AGENT_TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

interface RouteRequestBody {
  slug?: unknown;
  sourceThreadId?: unknown;
  sourceTaskId?: unknown;
  groupId?: unknown;
  targetTaskId?: unknown;
  targetThreadId?: unknown;
  agent?: unknown;
  skill?: unknown;
  skills?: unknown;
  name?: unknown;
  brief?: unknown;
  confirmCreate?: unknown;
}

function optionalText(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function routeToken(value: unknown): string | undefined {
  const token = optionalText(value, 128)?.toLowerCase();
  return token && AGENT_TOKEN_RE.test(token) ? token : undefined;
}

function routeSlug(value: string, maxLength = 48): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "task";
}

function proposedThreadId(slug: string, groupId: string, agent: string, name: string): string {
  return canonicalThreadId(
    `${slug}:delegate-${routeSlug(groupId, 32)}-${routeSlug(agent, 32)}-${routeSlug(name)}`,
  );
}

function ambiguousMessage(resolution: Extract<SameGroupTaskRouteResolution, { kind: "ambiguous" }>): string {
  const options = resolution.candidates.slice(0, 8).map((candidate) => ({
    id: candidate.taskId,
    label: `${candidate.taskName} (${candidate.taskId})`,
  }));
  options.push({ id: "create_new", label: "Crear una tarea nueva" });
  options.push({ id: "other", label: "Otro (lo escribo)" });
  return [
    `Encontré varias tareas compatibles dentro de **${resolution.groupId || "este grupo"}**. No voy a elegir una a ciegas.`,
    ":::ask",
    JSON.stringify({
      id: "q_task_route",
      prompt: "¿Qué tarea corresponde?",
      mode: "single",
      options,
    }),
    ":::"
  ].join("\n");
}

function createSuggestionMessage(
  resolution: Extract<SameGroupTaskRouteResolution, { kind: "suggest_create" }>,
  name: string,
): string {
  const outside = resolution.reason === "explicit_target_outside_group"
    ? `La tarea indicada pertenece a otro grupo; no la voy a reutilizar desde **${resolution.groupId}**. `
    : "";
  return [
    `${outside}No encontré una tarea activa que corresponda dentro de **${resolution.groupId}**.`,
    `Sugiero crear **${name}** en ese mismo grupo.`,
    ":::ask",
    JSON.stringify({
      id: "q_task_create",
      prompt: `¿Creo la tarea “${name}” dentro de ${resolution.groupId} y ejecuto allí?`,
      mode: "single",
      options: [
        { id: "yes", label: "Sí, crear y ejecutar", recommended: true },
        { id: "no", label: "No, seguir aquí" },
        { id: "other", label: "Otro (lo escribo)" },
      ],
    }),
    ":::"
  ].join("\n");
}

function groupRequiredMessage(): string {
  return [
    "Esta conversación no está vinculada de forma inequívoca a un grupo/proyecto, así que no voy a crear una tarea suelta.",
    ":::ask",
    JSON.stringify({
      id: "q_task_group",
      prompt: "¿Dentro de qué grupo/proyecto debe resolverse esta tarea?",
      mode: "text",
      placeholder: "Nombre o ID del grupo",
      optional: false,
    }),
    ":::"
  ].join("\n");
}

function taskIdOf(task: unknown): string | undefined {
  if (!task || typeof task !== "object") return undefined;
  const id = (task as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Internal adapter endpoint. It is called by the MC Chat runtime, not by the
 * browser. The current runtime shared secret is therefore the trust boundary,
 * matching `/api/chat/webhook` and `/api/chat/context-pack`.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = getRuntime().messaging.getSharedSecret?.();
  if (secret && req.headers["x-mc-secret"] !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const body = (req.body || {}) as RouteRequestBody;
  const slug = optionalText(body.slug, 128);
  const agent = routeToken(body.agent);
  const name = optionalText(body.name, 180);
  const brief = optionalText(body.brief, 8_000);
  if (!slug || !agent || !name || !brief) {
    return res.status(400).json({ error: "slug, agent, name and brief are required" });
  }

  const skill = routeToken(body.skill);
  const skills = Array.isArray(body.skills)
    ? Array.from(new Set(body.skills.map(routeToken).filter((item): item is string => Boolean(item))))
    : undefined;
  const resolution = await resolveSameGroupTaskRoute({
    clientSlug: slug,
    sourceThreadId: optionalText(body.sourceThreadId, 300),
    sourceTaskId: optionalText(body.sourceTaskId, 160),
    groupId: optionalText(body.groupId, 160),
    targetTaskId: optionalText(body.targetTaskId, 160),
    targetThreadId: optionalText(body.targetThreadId, 300),
    requestedAgent: agent,
    requestedSkill: skill,
    requestedName: name,
  });

  if (resolution.kind === "reuse") {
    return res.status(200).json({
      ok: true,
      action: "reuse",
      resolution,
      taskId: resolution.target.taskId,
      threadId: resolution.target.targetThreadId,
      threadName: resolution.target.taskName,
    });
  }

  const confirmed = body.confirmCreate === true;
  const creationGroup = resolution.kind === "suggest_create" || resolution.kind === "ambiguous"
    ? resolution.groupId
    : null;
  if (confirmed && creationGroup) {
    const threadId = proposedThreadId(slug, creationGroup, agent, name);
    const existing = await findTaskByThreadId(slug, threadId);
    const task = existing || await createTask(slug, {
      name,
      description: brief,
      brief,
      status: "todo",
      type: "execution",
      parent_id: creationGroup,
      owner: agent,
      agent,
      skill,
      skills,
      mc_chat_thread_id: threadId,
    });
    return res.status(existing ? 200 : 201).json({
      ok: true,
      action: existing ? "reuse" : "created",
      resolution,
      task,
      taskId: taskIdOf(task),
      threadId,
      threadName: name,
    });
  }

  if (resolution.kind === "ambiguous") {
    return res.status(200).json({
      ok: true,
      action: "ambiguous",
      requiresTaskSelection: true,
      resolution,
      message: ambiguousMessage(resolution),
    });
  }
  if (resolution.kind === "suggest_create") {
    return res.status(200).json({
      ok: true,
      action: "suggest_create",
      requiresConfirmation: true,
      resolution,
      proposal: {
        groupId: resolution.groupId,
        name,
        agent,
        skill,
        threadId: proposedThreadId(slug, resolution.groupId, agent, name),
      },
      message: createSuggestionMessage(resolution, name),
    });
  }

  return res.status(200).json({
    ok: true,
    action: "group_required",
    requiresGroupSelection: true,
    resolution,
    message: groupRequiredMessage(),
  });
}

export default withErrorHandler(handler);
