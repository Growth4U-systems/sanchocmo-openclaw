import path from "path";
import { readJSON, writeJSON } from "./json-io";
import { trustEngineDir } from "./paths";

export function loadRunState(slug: string): unknown {
  return readJSON(path.join(trustEngineDir(slug), "run-state.json"), {});
}

export function loadModule(slug: string, moduleName: string): unknown {
  // Validate module name (prevent path traversal)
  if (moduleName.includes("..") || moduleName.includes("/")) {
    throw new Error("Invalid module name");
  }
  const fileName = moduleName.endsWith(".json") ? moduleName : `${moduleName}.json`;
  return readJSON(path.join(trustEngineDir(slug), fileName), {});
}

export function saveModule(slug: string, moduleName: string, data: unknown): void {
  if (moduleName.includes("..") || moduleName.includes("/")) {
    throw new Error("Invalid module name");
  }
  const fileName = moduleName.endsWith(".json") ? moduleName : `${moduleName}.json`;
  writeJSON(path.join(trustEngineDir(slug), fileName), data);
}
