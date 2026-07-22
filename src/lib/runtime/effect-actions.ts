import {
  admitLeadsSearchFromAgent,
  LeadsSearchAgentBridgeError,
} from "@/lib/leads/search-agent-bridge";
import {
  admitPartnershipsDiscoveryFromAgent,
  PartnershipsDiscoveryAgentBridgeError,
} from "@/lib/runtime/partnerships-discovery-agent-bridge";
import {
  getAgentRunByIdAsync,
  type AgentRun,
} from "@/lib/data/agent-runs";
import { createHash, timingSafeEqual } from "node:crypto";

export type RuntimeEffectName =
  | "leads_search_start"
  | "partnerships_discovery_start";

export const RUNTIME_EFFECT_ORIGIN_MODE = "execution-origin-v1" as const;

export interface RuntimeEffectRequest {
  name: RuntimeEffectName;
  arguments: Record<string, unknown>;
}

export interface RuntimeEffectTurnContext {
  slug: string;
  threadId: string;
  missionControlRunId?: string;
  /** Raw one-turn value revalidated against the exact persisted run digest. */
  parentCapability?: string;
  traceId?: string;
  userId?: string;
  controlDepth?: number;
  temporaryAgent?: boolean;
  isAdmin: boolean;
  senderRole: "admin" | "client";
  readOnly?: boolean;
}

type LeadsAdmissionPort = typeof admitLeadsSearchFromAgent;
type PartnershipsAdmissionPort = typeof admitPartnershipsDiscoveryFromAgent;
type RuntimeEffectParentRun = Pick<
  AgentRun,
  "id" | "threadId" | "status" | "input"
>;
type ResolveParentRunPort = (
  runId: string,
) => Promise<RuntimeEffectParentRun | null>;

export interface RuntimeEffectActionDependencies {
  admitLeadsSearch?: LeadsAdmissionPort;
  admitPartnershipsDiscovery?: PartnershipsAdmissionPort;
  resolveParentRun?: ResolveParentRunPort;
}

export interface RuntimeEffectDispatchResult {
  dispatched: number;
  messages: string[];
}

function normalizedIntentText(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

/**
 * Derive the only effects the current human message explicitly authorizes.
 * History, attachments and model output are deliberately excluded: they are
 * untrusted context and cannot mint spend-bearing intent.
 */
export function resolveRuntimeEffectIntent(
  userText: unknown,
): RuntimeEffectName[] {
  const text = normalizedIntentText(userText);
  if (!text) return [];
  const denied =
    /\b(?:no|nunca)\s+(?:(?:quiero|necesito|debes|vayas a)\s+)?(?:buscar|busques|encontrar|encuentres|iniciar|inicies|ejecutar|ejecutes|generar|generes|crear|crees|find|search|start|run|generate|create)\b/.test(
      text,
    );
  if (denied) return [];
  const directAction =
    /^(?:por favor\s+|please\s+)?(?:busca|buscar|buscame|encuentra|encontrar|inicia|iniciar|ejecuta|ejecutar|genera|generar|crea|crear|find|search|start|run|generate|create)\b/.test(
      text,
    ) ||
    /\b(?:quiero|necesito|puedes|podrias|please)\b.{0,60}\b(?:buscar|busques|encontrar|encuentres|iniciar|inicies|ejecutar|ejecutes|generar|generes|crear|crees|find|search|start|run|generate|create)\b/.test(
      text,
    );
  if (!directAction) return [];

  const names: RuntimeEffectName[] = [];
  if (
    /\b(?:leads?|prospectos?|contactos?|founders?|fundadores?|decisores?|decision makers?)\b/.test(
      text,
    ) || /\bbusqueda de (?:personas|perfiles)\b/.test(text)
  ) {
    names.push("leads_search_start");
  }
  if (
    /\b(?:partnerships?|partners?|alianzas?|socios?|colaboraciones?|influencers?|creadores?)\b/.test(
      text,
    )
  ) {
    names.push("partnerships_discovery_start");
  }
  return names;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function leadsArguments(value: unknown): {
  criteria: Record<string, unknown>;
  limit?: number;
} | null {
  const input = plainRecord(value);
  const criteria = plainRecord(input?.criteria);
  if (
    !input ||
    !criteria ||
    !Object.hasOwn(input, "criteria") ||
    Object.keys(input).some((key) => key !== "criteria" && key !== "limit")
  ) {
    return null;
  }
  return {
    criteria,
    ...(input.limit === undefined ? {} : { limit: input.limit as number }),
  };
}

export function isRuntimeEffectTurnEligible(
  context: Pick<
    RuntimeEffectTurnContext,
    | "userId"
    | "controlDepth"
    | "temporaryAgent"
    | "isAdmin"
    | "senderRole"
    | "readOnly"
  >,
): boolean {
  return Boolean(
    context.isAdmin === true &&
      context.senderRole === "admin" &&
      context.userId === "mc-admin" &&
      (context.controlDepth ?? 0) === 0 &&
      context.temporaryAgent !== true &&
      context.readOnly === false,
  );
}

function capabilityMatchesDigest(
  capability: string,
  expectedDigest: unknown,
): boolean {
  if (
    typeof expectedDigest !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedDigest)
  ) {
    return false;
  }
  const actual = createHash("sha256").update(capability).digest();
  const expected = Buffer.from(expectedDigest, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

async function authorized(
  requests: RuntimeEffectRequest[],
  context: RuntimeEffectTurnContext,
  dependencies: RuntimeEffectActionDependencies,
): Promise<boolean> {
  if (
    !context.missionControlRunId ||
    !context.parentCapability ||
    !isRuntimeEffectTurnEligible(context)
  ) {
    return false;
  }

  try {
    const parent = await (
      dependencies.resolveParentRun ?? getAgentRunByIdAsync
    )(context.missionControlRunId);
    const input = plainRecord(parent?.input);
    const allowedEffects = Array.isArray(input?.runtimeEffectIntent)
      ? input.runtimeEffectIntent.filter(
          (name): name is RuntimeEffectName =>
            name === "leads_search_start" ||
            name === "partnerships_discovery_start",
        )
      : [];
    return Boolean(
      parent?.id === context.missionControlRunId &&
        parent.threadId === context.threadId &&
        (parent.status === "queued" || parent.status === "running") &&
        input?.runtimeEffectMode === RUNTIME_EFFECT_ORIGIN_MODE &&
        requests.length > 0 &&
        requests.every((request) => allowedEffects.includes(request.name)) &&
        input.slug === context.slug &&
        input.threadId === context.threadId &&
        input.userId === context.userId &&
        input.isAdmin === true &&
        input.senderRole === "admin" &&
        input.readOnly === false &&
        (input.controlDepth === undefined || input.controlDepth === 0) &&
        input.temporaryAgent !== true &&
        capabilityMatchesDigest(
          context.parentCapability,
          input.runtimeToolCapabilitySha256,
        ),
    );
  } catch {
    // Authority lookup is part of admission. Storage failure must fail closed
    // without turning a runtime's terminal callback into a 500/retry storm.
    return false;
  }
}

function successMessage(
  name: RuntimeEffectName,
  receipt: { replayed?: boolean },
): string {
  const replay = receipt.replayed === true;
  if (name === "leads_search_start") {
    return replay
      ? "ℹ️ Esta búsqueda de leads ya estaba admitida; no inicié otra. El resultado aparecerá en este mismo chat."
      : "✅ Búsqueda de leads admitida en la ejecución durable. El resultado aparecerá en este mismo chat.";
  }
  return replay
    ? "ℹ️ Este discovery de partnerships ya estaba admitido; no inicié otro. El resultado aparecerá en este mismo chat."
    : "✅ Discovery de partnerships admitido en la ejecución durable. El resultado aparecerá en este mismo chat.";
}

function failureMessage(name: RuntimeEffectName, error: unknown): string {
  const typedStatus =
    error instanceof LeadsSearchAgentBridgeError ||
    error instanceof PartnershipsDiscoveryAgentBridgeError
      ? error.status
      : undefined;
  const structuralStatus =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  const status =
    typedStatus ??
    (typeof structuralStatus === "number" &&
    [400, 403, 409, 503].includes(structuralStatus)
      ? structuralStatus
      : 503);
  if (status === 400) {
    return name === "leads_search_start"
      ? "⚠️ No inicié la búsqueda de leads: los criterios no cumplen el contrato acotado."
      : "⚠️ No inicié el discovery de partnerships: el plan no cumple el contrato acotado.";
  }
  if (status === 403) {
    return name === "leads_search_start"
      ? "⚠️ La búsqueda durable de leads no está habilitada o autorizada para este cliente. No inicié ninguna ejecución."
      : "⚠️ El discovery durable de partnerships no está habilitado o autorizado para este cliente. No inicié ninguna ejecución.";
  }
  if (status === 409) {
    return "⚠️ Este turno ya está vinculado a otra orden durable. No inicié un segundo efecto.";
  }
  return name === "leads_search_start"
    ? "⚠️ La búsqueda durable de leads no está disponible temporalmente. No inicié ninguna ejecución alternativa."
    : "⚠️ El discovery durable de partnerships no está disponible temporalmente. No inicié ninguna ejecución alternativa.";
}

/**
 * Admit model-requested effects inside the trusted control plane. Runtime
 * transports never choose tenant, origin, credentials, callbacks or execution
 * mode; all of them derive from the exact authenticated parent AgentRun.
 */
export async function dispatchRuntimeEffectActions(
  requests: RuntimeEffectRequest[],
  context: RuntimeEffectTurnContext,
  dependencies: RuntimeEffectActionDependencies = {},
): Promise<RuntimeEffectDispatchResult> {
  const result: RuntimeEffectDispatchResult = { dispatched: 0, messages: [] };
  if (requests.length === 0) return result;
  if (!(await authorized(requests, context, dependencies))) {
    result.messages.push(
      "⚠️ No inicié la operación solicitada porque este turno no tiene autoridad administrativa de escritura.",
    );
    return result;
  }

  const agentRunId = context.missionControlRunId as string;
  for (const request of requests) {
    try {
      if (request.name === "leads_search_start") {
        const input = leadsArguments(request.arguments);
        if (!input) {
          result.messages.push(failureMessage(request.name, { status: 400 }));
          continue;
        }
        const admitted = await (
          dependencies.admitLeadsSearch ?? admitLeadsSearchFromAgent
        )(
          {
            tenantSlug: context.slug,
            agentRunId,
            ...(context.traceId ? { traceId: context.traceId } : {}),
          },
          input,
        );
        result.dispatched += 1;
        result.messages.push(successMessage(request.name, admitted.receipt));
        continue;
      }

      if (request.name === "partnerships_discovery_start") {
        const admitted = await (
          dependencies.admitPartnershipsDiscovery ??
          admitPartnershipsDiscoveryFromAgent
        )(
          {
            tenantSlug: context.slug,
            threadId: context.threadId,
            agentRunId,
          },
          request.arguments,
        );
        result.dispatched += 1;
        result.messages.push(successMessage(request.name, admitted.receipt));
      }
    } catch (error) {
      result.messages.push(failureMessage(request.name, error));
    }
  }
  return result;
}
