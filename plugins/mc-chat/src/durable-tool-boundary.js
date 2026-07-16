const DIRECT_READ_ONLY_TOOLS = new Set([
  "agents_list",
  "file_read",
  "glob",
  "grep",
  "image",
  "memory_get",
  "memory_search",
  "read",
  "session_status",
  "sessions_history",
  "sessions_list",
  "tool_search",
  "web_fetch",
  "web_search",
  "x_search",
]);

// These tools mutate only the agent's local working state. They remain useful
// for Sancho's document workflows, but are never available to a read-only
// Growie turn. Anything able to reach an arbitrary process, service, browser,
// session or MCP server is intentionally absent.
const DIRECT_INTERNAL_TOOLS = new Set([
  "apply_patch",
  "edit",
  "update_plan",
  "write",
]);

const BLOCK_REASON =
  "Este turno durable solo puede usar herramientas internas/de lectura o adapters nativos que admiten el efecto en Ledger. La herramienta solicitada no está autorizada.";
const CORRELATION_BLOCK_REASON =
  "No se pudo vincular la herramienta de forma inequívoca con su turno durable. La ejecución fue bloqueada.";

function canonicalToolName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function distinctTurns(values) {
  return [...new Set(values.filter(Boolean))];
}

export function createDurableToolBoundary({ ledgerAdmissionTools = [] } = {}) {
  const allowedLedgerAdmissions = new Set(
    ledgerAdmissionTools.map(canonicalToolName).filter(Boolean),
  );
  const activeByRunId = new Map();
  const activeBySessionKey = new Map();

  function registerTurn({ runId, sessionKey, readOnly = false } = {}) {
    const safeRunId = nonEmptyString(runId);
    const safeSessionKey = nonEmptyString(sessionKey);
    if (!safeRunId || !safeSessionKey) return null;

    const turn = Object.freeze({
      runId: safeRunId,
      sessionKey: safeSessionKey,
      readOnly: readOnly === true,
    });
    activeByRunId.set(safeRunId, turn);
    activeBySessionKey.set(safeSessionKey, turn);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (activeByRunId.get(safeRunId) === turn) {
        activeByRunId.delete(safeRunId);
      }
      if (activeBySessionKey.get(safeSessionKey) === turn) {
        activeBySessionKey.delete(safeSessionKey);
      }
    };
  }

  function turnFor(event, context) {
    const turns = distinctTurns([
      activeByRunId.get(nonEmptyString(event?.runId)),
      activeByRunId.get(nonEmptyString(context?.runId)),
      activeBySessionKey.get(nonEmptyString(context?.sessionKey)),
    ]);
    if (turns.length > 1) return { conflict: true, turn: null };
    return { conflict: false, turn: turns[0] ?? null };
  }

  function beforeToolCall(event, context = {}) {
    const resolved = turnFor(event, context);
    if (resolved.conflict) {
      return { block: true, blockReason: CORRELATION_BLOCK_REASON };
    }
    if (!resolved.turn) {
      // Legacy and tenants outside the durable canary retain their existing
      // OpenClaw policy. This boundary only narrows an explicitly registered
      // durable turn.
      return undefined;
    }

    const toolName = canonicalToolName(event?.toolName ?? event?.name);
    if (DIRECT_READ_ONLY_TOOLS.has(toolName)) return undefined;
    if (
      !resolved.turn.readOnly &&
      (DIRECT_INTERNAL_TOOLS.has(toolName) ||
        allowedLedgerAdmissions.has(toolName))
    ) {
      return undefined;
    }
    return { block: true, blockReason: BLOCK_REASON };
  }

  return Object.freeze({ beforeToolCall, registerTurn });
}
