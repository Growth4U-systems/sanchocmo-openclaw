import type { DurableExecutionHandlerV2 } from "../../durable-execution/effect-contract.ts";
import type {
  DurableJsonBounds,
  DurableJsonContract,
} from "../../durable-execution/json-contract.ts";

export interface TerminalProjectionCrashValue {
  value: string;
}

const bounds: DurableJsonBounds = {
  maxBytes: 2_048,
  maxDepth: 5,
  maxNodes: 32,
  maxStringBytes: 256,
  maxArrayItems: 8,
  maxObjectKeys: 8,
};

const valueContract: DurableJsonContract<TerminalProjectionCrashValue> = {
  schemaVersion: 1,
  bounds,
  secrets: { mode: "reject" },
  parse(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => key !== "value") ||
      typeof (value as { value?: unknown }).value !== "string"
    ) {
      throw new Error("invalid terminal projection crash fixture value");
    }
    return { value: (value as { value: string }).value };
  },
};

export type TerminalProjectionCrashHandler = DurableExecutionHandlerV2<
  TerminalProjectionCrashValue,
  TerminalProjectionCrashValue,
  TerminalProjectionCrashValue,
  Record<string, never>
>;

export function createTerminalProjectionCrashHandler(input: {
  operation: string;
  projectTerminal: TerminalProjectionCrashHandler["projectTerminal"];
  onExecute?: () => void | Promise<void>;
}): TerminalProjectionCrashHandler {
  return {
    contractVersion: 2,
    operation: input.operation,
    version: 1,
    command: valueContract,
    checkpoint: valueContract,
    result: valueContract,
    effects: {},
    async execute(command) {
      await input.onExecute?.();
      return {
        status: "completed",
        currentStep: "completed",
        output: command,
        eventType: `${input.operation}.completed`,
      };
    },
    classifyPureError() {
      return {
        code: "terminal_projection_fixture_failed",
        retryable: false,
        message: "terminal projection fixture failed",
      };
    },
    projectTerminal: input.projectTerminal,
  };
}
