// OpenClaw plugin compatibility shim. The implementation lives in Sancho's
// runtime-neutral agent contract so other adapters can reuse it.
export {
  buildClientContextBlock,
  buildFoundationDirective,
  fetchContextPack,
  resolveContextPackBaseUrl,
} from "../../../src/lib/runtime/agent-contract/context-pack.mjs";
