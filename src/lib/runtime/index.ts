import { OpenclawAdapter } from "./adapters/openclaw";
import { HermesAdapter } from "./adapters/hermes";
import { ExternalHttpAdapter } from "./adapters/http";
import { FakeRuntimeAdapter } from "./adapters/fake";
import { readRuntimeSelection, type RuntimeId } from "./config";
import type { RuntimeAdapter } from "./types";

let cachedRuntime: RuntimeAdapter | null = null;
let cachedRuntimeId: RuntimeId | null = null;

export function createRuntimeAdapter(runtime: RuntimeId): RuntimeAdapter {
  switch (runtime) {
    case "openclaw":
      return new OpenclawAdapter();
    case "hermes":
      return new HermesAdapter();
    case "external-http":
      return new ExternalHttpAdapter();
    case "fake":
      return new FakeRuntimeAdapter();
  }
}

export function getRuntime(): RuntimeAdapter {
  const selection = readRuntimeSelection();
  // runtime-config.json is shared by every Next process. Key the cache by the
  // persisted selection instead of keeping the first adapter forever so a
  // change made by another worker is observed without a process restart.
  if (cachedRuntime && cachedRuntimeId === selection.runtime) {
    return cachedRuntime;
  }
  cachedRuntime = createRuntimeAdapter(selection.runtime);
  cachedRuntimeId = selection.runtime;
  return cachedRuntime;
}

export function resetRuntimeCache(): void {
  cachedRuntime = null;
  cachedRuntimeId = null;
}

export function resetRuntimeForTests(): void {
  resetRuntimeCache();
}

export {
  RUNTIME_IDS,
  RUNTIME_OPTIONS,
  PUBLIC_RUNTIME_IDS,
  isRuntimeConfigured,
  isRuntimeId,
  readRuntimeSelection,
  resolveRuntimeId,
  runtimeConfigFile,
  writeRuntimeSelection,
  type RuntimeId,
  type RuntimeOptionMeta,
  type RuntimeSelection,
  type RuntimeSelectionSource,
} from "./config";

export type {
  InboundMessage,
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeCapability,
  RuntimeCancelOptions,
  RuntimeControl,
  RuntimeLifecycle,
  RuntimeMessaging,
  RuntimeModelAssignment,
  RuntimeModelInput,
  RuntimeJobEndedAt,
  RuntimeRunningCron,
  RuntimeState,
  SendInboundOptions,
  SendInboundResult,
} from "./types";
