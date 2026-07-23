/**
 * Stable durable marker for the one synthetic terminal that a correlated
 * runtime callback may replace. Keep the user-facing error and machine code
 * together so the worker and the compare-and-set cannot drift independently.
 */
export const AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE =
  "runtime_committed_worker_lost" as const;

export const AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR =
  "El runtime se reinició después de iniciar este turno. No lo reejecuté para evitar duplicar búsquedas, herramientas o cambios. Puedes reintentarlo con seguridad." as const;
