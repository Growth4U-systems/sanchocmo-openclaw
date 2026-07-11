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
import { DELEGATE_AGENTS } from "@/lib/runtime/agent-contract/delegate-marker.mjs";
import {
  consumeTaskRouteProposal,
  discardPendingTaskRouteProposal,
  getPendingTaskRouteProposal,
  isExplicitNewTaskSelection,
  isExplicitTaskCreationConfirmation,
  issueTaskRouteProposal,
  proposalMatches,
} from "@/lib/data/task-route-proposals";

const AGENT_TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const TASK_ROUTE_AGENTS = new Set([...DELEGATE_AGENTS, "sancho"]);

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
  proposalId?: unknown;
  confirmationText?: unknown;
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

function proposedThreadId(slug: string, groupId: string, agent: string, name: string, proposalId?: string): string {
  return canonicalThreadId(
    `${slug}:delegate-${routeSlug(groupId, 32)}-${routeSlug(agent, 32)}-${routeSlug(name)}${proposalId ? `-${routeSlug(proposalId, 8)}` : ""}`,
  );
}

function proposalMarker(proposalId: string): string {
  return `<!-- task-route-proposal:${proposalId} -->`;
}

function proposalQuestionId(prefix: "q_task_route" | "q_task_create", proposalId: string): string {
  return `${prefix}_${proposalId.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 12)}`;
}

function ambiguousMessage(
  resolution: Extract<SameGroupTaskRouteResolution, { kind: "ambiguous" }>,
  proposalId: string,
): string {
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
      id: proposalQuestionId("q_task_route", proposalId),
      prompt: "¿Qué tarea corresponde?",
      mode: "single",
      options,
    }),
    ":::"
    , proposalMarker(proposalId)
  ].join("\n");
}

function createSuggestionMessage(
  resolution: Extract<SameGroupTaskRouteResolution, { kind: "suggest_create" }>,
  name: string,
  proposalId: string,
): string {
  const outside = resolution.reason === "explicit_target_outside_group"
    ? `La tarea indicada pertenece a otro grupo; no la voy a reutilizar desde **${resolution.groupId}**. `
    : "";
  return [
    `${outside}No encontré una tarea activa que corresponda dentro de **${resolution.groupId}**.`,
    `Sugiero crear **${name}** en ese mismo grupo.`,
    ":::ask",
    JSON.stringify({
      id: proposalQuestionId("q_task_create", proposalId),
      prompt: `¿Creo la tarea “${name}” dentro de ${resolution.groupId} y ejecuto allí?`,
      mode: "single",
      options: [
        { id: "yes", label: "Sí, crear y ejecutar", recommended: true },
        { id: "no", label: "No, seguir aquí" },
        { id: "other", label: "Otro (lo escribo)" },
      ],
    }),
    ":::"
    , proposalMarker(proposalId)
  ].join("\n");
}

function groupRequiredMessage(reason?: string): string {
  if (reason === "source_group_mismatch") {
    return "El grupo indicado no coincide con el grupo de la tarea actual. No cambié de grupo, agente ni tarea; elige una tarea dentro del grupo actual.";
  }
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

function taskField(task: unknown, field: string): string | undefined {
  if (!task || typeof task !== "object") return undefined;
  const value = (task as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function confirmationRequiredMessage(reason: string): string {
  return `No creé ninguna tarea: ${reason}. Vuelve a mostrar la propuesta y espera una confirmación explícita del usuario.`;
}

/**
 * Internal adapter endpoint. It is called by the MC Chat runtime, not by the
 * browser. The current runtime shared secret is therefore the trust boundary,
 * matching `/api/chat/webhook` and `/api/chat/context-pack`.
 */
export async function resolveRouteHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = getRuntime().messaging.getSharedSecret?.();
  if (!secret) {
    return res.status(503).json({ error: "Task routing requires MC_CHAT_SECRET" });
  }
  const suppliedSecret = Array.isArray(req.headers["x-mc-secret"])
    ? req.headers["x-mc-secret"][0]
    : req.headers["x-mc-secret"];
  if (suppliedSecret !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const body = (req.body || {}) as RouteRequestBody;
  const slug = optionalText(body.slug, 128);
  const agent = routeToken(body.agent);
  const name = optionalText(body.name, 180);
  const brief = optionalText(body.brief, 8_000);
  const sourceThreadId = optionalText(body.sourceThreadId, 300);
  if (!slug || !agent || !name || !brief || !sourceThreadId) {
    return res.status(400).json({ error: "slug, sourceThreadId, agent, name and brief are required" });
  }
  if (!TASK_ROUTE_AGENTS.has(agent)) {
    return res.status(400).json({ error: `Agent is not routable: ${agent}` });
  }

  const skill = routeToken(body.skill);
  const skills = Array.isArray(body.skills)
    ? Array.from(new Set(body.skills.map(routeToken).filter((item): item is string => Boolean(item))))
    : undefined;
  const resolution = await resolveSameGroupTaskRoute({
    clientSlug: slug,
    sourceThreadId,
    sourceTaskId: optionalText(body.sourceTaskId, 160),
    groupId: optionalText(body.groupId, 160),
    targetTaskId: optionalText(body.targetTaskId, 160),
    targetThreadId: optionalText(body.targetThreadId, 300),
    requestedAgent: agent,
    requestedSkill: skill,
    requestedName: name,
  });

  if (resolution.kind === "no_change") {
    await discardPendingTaskRouteProposal(slug, sourceThreadId);
    return res.status(200).json({
      ok: true,
      action: "no_change",
      resolution,
      taskId: resolution.source.taskId,
      threadId: resolution.source.targetThreadId,
      threadName: resolution.source.taskName,
      message: "La petición sigue perteneciendo a la tarea actual. Mantengo esta tarea y su agente; no abrí ni ejecuté otro hilo.",
    });
  }
  if (resolution.kind === "reuse") {
    await discardPendingTaskRouteProposal(slug, sourceThreadId);
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
  const proposalId = optionalText(body.proposalId, 160);
  const pending = confirmed && proposalId
    ? await getPendingTaskRouteProposal(slug, sourceThreadId)
    : undefined;
  const explicitNewTaskSelection = isExplicitNewTaskSelection(body.confirmationText);
  // A confirmation may create only while the resolver still sees zero
  // compatible tasks, unless the human explicitly chose "Crear una tarea
  // nueva" from an ambiguous candidate list. In that case the candidate set
  // must still be identical to the one the human saw.
  const creationGroup = resolution.kind === "suggest_create"
    ? resolution.groupId
    : resolution.kind === "ambiguous" && explicitNewTaskSelection
      ? resolution.groupId
    : null;
  if (confirmed && creationGroup) {
    if (!proposalId || !pending || pending.id !== proposalId) {
      return res.status(200).json({
        ok: true,
        action: "confirmation_required",
        requiresConfirmation: true,
        message: confirmationRequiredMessage("la confirmación no corresponde a una propuesta pendiente"),
      });
    }
    if (!isExplicitTaskCreationConfirmation(body.confirmationText)) {
      return res.status(200).json({
        ok: true,
        action: "confirmation_required",
        requiresConfirmation: true,
        message: confirmationRequiredMessage("el mensaje humano actual no autoriza crearla"),
      });
    }
    if (!proposalMatches(pending, {
      clientSlug: slug,
      sourceThreadId,
      groupId: creationGroup,
      agent,
      skill,
      skills,
      name,
      brief,
      candidateTaskIds: resolution.kind === "ambiguous"
        ? resolution.candidates.map((candidate) => candidate.taskId)
        : [],
    })) {
      return res.status(200).json({
        ok: true,
        action: "confirmation_required",
        requiresConfirmation: true,
        message: confirmationRequiredMessage("la propuesta o su lista de candidatos cambió de grupo, agente, skill, nombre o brief"),
      });
    }

    // Reserve the one-shot proposal before creating. This is an atomic DELETE
    // in DB mode and a locked remove in JSON mode, so concurrent confirmations
    // cannot both create a task for the same proposal.
    const claimedProposal = await consumeTaskRouteProposal(pending.id);
    if (!claimedProposal || !proposalMatches(claimedProposal, {
      clientSlug: slug,
      sourceThreadId,
      groupId: creationGroup,
      agent,
      skill,
      skills,
      name,
      brief,
      candidateTaskIds: resolution.kind === "ambiguous"
        ? resolution.candidates.map((candidate) => candidate.taskId)
        : [],
    })) {
      return res.status(200).json({
        ok: true,
        action: "confirmation_required",
        requiresConfirmation: true,
        message: confirmationRequiredMessage("la propuesta ya fue consumida o reemplazada"),
      });
    }

    const threadId = proposedThreadId(slug, creationGroup, agent, name, claimedProposal.id);
    const existing = await findTaskByThreadId(slug, threadId);
    if (existing) {
      const status = taskField(existing, "status")?.toLowerCase();
      const parentId = taskField(existing, "parent_id") || taskField(existing, "project_id");
      const existingAgent = taskField(existing, "agent") || taskField(existing, "owner")?.toLowerCase();
      const terminal = [
        "approved",
        "archived",
        "canceled",
        "cancelled",
        "complete",
        "completed",
        "discarded",
        "done",
        "finished",
        "published",
        "rejected",
      ].includes(status || "");
      if (terminal || parentId?.toLowerCase() !== creationGroup.toLowerCase() || existingAgent !== agent) {
        return res.status(409).json({ error: "Task thread collision failed validation" });
      }
    }
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
    const proposal = await issueTaskRouteProposal({
      clientSlug: slug,
      sourceThreadId,
      groupId: resolution.groupId || "",
      agent,
      skill,
      skills,
      name,
      brief,
      candidateTaskIds: resolution.candidates.map((candidate) => candidate.taskId),
    });
    return res.status(200).json({
      ok: true,
      action: "ambiguous",
      requiresTaskSelection: true,
      resolution,
      proposalId: proposal.id,
      message: ambiguousMessage(resolution, proposal.id),
    });
  }
  if (resolution.kind === "suggest_create") {
    const proposal = await issueTaskRouteProposal({
      clientSlug: slug,
      sourceThreadId,
      groupId: resolution.groupId,
      agent,
      skill,
      skills,
      name,
      brief,
      candidateTaskIds: [],
    });
    return res.status(200).json({
      ok: true,
      action: "suggest_create",
      requiresConfirmation: true,
      resolution,
      proposalId: proposal.id,
      proposal: {
        groupId: resolution.groupId,
        name,
        agent,
        skill,
        threadId: proposedThreadId(slug, resolution.groupId, agent, name, proposal.id),
      },
      message: createSuggestionMessage(resolution, name, proposal.id),
    });
  }

  return res.status(200).json({
    ok: true,
    action: "group_required",
    requiresGroupSelection: true,
    resolution,
    message: groupRequiredMessage(resolution.reason),
  });
}

export default withErrorHandler(resolveRouteHandler);
