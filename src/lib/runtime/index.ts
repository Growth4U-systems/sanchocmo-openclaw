import { OpenclawAdapter } from "./adapters/openclaw";
import { HermesAdapter } from "./adapters/hermes";
import { ExternalHttpAdapter } from "./adapters/http";
import { FakeRuntimeAdapter } from "./adapters/fake";
import { readRuntimeSelection, type RuntimeId } from "./config";
import type { RuntimeAdapter } from "./types";

let cachedRuntime: RuntimeAdapter | null = null;

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
  if (cachedRuntime) return cachedRuntime;

  const selection = readRuntimeSelection();
  cachedRuntime = createRuntimeAdapter(selection.runtime);
  return cachedRuntime;
}

export function resetRuntimeCache(): void {
  cachedRuntime = null;
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
  RuntimeJobEndedAt,
  RuntimeRunningCron,
  RuntimeState,
  SendInboundOptions,
  SendInboundResult,
} from "./types";
