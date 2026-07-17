/**
 * Version of the original runtime/adapter protocol (not a product command
 * schema). Existing handlers and runs deliberately stay on this literal.
 */
export const DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION = 1 as const;

/**
 * Contract with statically registered, runtime-owned effects. Merely knowing
 * this version does not authorize an old worker to execute it: workers must
 * also implement the matching executor and resolve the version frozen on the
 * run.
 */
export const DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 = 2 as const;

export type DurableExecutionHandlerContractVersion =
  | typeof DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
  | typeof DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2;

export function isDurableExecutionHandlerContractVersion(
  value: unknown,
): value is DurableExecutionHandlerContractVersion {
  return (
    value === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION ||
    value === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
  );
}
