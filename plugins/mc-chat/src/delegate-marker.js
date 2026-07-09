// OpenClaw plugin compatibility shim. The implementation lives in Sancho's
// runtime-neutral agent contract so other adapters can reuse it.
export {
  DELEGATE_AGENTS,
  parseDelegateMarkers,
  slugForThread,
} from "../../../src/lib/runtime/agent-contract/delegate-marker.mjs";
