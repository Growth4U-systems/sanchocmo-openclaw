import { readJSON, safeWriteJSON } from "./json-io";
import { foundationStateFile } from "./paths";
import type { FoundationState } from "@/types";

const EMPTY_STATE: FoundationState = {
  version: "3.0",
  started_at: "",
  updated_at: "",
  brand_summary: {
    company_name: "",
    sector: "",
    description: "",
    north_star: "",
    icps: [],
    competitors: [],
    positioning: "",
  },
  sections: {},
  presentations: [],
};

export function loadFoundationState(slug: string): FoundationState {
  return readJSON<FoundationState>(foundationStateFile(slug), EMPTY_STATE);
}

export function saveFoundationState(slug: string, state: FoundationState): void {
  state.updated_at = new Date().toISOString();
  safeWriteJSON(foundationStateFile(slug), state, (d) => {
    const s = d as FoundationState;
    return !!s.sections;
  });
}
