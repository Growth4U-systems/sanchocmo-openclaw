import { readJSON, writeJSON } from "./json-io";
import { strategiesCatalogFile } from "./paths";

export function loadStrategiesCatalog(): unknown {
  return readJSON(strategiesCatalogFile(), {});
}

export function saveStrategiesCatalog(data: unknown): void {
  writeJSON(strategiesCatalogFile(), data);
}
