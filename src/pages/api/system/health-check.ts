/**
 * GET /api/system/health-check?service=all|<serviceId>
 * Compatibility alias for the authenticated, typed health-check handler.
 */
export { healthCheckHandler } from "./health-check-all";
export { default } from "./health-check-all";
