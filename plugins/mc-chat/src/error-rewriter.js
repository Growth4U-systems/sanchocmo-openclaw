// OpenClaw plugin compatibility shim. The implementation lives in Sancho's
// runtime-neutral agent contract so other adapters can reuse it.
export {
  classifyAndRewriteError,
  mergeWithPriorCategory,
} from "../../../src/lib/runtime/agent-contract/error-rewriter.mjs";
