import type {
  CreateExecutionRunInput,
  ExecutionControlRepository,
  ExecutionOriginControlRepository,
} from "@/lib/execution-control";
import {
  parseDurableExecutionOrigin,
  type DurableExecutionOrigin,
} from "@/lib/durable-execution";

export class TrustedExecutionOriginRepositoryError extends Error {
  readonly code = "trusted_execution_origin_invalid" as const;

  constructor() {
    super("Trusted execution origin is invalid");
    this.name = "TrustedExecutionOriginRepositoryError";
  }
}

/**
 * Narrow expand-phase adapter for V1 admissions that have not yet adopted the
 * generic `trustedOrigin` argument. Only the explicitly named operations are
 * decorated. The origin is server-attested and overwrites any caller metadata;
 * model/public JSON never reaches this function.
 *
 * Delete this adapter after Partnerships setup/discovery moves to the generic
 * V2 admission boundary, where `trustedOrigin` is native.
 */
export function withTrustedExecutionOrigin(
  repository: ExecutionControlRepository,
  input: {
    origin: DurableExecutionOrigin;
    operations: readonly string[];
  },
): ExecutionControlRepository {
  const origin = parseDurableExecutionOrigin(input.origin);
  const operations = new Set(
    input.operations.map((operation) => operation.trim().toLowerCase()),
  );
  if (!origin || operations.size < 1 || operations.has("")) {
    throw new TrustedExecutionOriginRepositoryError();
  }

  const createRun = (command: CreateExecutionRunInput) => {
    const operation = command.operation.trim().toLowerCase();
    if (!operations.has(operation)) return repository.createRun(command);
    const trusted = repository as ExecutionControlRepository &
      Partial<
        Pick<ExecutionOriginControlRepository, "createRunWithTrustedOrigin">
      >;
    if (typeof trusted.createRunWithTrustedOrigin !== "function") {
      throw new TrustedExecutionOriginRepositoryError();
    }
    return trusted.createRunWithTrustedOrigin({ command, origin });
  };

  return new Proxy(repository, {
    get(target, property) {
      if (property === "createRun") return createRun;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
